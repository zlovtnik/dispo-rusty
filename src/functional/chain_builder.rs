//! Fluent API for Building Complex Iterator Chains
//!
//! Provides a builder pattern for constructing sophisticated iterator chains
//! with advanced itertools operations, lazy evaluation, and performance optimization.

use super::iterator_engine::{IteratorChain, IteratorConfig, IteratorEngine};
use itertools::{ChunkBy, Itertools, KMerge, Join};
use std::collections::HashMap;
use std::fmt;

/// Chain operation types for monitoring and optimization
#[derive(Debug, Clone, PartialEq)]
pub enum ChainOperation {
    Map,
    Filter,
    ChunkBy,
    KMerge,
    Join,
    CartesianProduct,
    Fold,
    Collect,
    Custom(String),
}

/// Builder for constructing complex iterator chains
pub struct ChainBuilder<T> {
    operations: Vec<ChainOperation>,
    config: IteratorConfig,
    engine: IteratorEngine,
    _phantom: std::marker::PhantomData<T>,
}

impl<T> ChainBuilder<T> {
    /// Create a new chain builder
    pub fn new() -> Self {
        Self {
            operations: Vec::new(),
            config: IteratorConfig::default(),
            engine: IteratorEngine::new(),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create a chain builder with custom configuration
    pub fn with_config(config: IteratorConfig) -> Self {
        Self {
            operations: Vec::new(),
            config: config.clone(),
            engine: IteratorEngine::with_config(config),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Enable parallel processing
    pub fn parallel(mut self) -> Self {
        self.config.enable_parallel = true;
        self
    }

    /// Set buffer size for chunked operations
    pub fn buffer_size(mut self, size: usize) -> Self {
        self.config.buffer_size = size;
        self
    }

    /// Set memory limit for lazy evaluation
    pub fn memory_limit(mut self, limit: usize) -> Self {
        self.config.memory_limit = limit;
        self
    }

    /// Add a map operation
    pub fn map<U>(mut self, _f: impl Fn(T) -> U) -> ChainBuilder<U> {
        self.operations.push(ChainOperation::Map);
        ChainBuilder {
            operations: self.operations,
            config: self.config,
            engine: self.engine,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Add a filter operation
    pub fn filter(mut self, _predicate: impl Fn(&T) -> bool) -> Self {
        self.operations.push(ChainOperation::Filter);
        self
    }

    /// Add a chunk_by operation
    pub fn chunk_by<K>(mut self, _key_fn: impl Fn(&T) -> K) -> ChainBuilder<ChunkBy<K, std::vec::IntoIter<T>, impl FnMut(&T) -> K>>
    where
        K: PartialEq,
    {
        self.operations.push(ChainOperation::ChunkBy);
        ChainBuilder {
            operations: self.operations,
            config: self.config,
            engine: self.engine,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Add a kmerge operation
    pub fn kmerge<U>(mut self, _other: U) -> ChainBuilder<T>
    where
        U: IntoIterator<Item = T>,
        T: Ord,
    {
        self.operations.push(ChainOperation::KMerge);
        self
    }

    /// Add a join operation
    pub fn join<U, V>(mut self, _other: U, _self_key: impl Fn(&T) -> bool, _other_key: impl Fn(&V) -> bool) -> ChainBuilder<(T, V)>
    where
        U: IntoIterator<Item = V>,
    {
        self.operations.push(ChainOperation::Join);
        ChainBuilder {
            operations: self.operations,
            config: self.config,
            engine: self.engine,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Add a cartesian product operation
    pub fn cartesian_product<U>(mut self, _other: U) -> ChainBuilder<(T, U::Item)>
    where
        U: IntoIterator + Clone,
        U::Item: Clone,
    {
        self.operations.push(ChainOperation::CartesianProduct);
        self
    }

    /// Add a fold operation
    pub fn fold<B>(mut self, _init: B, _f: impl Fn(B, T) -> B) -> FoldBuilder<B, T> {
        self.operations.push(ChainOperation::Fold);
        FoldBuilder {
            operations: self.operations,
            config: self.config,
            engine: self.engine,
            init: _init,
            fold_fn: _f,
        }
    }

    /// Build the iterator chain from a vector
    pub fn build_from_vec(self, data: Vec<T>) -> IteratorChain<T, std::vec::IntoIter<T>> {
        self.engine.from_vec(data)
    }

    /// Build the iterator chain from a slice
    pub fn build_from_slice(self, data: &[T]) -> IteratorChain<&T, std::slice::Iter<T>>
    where
        T: Clone,
    {
        self.engine.from_slice(data)
    }

    /// Get the operations that will be performed
    pub fn operations(&self) -> &[ChainOperation] {
        &self.operations
    }

    /// Get the configuration
    pub fn config(&self) -> &IteratorConfig {
        &self.config
    }
}

impl<T> Default for ChainBuilder<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> fmt::Debug for ChainBuilder<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ChainBuilder")
            .field("operations", &self.operations)
            .field("config", &self.config)
            .finish()
    }
}

/// Builder for fold operations that need to be executed immediately
pub struct FoldBuilder<B, T> {
    operations: Vec<ChainOperation>,
    config: IteratorConfig,
    engine: IteratorEngine,
    init: B,
    fold_fn: Box<dyn Fn(B, T) -> B>,
}

impl<B, T> FoldBuilder<B, T> {
    /// Execute the fold operation on a vector
    pub fn execute_on_vec(self, data: Vec<T>) -> B {
        self.engine.from_vec(data).fold(self.init, self.fold_fn)
    }

    /// Execute the fold operation on a slice
    pub fn execute_on_slice(self, data: &[T]) -> B
    where
        T: Clone,
    {
        self.engine.from_slice(data).fold(self.init, self.fold_fn)
    }
}

/// Advanced chain builder with optimization hints
pub struct OptimizedChainBuilder<T> {
    builder: ChainBuilder<T>,
    optimization_hints: HashMap<String, String>,
}

impl<T> OptimizedChainBuilder<T> {
    /// Create a new optimized chain builder
    pub fn new() -> Self {
        Self {
            builder: ChainBuilder::new(),
            optimization_hints: HashMap::new(),
        }
    }

    /// Add an optimization hint
    pub fn with_hint(mut self, key: &str, value: &str) -> Self {
        self.optimization_hints.insert(key.to_string(), value.to_string());
        self
    }

    /// Enable memory-efficient processing
    pub fn memory_efficient(self) -> Self {
        self.with_hint("memory", "efficient")
    }

    /// Enable CPU-optimized processing
    pub fn cpu_optimized(self) -> Self {
        self.with_hint("cpu", "optimized")
    }

    /// Build with optimizations applied
    pub fn build(self) -> ChainBuilder<T> {
        let mut config = self.builder.config;

        // Apply optimization hints
        if let Some(memory_hint) = self.optimization_hints.get("memory") {
            if memory_hint == "efficient" {
                config.memory_limit /= 2; // Reduce memory usage
            }
        }

        if let Some(cpu_hint) = self.optimization_hints.get("cpu") {
            if cpu_hint == "optimized" {
                config.enable_parallel = true;
            }
        }

        ChainBuilder {
            operations: self.builder.operations,
            config,
            engine: self.builder.engine,
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<T> Default for OptimizedChainBuilder<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Utility functions for common iterator chain patterns
pub mod patterns {
    use super::*;

    /// Create a data processing pipeline for filtering and transforming
    pub fn filter_transform<T, U>(
        data: Vec<T>,
        filter_fn: impl Fn(&T) -> bool,
        transform_fn: impl Fn(T) -> U,
    ) -> Vec<U> {
        ChainBuilder::new()
            .filter(filter_fn)
            .map(transform_fn)
            .build_from_vec(data)
            .collect()
    }

    /// Create a grouping pipeline
    pub fn group_by_key<T, K>(
        data: Vec<T>,
        key_fn: impl Fn(&T) -> K,
    ) -> Vec<(K, Vec<T>)>
    where
        K: PartialEq + Clone,
        T: Clone,
    {
        ChainBuilder::new()
            .chunk_by(key_fn)
            .build_from_vec(data)
            .map(|(key, group)| (key, group.collect()))
            .collect()
    }

    /// Create a parallel processing pipeline for large datasets
    pub fn parallel_process<T, U>(
        data: Vec<T>,
        process_fn: impl Fn(T) -> U + Send + Sync,
    ) -> Vec<U>
    where
        T: Send + Sync,
        U: Send,
    {
        OptimizedChainBuilder::new()
            .cpu_optimized()
            .build()
            .map(process_fn)
            .build_from_vec(data)
            .collect()
    }

    /// Create a memory-efficient processing pipeline
    pub fn memory_efficient_process<T, U>(
        data: Vec<T>,
        process_fn: impl Fn(T) -> U,
    ) -> Vec<U> {
        OptimizedChainBuilder::new()
            .memory_efficient()
            .build()
            .map(process_fn)
            .build_from_vec(data)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_chain_builder() {
        let data = vec![1, 2, 3, 4, 5, 6];

        let result: Vec<i32> = ChainBuilder::new()
            .filter(|&x| x % 2 == 0)
            .map(|x| x * 2)
            .build_from_vec(data)
            .collect();

        assert_eq!(result, vec![4, 8, 12]);
    }

    #[test]
    fn test_optimized_builder() {
        let data = vec![1, 2, 3, 4, 5];

        let result: Vec<i32> = OptimizedChainBuilder::new()
            .memory_efficient()
            .build()
            .map(|x| x * 2)
            .build_from_vec(data)
            .collect();

        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_filter_transform_pattern() {
        let data = vec![1, 2, 3, 4, 5, 6];

        let result = patterns::filter_transform(
            data,
            |&x| x > 3,
            |x| x.to_string(),
        );

        assert_eq!(result, vec!["4", "5", "6"]);
    }

    #[test]
    fn test_group_by_pattern() {
        let data = vec![1, 1, 2, 2, 3, 3, 3];

        let result = patterns::group_by_key(data, |&x| x);

        assert_eq!(result.len(), 3);
        assert_eq!(result[0], (1, vec![1, 1]));
        assert_eq!(result[1], (2, vec![2, 2]));
        assert_eq!(result[2], (3, vec![3, 3, 3]));
    }

    #[test]
    fn test_fold_builder() {
        let data = vec![1, 2, 3, 4, 5];

        let sum = ChainBuilder::new()
            .fold(0, |acc, x| acc + x)
            .execute_on_vec(data);

        assert_eq!(sum, 15);
    }
}