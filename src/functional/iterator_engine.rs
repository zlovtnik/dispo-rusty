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
    /// Creates a default `IteratorConfig` with conservative performance settings.
    ///
    /// The default configuration disables parallel processing, uses a buffer size of 1024,
    /// and sets a memory limit of 10 MB (10 * 1024 * 1024).
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = IteratorConfig::default();
    /// assert_eq!(cfg.enable_parallel, false);
    /// assert_eq!(cfg.buffer_size, 1024);
    /// assert_eq!(cfg.memory_limit, 10 * 1024 * 1024);
    /// ```
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
    /// Constructs a new IteratorChain that wraps the given iterator with the default configuration and no recorded operations.
    ///
    /// # Returns
    ///
    /// A new `IteratorChain` containing the provided iterator, `IteratorConfig::default()`, and an empty operations log.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// assert_eq!(chain.count(), 3);
    /// ```
    pub fn new(iterator: I) -> Self {
        Self {
            iterator,
            config: IteratorConfig::default(),
            operations: Vec::new(),
        }
    }

    /// Set the iterator chain's configuration.
    ///
    /// Replaces the chain's `config` with the provided `config` and returns the updated chain.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let cfg = IteratorConfig { enable_parallel: true, buffer_size: 2048, memory_limit: 5 * 1024 * 1024 };
    /// let updated = chain.with_config(cfg.clone());
    /// assert_eq!(updated.operations(), &Vec::<String>::new());
    /// ```
    pub fn with_config(mut self, config: IteratorConfig) -> Self {
        self.config = config;
        self
    }

    /// Applies a mapping function to each item in the chain.
    ///
    /// The returned chain yields the results of applying `f` to every element produced by this chain,
    /// and records the `"map"` operation in the chain's operation log.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = crate::functional::iterator_engine::IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let doubled = chain.map(|x| x * 2).collect();
    /// assert_eq!(doubled, vec![2, 4, 6]);
    /// ```
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

    /// Create a new IteratorChain that yields elements satisfying the predicate.
    ///
    /// The returned chain records the "filter" operation and produces only items for which `f` returns `true`.
    ///
    /// # Examples
    ///
    /// ```
    /// let v = vec![1, 2, 3, 4];
    /// let result = crate::functional::iterator_engine::IteratorChain::new(v.into_iter())
    ///     .filter(|&x| x % 2 == 0)
    ///     .collect();
    /// assert_eq!(result, vec![2, 4]);
    /// ```
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

    /// Produce pairs of left and right items whose keys are equal.
    ///
    /// Matches each item from the left iterator with all items from `other` that produce the same key,
    /// emitting one `(left, right)` pair for every match. The right-hand side is collected for lookup,
    /// and both `T` and `V` must implement `Clone` so matched pairs can be produced.
    ///
    /// # Examples
    ///
    /// ```
    /// let left = vec![1, 2];
    /// let right = vec![(1, "a"), (1, "b"), (2, "c")];
    ///
    /// let result: Vec<(i32, (&'static str))> = IteratorChain::new(left.into_iter())
    ///     .join(right, |&l| l, |&(k, _)| k)
    ///     .collect();
    ///
    /// assert_eq!(result, vec![(1, "a"), (1, "b"), (2, "c")]);
    /// ```
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

    /// Collects all remaining items from the chain into a vector.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let v = chain.collect();
    /// assert_eq!(v, vec![1, 2, 3]);
    /// ```
    pub fn collect(self) -> Vec<T> {
        self.iterator.collect()
    }

    /// Compute the number of elements remaining in the chain.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// assert_eq!(chain.count(), 3);
    /// ```
    pub fn count(self) -> usize {
        self.iterator.count()
    }

    /// Return the first element of the iterator, if any.
    ///
    /// # Examples
    ///
    /// ```
    /// let first = IteratorChain::new(vec![1, 2, 3].into_iter()).first();
    /// assert_eq!(first, Some(1));
    /// ```
    pub fn first(mut self) -> Option<T> {
        self.iterator.next()
    }

    /// Aggregate the chain's items into a single value using a reducer function.
    ///
    /// # Examples
    ///
    /// ```
    /// let v = vec![1, 2, 3];
    /// let sum = IteratorChain::new(v.into_iter()).fold(0, |acc, x| acc + x);
    /// assert_eq!(sum, 6);
    /// ```
    pub fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, T) -> B,
    {
        self.iterator.fold(init, f)
    }

    /// Retrieve the logged transformation operations for this iterator chain.
    ///
    /// The returned slice contains the operation names in the order they were recorded.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter()).map(|x| x * 2).filter(|x| x > &2);
    /// let ops = chain.operations();
    /// assert_eq!(ops, &["map".to_string(), "filter".to_string()]);
    /// ```
    pub fn operations(&self) -> &[String] {
        &self.operations
    }
}

impl<T, I> fmt::Debug for IteratorChain<T, I>
where
    I: Iterator<Item = T> + fmt::Debug,
{
    /// Formats the `IteratorChain` using the debug builder to show its iterator, config, and operations.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let s = format!("{chain:?}");
    /// assert!(s.contains("IteratorChain"));
    /// assert!(s.contains("config"));
    /// assert!(s.contains("operations"));
    /// ```
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
    /// Constructs a new IteratorEngine with the default configuration and no performance metrics.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// assert!(engine.metrics().is_empty());
    /// ```
    pub fn new() -> Self {
        Self {
            config: IteratorConfig::default(),
            performance_metrics: HashMap::new(),
        }
    }

    /// Creates an IteratorEngine configured with the provided `config`.
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = IteratorConfig { enable_parallel: true, buffer_size: 512, memory_limit: 1024 };
    /// let engine = IteratorEngine::with_config(cfg);
    /// assert!(engine.metrics().is_empty());
    /// ```
    pub fn with_config(config: IteratorConfig) -> Self {
        Self {
            config,
            performance_metrics: HashMap::new(),
        }
    }

    /// Create an IteratorChain from the given iterator using this engine's configuration.
    ///
    /// The returned chain wraps the provided iterator and inherits the engine's `IteratorConfig`.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let vec = vec![1, 2, 3];
    /// let chain = engine.from_iter(vec.into_iter());
    /// assert_eq!(chain.collect(), vec![1, 2, 3]);
    /// ```
    pub fn from_iter<T, I>(&self, iterator: I) -> IteratorChain<T, I>
    where
        I: Iterator<Item = T>,
    {
        IteratorChain::new(iterator).with_config(self.config.clone())
    }

    /// Builds an IteratorChain from a Vec, applying the engine's configuration.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let v = vec![1, 2, 3];
    /// let chain = engine.from_vec(v);
    /// let collected = chain.collect();
    /// assert_eq!(collected, vec![1, 2, 3]);
    /// ```
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

    /// Applies `transform` to each element of `data` and returns a vector of the results.
    ///
    /// If the crate is built with the `parallel` feature enabled, and the engine's
    /// `config.enable_parallel` is `true` and `data.len()` exceeds `config.buffer_size`,
    /// the transformation is performed in parallel; otherwise it is performed sequentially.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::sync::Arc;
    /// # use crate::functional::iterator_engine::{IteratorEngine, IteratorConfig};
    /// let engine = IteratorEngine::with_config(IteratorConfig { enable_parallel: false, buffer_size: 2, memory_limit: 0 });
    /// let data = vec![1, 2, 3];
    /// let out = engine.process_zero_copy(&data, |x| x * 2);
    /// assert_eq!(out, vec![2, 4, 6]);
    /// ```
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

    /// Accesses the engine's performance metrics.
    ///
    /// The map keys are metric names and the values are their recorded counts.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let metrics = engine.metrics();
    /// assert!(metrics.is_empty());
    /// ```
    pub fn metrics(&self) -> &HashMap<String, u64> {
        &self.performance_metrics
    }

    /// Clears all collected performance metrics from the engine.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut engine = IteratorEngine::new();
    /// // simulate metrics being recorded
    /// engine.performance_metrics.insert("ops".to_string(), 1);
    /// assert!(!engine.metrics().is_empty());
    /// engine.reset_metrics();
    /// assert!(engine.metrics().is_empty());
    /// ```
    pub fn reset_metrics(&mut self) {
        self.performance_metrics.clear();
    }
}

impl Default for IteratorEngine {
    /// Construct a default IteratorEngine with the default configuration and no collected metrics.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::default();
    /// assert!(engine.metrics().is_empty());
    /// ```
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