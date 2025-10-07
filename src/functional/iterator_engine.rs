//! Iterator Chain Processing Engine
//!
//! Core iterator processing system that leverages itertools' advanced features
//! including chunk_by, kmerge, join operations and requires Rust 1.63.0 or later.
//! This engine serves as the foundation for all data transformation operations.

use itertools::{ChunkBy, Itertools, KMerge, Join};
use std::collections::HashMap;
use std::fmt;
use std::hash::Hash;

/// Iterator chain configuration for performance optimization
#[derive(Debug, Clone)]
pub struct IteratorConfig {
    /// Enable parallel processing for large datasets
    pub enable_parallel: bool,
    /// Buffer size for chunked operations
    pub buffer_size: usize,
    /// Memory limit for lazy evaluation
    pub memory_limit: usize,
}

impl Default for IteratorConfig {
    fn default() -> Self {
        Self {
            enable_parallel: false,
            buffer_size: 1024,
            memory_limit: 10 * 1024 * 1024, // 10MB
        }
    }
}

/// Iterator chain with lazy evaluation support
pub struct IteratorChain<T, I>
where
    I: Iterator<Item = T>,
{
    iterator: I,
    config: IteratorConfig,
    operations: Vec<String>, // For debugging and monitoring
}

impl<T, I> IteratorChain<T, I>
where
    I: Iterator<Item = T>,
{
    /// Create a new iterator chain
    pub fn new(iterator: I) -> Self {
        Self {
            iterator,
            config: IteratorConfig::default(),
            operations: Vec::new(),
        }
    }

    /// Configure the iterator chain
    pub fn with_config(mut self, config: IteratorConfig) -> Self {
        self.config = config;
        self
    }

    /// Apply a transformation function
    pub fn map<U, F>(self, f: F) -> IteratorChain<U, std::iter::Map<I, F>>
    where
        F: FnMut(T) -> U,
    {
        let mut operations = self.operations;
        operations.push("map".to_string());

        IteratorChain {
            iterator: self.iterator.map(f),
            config: self.config,
            operations,
        }
    }

    /// Filter elements based on a predicate
    pub fn filter<F>(self, f: F) -> IteratorChain<T, std::iter::Filter<I, F>>
    where
        F: FnMut(&T) -> bool,
    {
        let mut operations = self.operations;
        operations.push("filter".to_string());

        IteratorChain {
            iterator: self.iterator.filter(f),
            config: self.config,
            operations,
        }
    }

    /// Group consecutive elements by key
    pub fn chunk_by<K, F>(self, f: F) -> IteratorChain<ChunkBy<K, I, F>, ChunkBy<K, I, F>>
    where
        F: FnMut(&T) -> K,
        K: PartialEq,
    {
        let mut operations = self.operations;
        operations.push("chunk_by".to_string());

        let chunked = self.iterator.chunk_by(f);
        IteratorChain {
            iterator: chunked,
            config: self.config,
            operations,
        }
    }

    /// Merge multiple sorted iterators
    pub fn kmerge<J>(self, other: J) -> IteratorChain<T, KMerge<std::vec::IntoIter<T>>>
    where
        T: Ord,
        J: IntoIterator<Item = T>,
        I: IntoIterator<Item = T>,
    {
        let mut operations = self.operations;
        operations.push("kmerge".to_string());

        let merged = self.iterator.into_iter().kmerge(other);
        IteratorChain {
            iterator: merged,
            config: self.config,
            operations,
        }
    }

    /// Join two iterators based on keys
    pub fn join<U, V, F, G>(
        self,
        other: U,
        self_key: F,
        other_key: G,
    ) -> IteratorChain<(T, V), Join<std::vec::IntoIter<T>, std::vec::IntoIter<V>, F, G>>
    where
        U: IntoIterator<Item = V>,
        F: FnMut(&T) -> bool,
        G: FnMut(&V) -> bool,
    {
        let mut operations = self.operations;
        operations.push("join".to_string());

        let joined = self.iterator.into_iter().join(other, self_key, other_key);
        IteratorChain {
            iterator: joined,
            config: self.config,
            operations,
        }
    }

    /// Cartesian product with another iterator
    pub fn cartesian_product<U>(
        self,
        other: U,
    ) -> IteratorChain<(T, U::Item), std::iter::Flatten<std::iter::Map<I, std::iter::Repeat<U::Item>>>>
    where
        U: IntoIterator + Clone,
        U::Item: Clone,
        I: Clone,
    {
        let mut operations = self.operations;
        operations.push("cartesian_product".to_string());

        let product = self.iterator.cartesian_product(other);
        IteratorChain {
            iterator: product,
            config: self.config,
            operations,
        }
    }

    /// Collect results into a vector
    pub fn collect(self) -> Vec<T> {
        self.iterator.collect()
    }

    /// Count elements
    pub fn count(self) -> usize {
        self.iterator.count()
    }

    /// Get the first element
    pub fn first(self) -> Option<T> {
        self.iterator.next()
    }

    /// Fold elements into a single value
    pub fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, T) -> B,
    {
        self.iterator.fold(init, f)
    }

    /// Get operations performed (for debugging)
    pub fn operations(&self) -> &[String] {
        &self.operations
    }
}

impl<T, I> fmt::Debug for IteratorChain<T, I>
where
    I: Iterator<Item = T> + fmt::Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("IteratorChain")
            .field("iterator", &self.iterator)
            .field("config", &self.config)
            .field("operations", &self.operations)
            .finish()
    }
}

/// Core iterator processing engine
pub struct IteratorEngine {
    config: IteratorConfig,
    performance_metrics: HashMap<String, u64>,
}

impl IteratorEngine {
    /// Create a new iterator engine
    pub fn new() -> Self {
        Self {
            config: IteratorConfig::default(),
            performance_metrics: HashMap::new(),
        }
    }

    /// Create an iterator engine with custom configuration
    pub fn with_config(config: IteratorConfig) -> Self {
        Self {
            config,
            performance_metrics: HashMap::new(),
        }
    }

    /// Create a new iterator chain from a collection
    pub fn from_iter<T, I>(&self, iterator: I) -> IteratorChain<T, I>
    where
        I: Iterator<Item = T>,
    {
        IteratorChain::new(iterator).with_config(self.config.clone())
    }

    /// Create a new iterator chain from a vector
    pub fn from_vec<T>(&self, vec: Vec<T>) -> IteratorChain<T, std::vec::IntoIter<T>> {
        self.from_iter(vec.into_iter())
    }

    /// Create a new iterator chain from a slice
    pub fn from_slice<T>(&self, slice: &[T]) -> IteratorChain<&T, std::slice::Iter<T>>
    where
        T: Clone,
    {
        self.from_iter(slice.iter())
    }

    /// Process data with zero-copy transformations
    pub fn process_zero_copy<T, F, U>(&self, data: &[T], transform: F) -> Vec<U>
    where
        F: Fn(&T) -> U,
        T: Sync,
        U: Send,
    {
        if self.config.enable_parallel && data.len() > self.config.buffer_size {
            // Parallel processing for large datasets
            use rayon::prelude::*;
            data.par_iter().map(transform).collect()
        } else {
            // Sequential processing
            data.iter().map(transform).collect()
        }
    }

    /// Get performance metrics
    pub fn metrics(&self) -> &HashMap<String, u64> {
        &self.performance_metrics
    }

    /// Reset performance metrics
    pub fn reset_metrics(&mut self) {
        self.performance_metrics.clear();
    }
}

impl Default for IteratorEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_iterator_chain() {
        let engine = IteratorEngine::new();
        let data = vec![1, 2, 3, 4, 5];

        let result: Vec<i32> = engine
            .from_vec(data)
            .filter(|&x| x % 2 == 0)
            .map(|x| x * 2)
            .collect();

        assert_eq!(result, vec![4, 8]);
    }

    #[test]
    fn test_chunk_by() {
        let engine = IteratorEngine::new();
        let data = vec![1, 1, 2, 2, 3, 3, 3];

        let chunks: Vec<Vec<i32>> = engine
            .from_vec(data)
            .chunk_by(|&x| x)
            .map(|(_key, group)| group.collect())
            .collect();

        assert_eq!(chunks, vec![vec![1, 1], vec![2, 2], vec![3, 3, 3]]);
    }

    #[test]
    fn test_cartesian_product() {
        let engine = IteratorEngine::new();
        let data1 = vec![1, 2];
        let data2 = vec![3, 4];

        let products: Vec<(i32, i32)> = engine
            .from_vec(data1)
            .cartesian_product(data2)
            .collect();

        assert_eq!(products, vec![(1, 3), (1, 4), (2, 3), (2, 4)]);
    }

    #[test]
    fn test_zero_copy_processing() {
        let engine = IteratorEngine::new();
        let data = vec![1, 2, 3, 4, 5];

        let result = engine.process_zero_copy(&data, |&x| x * 2);

        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }
}