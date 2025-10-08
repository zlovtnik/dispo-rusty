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
    /// Creates an immutable dataset by taking ownership of the provided `Vec<T>`.
    ///
    /// The contents are stored in an `Arc<[T]>` so the resulting dataset can be cheaply
    /// cloned and shared across threads without further allocations.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::sync::Arc;
    /// let ds = ImmutableDataset::new(vec![1, 2, 3]);
    /// assert_eq!(ds.len(), 3);
    /// let clone = ds.clone();
    /// assert_eq!(clone.as_slice(), ds.as_slice());
    /// ```
    pub fn new(data: Vec<T>) -> Self {
        Self {
            inner: Arc::<[T]>::from(data),
        }
    }

    /// Constructs an ImmutableDataset from an existing shared `Arc<[T]>`.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::sync::Arc;
    /// // assume ImmutableDataset is in scope
    /// let arc_slice: Arc<[i32]> = Arc::from(vec![1, 2, 3].into_boxed_slice());
    /// let dataset = ImmutableDataset::from_arc(arc_slice.clone());
    /// assert_eq!(dataset.len(), 3);
    /// assert_eq!(dataset.as_slice(), &*arc_slice);
    /// ```
    pub fn from_arc(inner: Arc<[T]>) -> Self {
        Self { inner }
    }

    /// Get the number of elements in the dataset.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::sync::Arc;
    /// // assuming ImmutableDataset is in scope
    /// let ds = crate::functional::concurrent_processing::ImmutableDataset::new(vec![1, 2, 3]);
    /// assert_eq!(ds.len(), 3);
    /// ```
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Checks whether the dataset contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// let ds = ImmutableDataset::new(vec![1, 2, 3]);
    /// assert!(!ds.is_empty());
    ///
    /// let empty = ImmutableDataset::new(Vec::<i32>::new());
    /// assert!(empty.is_empty());
    /// ```
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Materializes the dataset into an owned Vec by cloning each element.
    ///
    /// # Examples
    ///
    /// ```
    /// let ds = ImmutableDataset::new(vec![1, 2, 3]);
    /// let v = ds.to_vec();
    /// assert_eq!(v, vec![1, 2, 3]);
    /// ```
    pub fn to_vec(&self) -> Vec<T> {
        self.inner.iter().cloned().collect()
    }

    /// Provides a read-only view of the dataset as a slice.
    ///
    /// This returns a borrowed slice referencing the dataset's internal storage without cloning.
    ///
    /// # Examples
    ///
    /// ```
    /// let ds = ImmutableDataset::new(vec![1, 2, 3]);
    /// let slice = ds.as_slice();
    /// assert_eq!(slice, &[1, 2, 3]);
    /// ```
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
    /// Create a new ConcurrentProcessor configured with `config`.
    ///
    /// # Errors
    ///
    /// Returns `Err(ConcurrentProcessingError::ThreadPoolBuild(_))` if constructing the Rayon thread pool fails.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::sync::Arc;
    /// # use crate::functional::concurrent_processing::{ConcurrentProcessor, ParallelConfig};
    /// let cfg = ParallelConfig::default();
    /// let processor = ConcurrentProcessor::new(cfg).expect("failed to build processor");
    /// assert_eq!(processor.config().thread_pool_size, cfg.thread_pool_size);
    /// ```
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

    /// Creates a ConcurrentProcessor configured with the default `ParallelConfig`.
    ///
    /// # Returns
    ///
    /// `Ok(ConcurrentProcessor)` initialized with `ParallelConfig::default()`, or `Err(ConcurrentProcessingError)` if the underlying thread pool fails to build.
    ///
    /// # Examples
    ///
    /// ```
    /// let proc = ConcurrentProcessor::try_default().expect("failed to build processor");
    /// assert_eq!(proc.config(), &ParallelConfig::default());
    /// ```
    pub fn try_default() -> Result<Self, ConcurrentProcessingError> {
        Self::new(ParallelConfig::default())
    }

    /// Get the processor's active parallel configuration.
    ///
    /// Returns a reference to the current `ParallelConfig` used by this `ConcurrentProcessor`.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let cfg: &ParallelConfig = proc.config();
    /// ```
    pub fn config(&self) -> &ParallelConfig {
        &self.config
    }

    /// Creates a new processor configured with the provided `ParallelConfig`.
    ///
    /// The returned processor is a distinct instance built from `config`.
    ///
    /// # Returns
    ///
    /// A `Result` containing the newly constructed `ConcurrentProcessor` on success, or a
    /// `ConcurrentProcessingError` if the thread pool could not be built.
    ///
    /// # Examples
    ///
    /// ```
    /// let base = ConcurrentProcessor::try_default().unwrap();
    /// let cfg = ParallelConfig::default();
    /// let new_proc = base.with_config(cfg).unwrap();
    /// assert_eq!(new_proc.config().thread_count(), cfg.thread_count());
    /// ```
    pub fn with_config(&self, config: ParallelConfig) -> Result<Self, ConcurrentProcessingError> {
        Self::new(config)
    }

    /// Performs a parallel map over the provided iterator, producing a collection of transformed items.
    ///
    /// Returns a `ParallelResult<Vec<U>>` containing the transformed items (preserving the input order where applicable)
    /// along with collected parallel execution metrics.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::functional::concurrent_processing::ConcurrentProcessor;
    ///
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let result = proc.map(vec![1, 2, 3], |x| x * 2);
    /// // `result` contains the transformed values (2, 4, 6) and parallel metrics.
    /// ```
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

    /// Performs a parallel map over the items in an `ImmutableDataset`, producing a collection of transformed results.
    ///
    /// The input dataset is not mutated; its elements are cloned for parallel processing.
    ///
    /// # Returns
    ///
    /// A `ParallelResult` containing a `Vec<U>` with the transformed items in the same order as the input dataset.
    ///
    /// # Examples
    ///
    /// ```
    /// let ds = ImmutableDataset::new(vec![1, 2, 3]);
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let result = proc.map_dataset(&ds, |n| n * 2);
    /// let vec = result.unwrap();
    /// assert_eq!(vec, vec![2, 4, 6]);
    /// ```
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

    /// Performs a parallel fold (reduce) over the provided items, producing a single accumulated value.
    ///
    /// The `fold` function applies `fold` to combine items into local accumulators and uses `combine` to merge those accumulators into a final result starting from `init`.
    ///
    /// # Returns
    ///
    /// `B` — the accumulator produced by folding and combining all items.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crate::functional::concurrent_processing::ConcurrentProcessor;
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let nums = vec![1, 2, 3, 4];
    /// let sum = proc.fold(nums, 0, |acc, x| acc + x, |a, b| a + b);
    /// assert_eq!(sum, 10);
    /// ```
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

    /// Groups items by a key produced from each item using the provided key function.
    ///
    /// The returned map contains each distinct key mapped to a vector of items for which
    /// `key_fn` produced that key. The original item order within each group's vector
    /// is preserved where the underlying parallel iterator preserves order.
    ///
    /// # Returns
    ///
    /// A `HashMap` mapping each key `K` to a `Vec<T>` of items that produce that key.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::collections::HashMap;
    /// // Assume ConcurrentProcessor is in scope and has try_default()
    /// let proc = crate::functional::concurrent_processing::ConcurrentProcessor::try_default().unwrap();
    /// let items = vec![1, 2, 3, 4, 5];
    /// let groups = proc.group_by(items, |&n| n % 2);
    /// assert_eq!(groups.get(&0).map(|v| v.len()), Some(2)); // 2 and 4
    /// assert_eq!(groups.get(&1).map(|v| v.len()), Some(3)); // 1, 3, 5
    /// ```
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

    /// Schedules a parallel map over the provided items on the processor's Rayon thread pool via Tokio's blocking bridge.
    ///
    /// This offloads the blocking parallel work to a spawned blocking task and returns either the parallel mapping
    /// result or a `ConcurrentProcessingError::JoinError` if the blocking task was cancelled or panicked.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::runtime::Runtime;
    /// // assume `proc` is a `ConcurrentProcessor` available in scope
    /// let proc = crate::functional::concurrent_processing::ConcurrentProcessor::try_default().unwrap();
    /// let data = (0..100u32).collect::<Vec<_>>();
    /// let rt = Runtime::new().unwrap();
    /// let parallel_result = rt.block_on(proc.map_async(data, |x| x * 2)).unwrap();
    /// // `parallel_result` contains the mapped `Vec<u32>` and associated metrics
    /// ```
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

    /// Performs a parallel fold over `data` asynchronously using Tokio's blocking adapter.
    ///
    /// This offloads the blocking parallel fold to a background thread and returns its result when complete.
    ///
    /// # Returns
    ///
    /// `Ok(ParallelResult<B>)` containing the folded value and parallel execution metrics on success; `Err(ConcurrentProcessingError::JoinError)` if the spawned blocking task was cancelled or panicked.
    ///
    /// # Examples
    ///
    /// ```
    /// // Run the async fold by blocking on a Tokio runtime.
    /// let processor = ConcurrentProcessor::try_default().unwrap();
    /// let data = vec![1i32, 2, 3, 4];
    /// let rt = tokio::runtime::Runtime::new().unwrap();
    /// let result = rt.block_on(async {
    ///     processor
    ///         .fold_async(
    ///             data,
    ///             0i32,
    ///             |acc, item| acc + item,
    ///             |a, b| a + b,
    ///         )
    ///         .await
    ///         .unwrap()
    /// });
    /// // `result` is a `ParallelResult<i32>` containing the folded sum and metrics.
    /// ```
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

    /// Executes a parallel map using the processor's Rayon thread pool via Actix Web's `web::block`,
    /// allowing the operation to be awaited inside an Actix handler.
    ///
    /// The function collects `data` into a vector, runs the provided `transform` in parallel on the
    /// thread pool, and returns the resulting `ParallelResult<Vec<U>>`. If the Actix blocking bridge
    /// fails, an `Err(ConcurrentProcessingError::ActixBlocking(_))` is returned.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::sync::Arc;
    /// # use my_crate::functional::concurrent_processing::{ConcurrentProcessor, ParallelResult};
    /// # async fn example() {
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let input = vec![1, 2, 3];
    /// let result: ParallelResult<Vec<i32>> = proc.map_actix_blocking(input, |x| x * 2).await.unwrap();
    /// assert_eq!(result.data, vec![2, 4, 6]);
    /// # }
    /// ```
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

    /// Asynchronously processes an owned batch of items with the provided processor function and returns the transformed results.
    ///
    /// The caller supplies an owned `Vec<T>` and a processor that consumes each `T` and produces a `U`. The operation executes on the processor's configured thread pool and yields a `ParallelResult<Vec<U>>` on success.
    ///
    /// # Errors
    ///
    /// Returns an `Err(ConcurrentProcessingError)` when the underlying async bridge fails to spawn or execute the blocking work.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // inside an async context
    /// let proc = ConcurrentProcessor::try_default().unwrap();
    /// let data = vec![1, 2, 3];
    /// let result = proc.process_batch(data, |x| x * 2).await.unwrap();
    /// let values = result.into_inner();
    /// assert_eq!(values, vec![2, 4, 6]);
    /// ```
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

/// Combine multiple `ParallelMetrics` values into a single aggregated summary.
///
/// The resulting `ParallelMetrics` has:
/// - `total_time` equal to the sum of all `total_time` values,
/// - `throughput` equal to the sum of all `throughput` values,
/// - `memory_usage` equal to the sum of all `memory_usage` values,
/// - `thread_count` equal to the maximum `thread_count` observed,
/// - `efficiency` equal to the arithmetic mean of all `efficiency` values (0.0 when no metrics are provided).
///
/// # Examples
///
/// ```
/// use crate::functional::concurrent_processing::aggregate_metrics;
/// use crate::functional::parallel_iterators::ParallelMetrics;
///
/// let a = ParallelMetrics {
///     total_time: 100,
///     thread_count: 4,
///     throughput: 200,
///     memory_usage: 1024,
///     efficiency: 0.75,
/// };
/// let b = ParallelMetrics {
///     total_time: 50,
///     thread_count: 8,
///     throughput: 100,
///     memory_usage: 512,
///     efficiency: 0.95,
/// };
///
/// let aggregated = aggregate_metrics(&[a, b]);
///
/// assert_eq!(aggregated.total_time, 150);
/// assert_eq!(aggregated.throughput, 300);
/// assert_eq!(aggregated.memory_usage, 1536);
/// assert_eq!(aggregated.thread_count, 8);
/// assert!((aggregated.efficiency - 0.85).abs() < 1e-9);
/// ```
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

    /// Constructs a ConcurrentProcessor using the default parallel configuration.
    ///
    /// Returns a `ConcurrentProcessor` configured with `ParallelConfig::default()`.
    ///
    /// # Panics
    ///
    /// Panics if the underlying Rayon thread pool cannot be built.
    ///
    /// # Examples
    ///
    /// ```
    /// let _proc = processor();
    /// ```
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