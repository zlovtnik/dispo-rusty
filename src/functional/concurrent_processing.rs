//! Concurrent Functional Processing Engine
//!
//! Provides high-level abstractions for executing functional data
//! transformations concurrently across multiple threads while
//! preserving immutability guarantees. This module builds on the
//! parallel iterator primitives to deliver safe, high-throughput
//! processing pipelines that integrate seamlessly with the Actix Web
//! async runtime.
//!
//! # Key Capabilities
//!
//! - `ConcurrentProcessor` orchestrates a dedicated Rayon thread pool
//!   with functional-friendly configuration knobs
//! - Parallel map, filter, fold, and group-by helpers that capture rich
//!   performance metrics via `ParallelResult`
//! - Immutable dataset wrappers (`ImmutableDataset`) that make sharing
//!   read-only data across threads trivial
//! - Asynchronous helpers that bridge Rayon with Actix/Tokio using
//!   `tokio::task::spawn_blocking` or `actix_web::web::block`
//! - Metrics aggregation utilities to summarise concurrent workloads
//!
//! The design emphasises **immutable data**, **pure functions**, and
//! **composable building blocks** so callers can compose functional
//! pipelines without worrying about data races or thread management.

#![allow(dead_code)]
#![allow(unused_variables)]

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use actix_web::error::BlockingError;
use actix_web::web;
use rayon::{ThreadPool, ThreadPoolBuilder};
use tokio::task;

use super::parallel_iterators::{
    ParallelConfig, ParallelIteratorExt, ParallelMetrics, ParallelResult,
};

use thiserror::Error;

/// Error type for concurrent processing failures
#[derive(Debug, Error)]
pub enum ConcurrentProcessingError {
    /// Error raised when a custom Rayon thread pool cannot be constructed
    #[error("Failed to build Rayon thread pool: {0}")]
    ThreadPoolBuild(String),
    /// Error raised when a spawned blocking task is cancelled or panics
    #[error("Blocking task was cancelled or panicked")]
    JoinError,
    /// Error raised when Actix's blocking adapter fails to execute the task
    #[error("Actix blocking task failed: {0}")]
    ActixBlocking(String),
}

/// Immutable dataset wrapper that ensures data can be shared safely across threads.
///
/// Internally uses `Arc<[T]>` to provide cheap clones while preventing mutation.
#[derive(Clone)]
pub struct ImmutableDataset<T> {
    inner: Arc<[T]>,
}

impl<T> ImmutableDataset<T>
where
    T: Clone + Send + Sync + 'static,
{
    /// Create a new immutable dataset from an owned vector.
    pub fn new(data: Vec<T>) -> Self {
        Self {
            inner: Arc::<[T]>::from(data),
        }
    }

    /// Create an immutable dataset from an existing shared slice.
    pub fn from_arc(inner: Arc<[T]>) -> Self {
        Self { inner }
    }

    /// Returns the number of elements in the dataset.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` when the dataset has no elements.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Materialises the shared data into an owned vector.
    ///
    /// This clones each element, preserving immutability of the shared backing slice.
    pub fn to_vec(&self) -> Vec<T> {
        self.inner.iter().cloned().collect()
    }

    /// Provides a read-only slice for inspection without cloning.
    pub fn as_slice(&self) -> &[T] {
        &self.inner
    }
}

/// High-level coordinator for executing functional workloads concurrently.
#[derive(Clone)]
pub struct ConcurrentProcessor {
    pool: Arc<ThreadPool>,
    config: ParallelConfig,
}

impl ConcurrentProcessor {
    /// Construct a processor with the given parallel configuration.
    pub fn new(config: ParallelConfig) -> Result<Self, ConcurrentProcessingError> {
        let mut builder = ThreadPoolBuilder::new();

        if config.thread_pool_size > 0 {
            builder = builder.num_threads(config.thread_pool_size);
        }

        let pool = builder
            .build()
            .map_err(|err| ConcurrentProcessingError::ThreadPoolBuild(err.to_string()))?;

        Ok(Self {
            pool: Arc::new(pool),
            config,
        })
    }

    /// Construct a processor using `ParallelConfig::default()`.
    pub fn try_default() -> Result<Self, ConcurrentProcessingError> {
        Self::new(ParallelConfig::default())
    }

    /// Returns the active parallel configuration.
    pub fn config(&self) -> &ParallelConfig {
        &self.config
    }

    /// Creates a new processor with a different configuration.
    pub fn with_config(&self, config: ParallelConfig) -> Result<Self, ConcurrentProcessingError> {
        Self::new(config)
    }

    /// Executes a parallel map transformation on the provided iterator.
    pub fn map<I, T, U, F>(&self, data: I, transform: F) -> ParallelResult<Vec<U>>
    where
        I: IntoIterator<Item = T>,
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let items: Vec<T> = data.into_iter().collect();

        self.pool
            .install(|| items.into_iter().par_map(&config, transform))
    }

    /// Executes a parallel map operation against an immutable dataset.
    pub fn map_dataset<T, U, F>(
        &self,
        data: &ImmutableDataset<T>,
        transform: F,
    ) -> ParallelResult<Vec<U>>
    where
        T: Clone + Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + 'static,
    {
        let owned = data.to_vec();
        self.map(owned, transform)
    }

    /// Parallel fold/reduce operation.
    pub fn fold<I, T, B, F, C>(&self, data: I, init: B, fold: F, combine: C) -> ParallelResult<B>
    where
        I: IntoIterator<Item = T>,
        T: Send + Sync + 'static,
        B: Send + Clone + Sync + 'static,
        F: Fn(B, T) -> B + Send + Sync + 'static,
        C: Fn(B, B) -> B + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let items: Vec<T> = data.into_iter().collect();

        self.pool
            .install(|| items.into_iter().par_fold(&config, init, fold, combine))
    }

    /// Parallel filter operation that preserves order.
    pub fn filter<I, T, Filt>(&self, data: I, predicate: Filt) -> ParallelResult<Vec<T>>
    where
        I: IntoIterator<Item = T>,
        T: Clone + Send + Sync + 'static,
        Filt: Fn(&T) -> bool + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let items: Vec<T> = data.into_iter().collect();

        self.pool
            .install(|| items.into_iter().par_filter(&config, predicate))
    }

    /// Parallel group-by operation using a key function.
    pub fn group_by<I, T, K, KeyFn>(
        &self,
        data: I,
        key_fn: KeyFn,
    ) -> ParallelResult<HashMap<K, Vec<T>>>
    where
        I: IntoIterator<Item = T>,
        T: Clone + Send + Sync + 'static,
        K: std::hash::Hash + Eq + Clone + Send + Sync + 'static,
        KeyFn: Fn(&T) -> K + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let items: Vec<T> = data.into_iter().collect();

        self.pool
            .install(|| items.into_iter().par_group_by(&config, key_fn))
    }

    /// Asynchronous parallel map using Tokio's blocking adapter.
    pub async fn map_async<I, T, U, F>(
        &self,
        data: I,
        transform: F,
    ) -> Result<ParallelResult<Vec<U>>, ConcurrentProcessingError>
    where
        I: IntoIterator<Item = T> + Send + 'static,
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let pool = self.pool.clone();
        let items: Vec<T> = data.into_iter().collect();

        task::spawn_blocking(move || pool.install(|| items.into_iter().par_map(&config, transform)))
            .await
            .map_err(|_| ConcurrentProcessingError::JoinError)
    }

    /// Asynchronous parallel fold using Tokio's blocking adapter.
    pub async fn fold_async<I, T, B, F, C>(
        &self,
        data: I,
        init: B,
        fold: F,
        combine: C,
    ) -> Result<ParallelResult<B>, ConcurrentProcessingError>
    where
        I: IntoIterator<Item = T> + Send + 'static,
        T: Send + Sync + 'static,
        B: Send + Clone + Sync + 'static,
        F: Fn(B, T) -> B + Send + Sync + 'static,
        C: Fn(B, B) -> B + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let pool = self.pool.clone();
        let items: Vec<T> = data.into_iter().collect();

        task::spawn_blocking(move || {
            pool.install(|| items.into_iter().par_fold(&config, init, fold, combine))
        })
        .await
        .map_err(|_| ConcurrentProcessingError::JoinError)
    }

    /// Runs a parallel map inside Actix Web's blocking helper, enabling usage directly inside handlers.
    pub async fn map_actix_blocking<I, T, U, F>(
        &self,
        data: I,
        transform: F,
    ) -> Result<ParallelResult<Vec<U>>, ConcurrentProcessingError>
    where
        I: IntoIterator<Item = T> + Send + 'static,
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + 'static,
    {
        let config = self.config.clone();
        let pool = self.pool.clone();
        let items: Vec<T> = data.into_iter().collect();

        web::block(move || pool.install(|| items.into_iter().par_map(&config, transform)))
            .await
            .map_err(|err: BlockingError<_>| {
                ConcurrentProcessingError::ActixBlocking(err.to_string())
            })
    }

    /// Convenience wrapper mirroring the legacy `process_batch` helper.
    pub async fn process_batch<T, U, F>(
        &self,
        data: Vec<T>,
        processor: F,
    ) -> Result<ParallelResult<Vec<U>>, ConcurrentProcessingError>
    where
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + 'static,
    {
        self.map_async(data, processor).await
    }
}

/// Aggregates metrics from multiple parallel operations into a single summary.
pub fn aggregate_metrics<'a, I>(metrics: I) -> ParallelMetrics
where
    I: IntoIterator<Item = &'a ParallelMetrics>,
{
    let mut aggregated = ParallelMetrics::default();
    let mut count = 0_u64;

    for metric in metrics {
        aggregated.total_time += metric.total_time;
        aggregated.thread_count = aggregated.thread_count.max(metric.thread_count);
        aggregated.throughput = aggregated.throughput.saturating_add(metric.throughput);
        aggregated.memory_usage = aggregated.memory_usage.saturating_add(metric.memory_usage);
        aggregated.efficiency += metric.efficiency;
        count += 1;
    }

    if count > 0 {
        aggregated.efficiency /= count as f64;
    }

    aggregated
}

#[cfg(test)]
mod tests {
    use super::*;

    fn processor() -> ConcurrentProcessor {
        ConcurrentProcessor::try_default().expect("thread pool should build")
    }

    #[test]
    fn map_parallel_basic() {
        let processor = processor();
        let data = vec![1, 2, 3, 4, 5];

        let result = processor.map(data, |x| x * 2);

        assert_eq!(result.data, vec![2, 4, 6, 8, 10]);
        assert!(result.metrics.efficiency >= 0.0);
    }

    #[test]
    fn map_parallel_with_dataset() {
        let processor = processor();
        let dataset = ImmutableDataset::new(vec![10, 20, 30]);

        let result = processor.map_dataset(&dataset, |x| x / 10);

        assert_eq!(result.data, vec![1, 2, 3]);
        assert_eq!(dataset.len(), 3);
    }

    #[test]
    fn aggregate_metrics_combines_values() {
        let mut a = ParallelMetrics::default();
        a.throughput = 100;
        a.memory_usage = 10;
        a.efficiency = 0.8;
        a.total_time = Duration::from_millis(10);

        let mut b = ParallelMetrics::default();
        b.throughput = 200;
        b.memory_usage = 20;
        b.efficiency = 0.6;
        b.total_time = Duration::from_millis(20);

        let aggregated = aggregate_metrics([&a, &b]);

        assert_eq!(aggregated.throughput, 300);
        assert_eq!(aggregated.memory_usage, 30);
        assert_eq!(aggregated.total_time, Duration::from_millis(30));
        assert!((aggregated.efficiency - 0.7).abs() < f64::EPSILON);
    }

    #[actix_rt::test]
    async fn map_async_executes_on_thread_pool() {
        let processor = processor();
        let data = (0..1000).collect::<Vec<_>>();

        let result = processor
            .map_async(data, |x| x * x)
            .await
            .expect("async map should succeed");

        assert_eq!(result.data.len(), 1000);
        assert_eq!(result.data[10], 100);
    }

    #[actix_rt::test]
    async fn map_actix_blocking_integrates_with_runtime() {
        let processor = processor();
        let dataset = ImmutableDataset::new((1..=64).collect::<Vec<_>>());

        let result = processor
            .map_actix_blocking(dataset.to_vec(), |x| x * 3)
            .await
            .expect("actix blocking map should succeed");

        assert_eq!(result.data[0], 3);
        assert_eq!(result.data.last().copied(), Some(192));
    }
}
