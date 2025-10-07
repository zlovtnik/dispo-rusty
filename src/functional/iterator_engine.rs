//! Iterator Chain Processing Engine
//!
//! Core iterator processing system that leverages itertools' advanced features
//! including chunk_by, kmerge, join operations and requires Rust 1.63.0 or later.
//! This engine serves as the foundation for all data transformation operations.

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

    // FIXME: chunk_by returns ChunkBy which doesn't implement Iterator properly
    // /// Group consecutive elements by key
    // pub fn chunk_by<K, F>(
    //     self,
    //     f: F,
    // ) -> IteratorChain<<ChunkBy<K, I, F> as Iterator>::Item, ChunkBy<K, I, F>>
    // where
    //     F: FnMut(&T) -> K,
    //     K: PartialEq,
    // {
    //     let mut operations = self.operations;
    //     operations.push("chunk_by".to_string());
    //
    //     let chunked = self.iterator.chunk_by(f);
    //     IteratorChain {
    //         iterator: chunked,
    //         config: self.config,
    //         operations,
    //     }
    // }

    // FIXME: KMerge type alias signature issue
    // /// K-way merge sorted iterators
    // pub fn kmerge<J>(self, other: J) -> IteratorChain<T, KMerge<I, J::IntoIter>>

    // FIXME: ChunkBy doesn't implement Iterator properly
    // /// Group consecutive elements by key
    // pub fn chunk_by<K, F>(
    //     self,
    //     f: F,
    // ) -> IteratorChain<<ChunkBy<K, I, F> as Iterator>::Item, ChunkBy<K, I, F>>
    // where
    //     F: FnMut(&T) -> K,
    //     K: PartialEq,
    // {
    //     let mut operations = self.operations;
    //     operations.push("chunk_by".to_string());
    //
    //     let chunked = self.iterator.chunk_by(f);
    //     IteratorChain {
    //         iterator: chunked,
    //         config: self.config,
    //         operations,
    //     }
    // }

    // /// Merge multiple sorted iterators
    // pub fn kmerge<J>(self, other: J) -> IteratorChain<T, KMerge<I, J::IntoIter>>
    // where
    //     T: Ord,
    //     J: IntoIterator<Item = T>,
    // {
    //     let mut operations = self.operations;
    //     operations.push("kmerge".to_string());
    //
    //     let merged = self.iterator.kmerge(other);
    //     IteratorChain {
    //         iterator: merged,
    //         config: self.config,
    //         operations,
    //     }
    // }

    /// Join two iterators based on keys to return all matching pairs
    pub fn join<K, U, V, F, G>(
        self,
        other: U,
        self_key: F,
        other_key: G,
    ) -> IteratorChain<(T, V), impl Iterator<Item = (T, V)>>
    where
        K: Hash + Eq,
        U: IntoIterator<Item = V>,
        F: Fn(&T) -> K,
        G: Fn(&V) -> K,
        T: Clone,
        V: Clone,
    {
        let mut operations = self.operations;
        operations.push("join".to_string());

        // Collect right side into a HashMap for lookup
        let right_map: HashMap<K, Vec<V>> = other
            .into_iter()
            .map(|item| (other_key(&item), item))
            .fold(HashMap::new(), |mut map, (key, item)| {
                map.entry(key).or_insert_with(Vec::new).push(item);
                map
            });

        // Use flat_map to emit all matches instead of just the first one
        let joined = self.iterator.flat_map(move |left_item| {
            let left_key = self_key(&left_item);
            let right_items = right_map.get(&left_key).cloned().unwrap_or_default();

            right_items
                .into_iter()
                .map(move |right_item| (left_item.clone(), right_item))
        });

        IteratorChain {
            iterator: joined,
            config: self.config,
            operations,
        }
    }

    // FIXME: cartesian_product requires U::IntoIter to be Clone
    // /// Cartesian product with another iterator
    // pub fn cartesian_product<U>(
    //     self,
    //     other: U,
    // ) -> IteratorChain<(T, U::Item), itertools::Product<I, U::IntoIter>>
    // where
    //     U: IntoIterator,
    //     T: Clone,
    // {
    //     let mut operations = self.operations;
    //     operations.push("cartesian_product".to_string());
    //
    //     let product = self.iterator.cartesian_product(other);
    //     IteratorChain {
    //         iterator: product,
    //         config: self.config,
    //         operations,
    //     }
    // }

    /// Collect results into a vector
    pub fn collect(self) -> Vec<T> {
        self.iterator.collect()
    }

    /// Count elements
    pub fn count(self) -> usize {
        self.iterator.count()
    }

    /// Get the first element
    pub fn first(mut self) -> Option<T> {
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

    // FIXME: Lifetime issue - slice.iter() lifetime doesn't match return type
    // /// Create a new iterator chain from a slice
    // pub fn from_slice<T>(&self, slice: &[T]) -> IteratorChain<&T, std::slice::Iter<T>>
    // where
    //     T: Clone,
    // {
    //     self.from_iter(slice.iter())
    // }

    /// Process data with zero-copy transformations
    #[allow(unexpected_cfgs)]
    pub fn process_zero_copy<T, F, U>(&self, data: &[T], transform: F) -> Vec<U>
    where
        F: Fn(&T) -> U,
        T: Sync,
        U: Send,
    {
        #[cfg(feature = "parallel")]
        if self.config.enable_parallel && data.len() > self.config.buffer_size {
            // Parallel processing for large datasets
            use rayon::prelude::*;
            return data.par_iter().map(transform).collect();
        }

        #[cfg(not(feature = "parallel"))]
        // Sequential processing
        data.iter().map(transform).collect()
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

    // FIXME: chunk_by is commented out due to type issues
    // #[test]
    // fn test_chunk_by() {
    //     let engine = IteratorEngine::new();
    //     let data = vec![1, 1, 2, 2, 3, 3, 3];
    //
    //     let chunks: Vec<Vec<i32>> = engine
    //         .from_vec(data)
    //         .chunk_by(|&x| x)
    //         .map(|(_key, group)| group.collect())
    //         .collect();
    //
    //     assert_eq!(chunks, vec![vec![1, 1], vec![2, 2], vec![3, 3, 3]]);
    // }

    // FIXME: cartesian_product is commented out due to Clone constraint issues
    // #[test]
    // fn test_cartesian_product() {
    //     let engine = IteratorEngine::new();
    //     let data1 = vec![1, 2];
    //     let data2 = vec![3, 4];
    //
    //     let products: Vec<(i32, i32)> = engine.from_vec(data1).cartesian_product(data2).collect();
    //
    //     assert_eq!(products, vec![(1, 3), (1, 4), (2, 3), (2, 4)]);
    // }

    #[test]
    fn test_zero_copy_processing() {
        let engine = IteratorEngine::new();
        let data = vec![1, 2, 3, 4, 5];

        let result = engine.process_zero_copy(&data, |&x| x * 2);

        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }
}

    #[test]
    fn test_iterator_chain_with_config() {
        let config = IteratorConfig {
            enable_parallel: false,
            buffer_size: 100,
            memory_limit: 1024,
        };

        let engine = IteratorEngine::with_config(config);
        let data = vec\![1, 2, 3, 4, 5];

        let result: Vec<i32> = engine
            .from_vec(data)
            .map(|x| x * 2)
            .collect();

        assert_eq\!(result, vec\![2, 4, 6, 8, 10]);
    }

    #[test]
    fn test_iterator_config_default() {
        let config = IteratorConfig::default();
        assert\!(\!config.enable_parallel);
        assert_eq\!(config.buffer_size, 1024);
        assert_eq\!(config.memory_limit, 10 * 1024 * 1024);
    }

    #[test]
    fn test_iterator_config_custom() {
        let config = IteratorConfig {
            enable_parallel: true,
            buffer_size: 2048,
            memory_limit: 20 * 1024 * 1024,
        };

        assert\!(config.enable_parallel);
        assert_eq\!(config.buffer_size, 2048);
        assert_eq\!(config.memory_limit, 20 * 1024 * 1024);
    }

    #[test]
    fn test_iterator_chain_empty() {
        let engine = IteratorEngine::new();
        let data: Vec<i32> = vec\![];
        let result: Vec<i32> = engine.from_vec(data).collect();
        assert_eq\!(result, vec\![]);
    }

    #[test]
    fn test_iterator_chain_single_element() {
        let engine = IteratorEngine::new();
        let data = vec\![42];
        let result: Vec<i32> = engine.from_vec(data)
            .map(|x| x + 1)
            .collect();
        assert_eq\!(result, vec\![43]);
    }

    #[test]
    fn test_iterator_chain_count() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3, 4, 5];
        let count = engine.from_vec(data)
            .filter(|&x| x > 2)
            .count();
        assert_eq\!(count, 3);
    }

    #[test]
    fn test_iterator_chain_first() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3, 4, 5];
        let first = engine.from_vec(data)
            .filter(|&x| x > 2)
            .first();
        assert_eq\!(first, Some(3));
    }

    #[test]
    fn test_iterator_chain_first_empty() {
        let engine = IteratorEngine::new();
        let data: Vec<i32> = vec\![];
        let first = engine.from_vec(data).first();
        assert_eq\!(first, None);
    }

    #[test]
    fn test_iterator_chain_fold() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3, 4, 5];
        let sum = engine.from_vec(data)
            .fold(0, |acc, x| acc + x);
        assert_eq\!(sum, 15);
    }

    #[test]
    fn test_iterator_chain_operations_tracking() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3];
        let chain = engine.from_vec(data)
            .map(|x| x * 2)
            .filter(|&x| x > 2);

        let operations = chain.operations();
        assert_eq\!(operations.len(), 2);
        assert_eq\!(operations[0], "map");
        assert_eq\!(operations[1], "filter");
    }

    #[test]
    fn test_iterator_chain_complex_operations() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3, 4, 5];
        
        let chain = engine.from_vec(data)
            .filter(|&x| x % 2 == 0)
            .map(|x| x * 3);

        let operations = chain.operations();
        assert_eq\!(operations, vec\!["filter", "map"]);
    }

    #[test]
    fn test_zero_copy_processing_empty() {
        let engine = IteratorEngine::new();
        let data: Vec<i32> = vec\![];
        let result = engine.process_zero_copy(&data, |&x| x * 2);
        assert_eq\!(result, vec\![]);
    }

    #[test]
    fn test_zero_copy_processing_large_dataset() {
        let engine = IteratorEngine::new();
        let data: Vec<i32> = (1..=100).collect();
        let result = engine.process_zero_copy(&data, |&x| x + 1);
        
        assert_eq\!(result.len(), 100);
        assert_eq\!(result[0], 2);
        assert_eq\!(result[99], 101);
    }

    #[test]
    fn test_iterator_join() {
        let engine = IteratorEngine::new();
        let left = vec\![
            ("a", 1),
            ("b", 2),
            ("c", 3),
        ];
        let right = vec\![
            ("a", 10),
            ("b", 20),
            ("d", 30),
        ];

        let result: Vec<((&str, i32), (&str, i32))> = engine
            .from_vec(left)
            .join(right, |(k, _)| *k, |(k, _)| *k)
            .collect();

        assert_eq\!(result.len(), 2);
        assert\!(result.iter().any(|&((k1, _), (k2, _))| k1 == "a" && k2 == "a"));
        assert\!(result.iter().any(|&((k1, _), (k2, _))| k1 == "b" && k2 == "b"));
    }

    #[test]
    fn test_iterator_join_no_matches() {
        let engine = IteratorEngine::new();
        let left = vec\![("a", 1), ("b", 2)];
        let right = vec\![("c", 10), ("d", 20)];

        let result: Vec<((&str, i32), (&str, i32))> = engine
            .from_vec(left)
            .join(right, |(k, _)| *k, |(k, _)| *k)
            .collect();

        assert_eq\!(result.len(), 0);
    }

    #[test]
    fn test_iterator_join_multiple_matches() {
        let engine = IteratorEngine::new();
        let left = vec\![("a", 1), ("a", 2)];
        let right = vec\![("a", 10), ("a", 20)];

        let result: Vec<((&str, i32), (&str, i32))> = engine
            .from_vec(left)
            .join(right, |(k, _)| *k, |(k, _)| *k)
            .collect();

        // Should get all combinations: (a,1)x(a,10), (a,1)x(a,20), (a,2)x(a,10), (a,2)x(a,20)
        assert_eq\!(result.len(), 4);
    }

    #[test]
    fn test_engine_metrics() {
        let engine = IteratorEngine::new();
        let metrics = engine.metrics();
        assert_eq\!(metrics.len(), 0);
    }

    #[test]
    fn test_engine_reset_metrics() {
        let mut engine = IteratorEngine::new();
        engine.reset_metrics();
        assert_eq\!(engine.metrics().len(), 0);
    }

    #[test]
    fn test_iterator_chain_with_strings() {
        let engine = IteratorEngine::new();
        let data = vec\!["hello", "world", "rust"];
        
        let result: Vec<String> = engine
            .from_vec(data)
            .map(|s| s.to_uppercase())
            .collect();

        assert_eq\!(result, vec\!["HELLO", "WORLD", "RUST"]);
    }

    #[test]
    fn test_iterator_chain_filter_strings() {
        let engine = IteratorEngine::new();
        let data = vec\!["cat", "dog", "elephant", "ant"];
        
        let result: Vec<&str> = engine
            .from_vec(data)
            .filter(|s| s.len() > 3)
            .collect();

        assert_eq\!(result, vec\!["elephant"]);
    }

    #[test]
    fn test_zero_copy_with_complex_transform() {
        let engine = IteratorEngine::new();
        let data = vec\![(1, "a"), (2, "b"), (3, "c")];
        
        let result = engine.process_zero_copy(&data, |(num, _)| num * 2);
        assert_eq\!(result, vec\![2, 4, 6]);
    }

    #[test]
    fn test_iterator_config_clone() {
        let config1 = IteratorConfig::default();
        let config2 = config1.clone();
        
        assert_eq\!(config1.enable_parallel, config2.enable_parallel);
        assert_eq\!(config1.buffer_size, config2.buffer_size);
        assert_eq\!(config1.memory_limit, config2.memory_limit);
    }

    #[test]
    fn test_iterator_engine_default() {
        let engine1 = IteratorEngine::new();
        let engine2 = IteratorEngine::default();
        
        assert_eq\!(engine1.metrics().len(), engine2.metrics().len());
    }

    #[test]
    fn test_iterator_chain_multiple_filters() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        
        let result: Vec<i32> = engine
            .from_vec(data)
            .filter(|&x| x > 2)        // [3,4,5,6,7,8,9,10]
            .filter(|&x| x < 8)        // [3,4,5,6,7]
            .filter(|&x| x % 2 == 0)   // [4,6]
            .collect();

        assert_eq\!(result, vec\![4, 6]);
    }

    #[test]
    fn test_iterator_chain_multiple_maps() {
        let engine = IteratorEngine::new();
        let data = vec\![1, 2, 3];
        
        let result: Vec<i32> = engine
            .from_vec(data)
            .map(|x| x + 1)    // [2,3,4]
            .map(|x| x * 2)    // [4,6,8]
            .map(|x| x - 1)    // [3,5,7]
            .collect();

        assert_eq\!(result, vec\![3, 5, 7]);
    }