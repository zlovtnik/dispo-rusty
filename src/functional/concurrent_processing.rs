//! Concurrent Functional Processing
//!
//! Core module for concurrent processing of functional operations. This module
//! provides high-level APIs for concurrent data processing while maintaining
//! thread safety through immutable data structures and integrating with Actix Web's
//! async runtime.
//!
//! Key features:
//! - Async-aware concurrent processing
//! - Immutable data concurrency patterns
//! - CPU-bound task distribution
//! - Performance monitoring and metrics
//! - Integration with parallel iterators

use crate::functional::parallel_iterators::{self, ParallelIteratorExt};
use futures::Stream;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, Semaphore};
use tokio::task;

/// Concurrent processing configuration for Actix Web integration
#[derive(Debug, Clone)]
pub struct ConcurrentConfig {
    /// Maximum concurrent operations
    pub max_concurrent_ops: usize,
    /// Operation timeout in milliseconds
    pub operation_timeout_ms: u64,
    /// Enable adaptive concurrency based on system load
    pub adaptive_concurrency: bool,
    /// Thread pool affinity (true = pin to specific threads)
    pub thread_affinity: bool,
}

impl Default for ConcurrentConfig {
    fn default() -> Self {
        Self {
            max_concurrent_ops: num_cpus::get() * 2,
            operation_timeout_ms: 30000, // 30 seconds
            adaptive_concurrency: true,
            thread_affinity: false,
        }
    }
}

/// Comprehensive metrics for concurrent operations
#[derive(Debug, Clone, Default)]
pub struct ConcurrentMetrics {
    /// Total operations processed
    pub operations_processed: u64,
    /// Total processing time across all operations
    pub total_processing_time: Duration,
    /// Average operation latency
    pub average_latency: Duration,
    /// Peak concurrent operations
    pub peak_concurrency: usize,
    /// Operation success rate (0.0 - 1.0)
    pub success_rate: f64,
    /// Resource utilization metrics
    pub resource_utilization: ResourceUtilization,
}

/// Resource utilization tracking
#[derive(Debug, Clone, Default)]
pub struct ResourceUtilization {
    /// CPU utilization percentage (0-100)
    pub cpu_percent: f64,
    /// Memory utilization percentage (0-100)
    pub memory_percent: f64,
    /// Thread pool active threads
    pub active_threads: usize,
    /// Thread pool idle threads
    pub idle_threads: usize,
}

/// Thread-safe concurrent processor with async integration
#[derive(Clone)]
pub struct ConcurrentProcessor {
    config: ConcurrentConfig,
    semaphore: Arc<Semaphore>,
    metrics: Arc<RwLock<ConcurrentMetrics>>,
}

impl ConcurrentProcessor {
    /// Create a new concurrent processor with default configuration
    pub fn new() -> Self {
        Self::with_config(ConcurrentConfig::default())
    }

    /// Create a new concurrent processor with custom configuration
    pub fn with_config(config: ConcurrentConfig) -> Self {
        let semaphore = Arc::new(Semaphore::new(config.max_concurrent_ops));

        Self {
            config,
            semaphore,
            metrics: Arc::new(RwLock::new(ConcurrentMetrics::default())),
        }
    }

    /// Process a batch of CPU-intensive operations concurrently
    pub async fn process_batch<T, U, F>(
        &self,
        data: Vec<T>,
        processor: F,
    ) -> Result<ConcurrentResult<Vec<U>>, ConcurrentError>
    where
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(&T) -> U + Send + Sync + Clone + 'static,
    {
        let batch_size = data.len();

        // Use automatic parallel configuration
        let parallel_config = parallel_iterators::optimized_config(batch_size);

        // Spawn concurrent processing task
        let semaphore = Arc::clone(&self.semaphore);
        let processor_clone = processor.clone();
        let metrics_clone = Arc::clone(&self.metrics);

        let handle = task::spawn(async move {
            // Acquire semaphore permit for controlled concurrency
            let _permit = semaphore
                .acquire()
                .await
                .map_err(|_| ConcurrentError::ConcurrencyLimit)?;

            // Execute parallel processing
            let result = data.into_iter().par_map(&parallel_config, processor_clone);

            // Update metrics - clone before moving
            let result_metrics = result.metrics.clone();
            let mut metrics = metrics_clone.write().await;
            metrics.operations_processed += 1;
            metrics.total_processing_time += result_metrics.total_time;
            // Guard against division by zero
            metrics.average_latency = if metrics.operations_processed > 0 {
                metrics.total_processing_time / metrics.operations_processed as u32
            } else {
                Duration::from_secs(0)
            };
            metrics.peak_concurrency = metrics.peak_concurrency.max(result_metrics.thread_count);

            Ok(ConcurrentResult {
                data: result.data,
                metrics: result.metrics,
                concurrency_info: ConcurrencyInfo {
                    concurrent_ops: result_metrics.thread_count,
                    batch_size,
                    processing_time: result_metrics.total_time,
                },
            })
        });

        // Apply timeout and await result
        let timeout_duration = Duration::from_millis(self.config.operation_timeout_ms);
        match tokio::time::timeout(timeout_duration, handle).await {
            Ok(result) => result.map_err(|_| ConcurrentError::TaskJoin)?,
            Err(_) => Err(ConcurrentError::Timeout),
        }
    }

    /// Process a stream of operations with backpressure handling
    pub async fn process_stream<T, U, F, S>(
        &self,
        stream: S,
        processor: F,
    ) -> Result<ConcurrentStreamResult<U>, ConcurrentError>
    where
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + Clone + 'static,
        S: Stream<Item = T> + Send + 'static,
    {
        use futures::StreamExt;

        let mut stream_results = Vec::new();
        let mut handles = Vec::new();

        let semaphore = Arc::clone(&self.semaphore);
        let processor_clone = processor.clone();

        // Process stream items concurrently with semaphore control
        let mut stream = Box::pin(stream);
        while let Some(item) = stream.next().await {
            let permit = semaphore
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| ConcurrentError::ConcurrencyLimit)?;

            let processor = processor_clone.clone();

            let handle = task::spawn(async move {
                let _permit = permit; // Hold permit for duration
                let result = processor(item);
                Ok(result)
            });

            handles.push(handle);

            // Apply backpressure if too many concurrent operations
            if handles.len() >= self.config.max_concurrent_ops {
                // Wait for at least one operation to complete
                if let Some(handle) = handles.pop() {
                    let result = handle.await.map_err(|_| ConcurrentError::TaskJoin)??;
                    stream_results.push(result);
                }
            }
        }

        // Wait for remaining operations to complete
        for handle in handles {
            let result = handle.await.map_err(|_| ConcurrentError::TaskJoin)??;
            stream_results.push(result);
        }

        Ok(ConcurrentStreamResult {
            results: stream_results,
        })
    }

    /// Process operations in parallel while maintaining order
    pub async fn process_ordered<T, U, F>(
        &self,
        data: Vec<T>,
        processor: F,
    ) -> Result<ConcurrentOrderedResult<U>, ConcurrentError>
    where
        T: Send + Sync + 'static + Clone,
        U: Send + 'static,
        F: Fn(T) -> U + Send + Sync + Clone + 'static,
    {
        let start_time = Instant::now();
        let batch_size = data.len();

        // Create indexed data to maintain order
        let indexed_data: Vec<(usize, T)> = data.into_iter().enumerate().collect();

        // Use semaphore for controlled concurrency
        let semaphore = Arc::clone(&self.semaphore);
        let processor_clone = processor.clone();

        let handle = task::spawn(async move {
            // Process in parallel while maintaining indices
            let mut tasks = Vec::new();

            for (index, item) in indexed_data {
                let permit = semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|_| ConcurrentError::ConcurrencyLimit)?;
                let processor = processor_clone.clone();

                let task = task::spawn(async move {
                    let _permit = permit;
                    let result = processor(item);
                    Ok((index, result))
                });

                tasks.push(task);
            }

            // Collect results and restore order
            let mut indexed_results = Vec::new();
            for task in tasks {
                let (index, result) = task.await.map_err(|_| ConcurrentError::TaskJoin)??;
                indexed_results.push((index, result));
            }

            // Sort by original index to maintain order
            indexed_results.sort_by_key(|(index, _)| *index);
            let ordered_results: Vec<U> = indexed_results
                .into_iter()
                .map(|(_, result)| result)
                .collect();

            Ok(ordered_results)
        });

        let timeout_duration = Duration::from_millis(self.config.operation_timeout_ms);
        let ordered_data = match tokio::time::timeout(timeout_duration, handle).await {
            Ok(result) => result.map_err(|_| ConcurrentError::TaskJoin)??,
            Err(_) => return Err(ConcurrentError::Timeout),
        };

        Ok(ConcurrentOrderedResult {
            data: ordered_data,
            batch_size,
            processing_time: start_time.elapsed(),
        })
    }

    /// Execute CPU-intensive operations with dedicated thread pool
    pub async fn execute_cpu_intensive<F, T>(&self, operation: F) -> Result<T, ConcurrentError>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        let handle = task::spawn_blocking(operation);

        let timeout_duration = Duration::from_millis(self.config.operation_timeout_ms);
        match tokio::time::timeout(timeout_duration, handle).await {
            Ok(result) => Ok(result.map_err(|_| ConcurrentError::TaskJoin)?),
            Err(_) => Err(ConcurrentError::Timeout),
        }
    }

    /// Get current metrics and health status
    pub async fn get_metrics(&self) -> ConcurrentMetrics {
        self.metrics.read().await.clone()
    }

    /// Reset performance metrics
    pub async fn reset_metrics(&self) {
        let mut metrics = self.metrics.write().await;
        *metrics = ConcurrentMetrics::default();
    }
}

/// Result of concurrent batch processing
#[derive(Debug)]
pub struct ConcurrentResult<T> {
    pub data: T,
    pub metrics: crate::functional::parallel_iterators::ParallelMetrics,
    pub concurrency_info: ConcurrencyInfo,
}

/// Concurrency information for monitoring
#[derive(Debug)]
pub struct ConcurrencyInfo {
    pub concurrent_ops: usize,
    pub batch_size: usize,
    pub processing_time: Duration,
}

/// Result of concurrent stream processing
#[derive(Debug)]
pub struct ConcurrentStreamResult<T> {
    pub results: Vec<T>,
}

/// Result of ordered concurrent processing
#[derive(Debug)]
pub struct ConcurrentOrderedResult<T> {
    pub data: Vec<T>,
    pub batch_size: usize,
    pub processing_time: Duration,
}

/// Errors that can occur during concurrent processing
#[derive(Debug, thiserror::Error)]
pub enum ConcurrentError {
    #[error("Operation timed out")]
    Timeout,

    #[error("Concurrency limit exceeded")]
    ConcurrencyLimit,

    #[error("Task failed to join")]
    TaskJoin,

    #[error("Resource exhausted")]
    ResourceExhausted,
}

// Utility functions for integration with Actix Web

/// Create a concurrent processor suitable for Actix Web applications
pub fn actix_processor() -> ConcurrentProcessor {
    let config = ConcurrentConfig {
        max_concurrent_ops: num_cpus::get(),
        operation_timeout_ms: 25000, // 25 seconds for web requests
        adaptive_concurrency: true,
        thread_affinity: false,
    };

    ConcurrentProcessor::with_config(config)
}

/// Functional data processing pipeline for web APIs
pub async fn process_api_data<T, U, F>(
    data: Vec<T>,
    processor: F,
) -> Result<ConcurrentResult<Vec<U>>, ConcurrentError>
where
    T: Send + Sync + 'static,
    U: Send + 'static,
    F: Fn(&T) -> U + Send + Sync + Clone + 'static,
{
    let actix_proc = actix_processor();
    let proc_clone = processor.clone();
    actix_proc.process_batch(data, move |x| proc_clone(x)).await
}

/// Stream processing pattern for real-time API responses
pub async fn process_api_stream<T, U, F, S>(
    stream: S,
    processor: F,
) -> Result<ConcurrentStreamResult<U>, ConcurrentError>
where
    T: Send + Sync + 'static,
    U: Send + 'static,
    F: Fn(T) -> U + Send + Sync + Clone + 'static,
    S: futures::Stream<Item = T> + Send + 'static,
{
    let actix_proc = actix_processor();
    let proc_clone = processor.clone();
    actix_proc
        .process_stream(stream, move |x| proc_clone(x))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_concurrent_batch_processing() {
        let processor = ConcurrentProcessor::new();
        let data = vec![1, 2, 3, 4, 5];

        let result = processor.process_batch(data, |x| x * 2).await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.data, vec![2, 4, 6, 8, 10]);
        assert!(result.metrics.throughput > 0);
    }

    #[tokio::test]
    async fn test_concurrent_ordered_processing() {
        let processor = ConcurrentProcessor::new();
        let data = vec![3, 1, 4, 1, 5]; // Unsorted input

        let result = processor.process_ordered(data, |x| x * x).await;

        assert!(result.is_ok());
        let result = result.unwrap();
        // Order should be preserved: 3*3, 1*1, 4*4, 1*1, 5*5
        assert_eq!(result.data, vec![9, 1, 16, 1, 25]);
        assert_eq!(result.batch_size, 5);
        assert!(result.processing_time > Duration::from_nanos(0));
    }

    #[tokio::test]
    async fn test_cpu_intensive_operation() {
        let processor = ConcurrentProcessor::new();

        let result = processor
            .execute_cpu_intensive(|| {
                // Simulate CPU-intensive work
                let mut sum = 0u64;
                for i in 0..1_000_000 {
                    sum += (i % 1000) as u64;
                }
                sum
            })
            .await;

        assert!(result.is_ok());
        assert!(result.unwrap() > 0);
    }

    #[tokio::test]
    async fn test_concurrency_limits() {
        let mut config = ConcurrentConfig::default();
        config.max_concurrent_ops = 1; // Very restrictive for testing
        let processor = ConcurrentProcessor::with_config(config);

        // This should work with single operation
        let result = processor.process_batch(vec![1, 2, 3], |x| x * 2).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_timeout_handling() {
        let mut config = ConcurrentConfig::default();
        config.operation_timeout_ms = 1; // Very short timeout
        let processor = ConcurrentProcessor::with_config(config);

        let data = vec![1, 2, 3, 4, 5];
        let result = processor
            .process_batch(data, |x| {
                // Simulate slow operation
                std::thread::sleep(Duration::from_millis(100));
                x * 2
            })
            .await;

        assert!(matches!(result, Err(ConcurrentError::Timeout)));
    }

    #[tokio::test]
    async fn test_metrics_tracking() {
        let processor = ConcurrentProcessor::new();

        // Perform some operations
        let _ = processor.process_batch(vec![1, 2, 3], |x| x * 2).await;
        let _ = processor.process_batch(vec![4, 5, 6], |x| x * 3).await;

        let metrics = processor.get_metrics().await;
        assert!(metrics.operations_processed >= 2);
        assert!(metrics.average_latency > Duration::from_nanos(0));
    }

    #[tokio::test]
    async fn test_actix_integration() {
        let _processor = actix_processor();
        let data = vec![1, 2, 3, 4, 5];

        let result = process_api_data(data, |x| x * x).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().data, vec![1, 4, 9, 16, 25]);
    }
}
