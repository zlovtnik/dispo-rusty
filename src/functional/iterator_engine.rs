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
    /// Creates an IteratorConfig populated with the library's sensible defaults.
    ///
    /// The defaults are:
    /// - `enable_parallel = false`
    /// - `buffer_size = 1024`
    /// - `memory_limit = 10 * 1024 * 1024` (10 MB)
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
    /// Constructs a new IteratorChain from an existing iterator with the default configuration.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let collected: Vec<_> = chain.collect();
    /// assert_eq!(collected, vec![1, 2, 3]);
    /// ```
    pub fn new(iterator: I) -> Self {
        Self {
            iterator,
            config: IteratorConfig::default(),
            operations: Vec::new(),
        }
    }

    /// Replace the chain's configuration with the provided `IteratorConfig` and return the updated chain.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let cfg = IteratorConfig { enable_parallel: true, buffer_size: 2048, memory_limit: 10 * 1024 * 1024 };
    /// let chain = chain.with_config(cfg);
    /// ```
    pub fn with_config(mut self, config: IteratorConfig) -> Self {
        self.config = config;
        self
    }

    /// Transforms each item in the chain by applying the provided function and returns a new chain of the results.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorEngine::new().from_vec(vec![1, 2, 3]);
    /// let mapped = chain.map(|x| x * 2).collect();
    /// assert_eq!(mapped, vec![2, 4, 6]);
    /// ```
    ///
    /// # Returns
    ///
    /// A new `IteratorChain` that yields values produced by applying `f` to each item of the original chain.
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

    /// Filters items in the chain using the provided predicate and returns a new chain with the filter operation recorded.
    ///
    /// The predicate is applied to a reference to each item; items for which the predicate returns `true` are retained.
    /// This method appends "filter" to the chain's operations log.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3, 4].into_iter())
    ///     .filter(|&x| x % 2 == 0)
    ///     .collect();
    /// assert_eq!(chain, vec![2, 4]);
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

    /// Join two sequences by key, emitting every matching pair of left and right items.
    ///
    /// The right-hand sequence is collected into a map keyed by `other_key`. For each item from
    /// the left iterator, this returns a pair for every right-hand item whose key equals the
    /// left item's `self_key`. Both left and right items are cloned as required by the API.
    ///
    /// # Examples
    ///
    /// ```
    /// // left: [1, 2, 3]
    /// // right: [(1, 10), (2, 20), (1, 11)]
    /// // result: [(1, 10), (1, 11), (2, 20)]
    /// let left_chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let joined: Vec<_> = left_chain
    ///     .join(
    ///         vec![(1, 10), (2, 20), (1, 11)],
    ///         |l: &i32| *l,
    ///         |r: &(i32, i32)| r.0,
    ///     )
    ///     .collect();
    /// assert_eq!(joined, vec![(1, 10), (1, 11), (2, 20)]);
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

    /// Computes the Cartesian product of this iterator with another iterator.
    ///
    /// Returns an `IteratorChain` that produces all pairs `(a, b)` where `a` is from
    /// this iterator and `b` is from the other iterator. The pairs are generated in
    /// lexicographic order: all pairs with the first element of this iterator come first,
    /// then all pairs with the second element, and so on.
    ///
    /// # Type Parameters
    ///
    /// * `U` - The type that can be converted into an iterator. Its `IntoIter` must
    ///   implement `Clone` to allow the iterator to be reused for each element from
    ///   the first iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crate::functional::iterator_engine::{IteratorEngine, IteratorChain};
    /// let engine = IteratorEngine::new();
    /// let data1 = vec![1, 2];
    /// let data2 = vec![3, 4];
    ///
    /// let products: Vec<(i32, i32)> = engine.from_vec(data1).cartesian_product(data2).collect();
    ///
    /// assert_eq!(products, vec![(1, 3), (1, 4), (2, 3), (2, 4)]);
    /// ```
    pub fn cartesian_product<U>(
        self,
        other: U,
    ) -> IteratorChain<(T, U::Item), itertools::Product<I, U::IntoIter>>
    where
        U: IntoIterator,
        U::IntoIter: Clone,
        T: Clone,
    {
        use itertools::Itertools;

        let mut operations = self.operations;
        operations.push("cartesian_product".to_string());

        let product = self.iterator.cartesian_product(other);
        IteratorChain {
            iterator: product,
            config: self.config,
            operations,
        }
    }

    /// Collects all items from the chain into a `Vec`.
    ///
    /// Returns a `Vec<T>` containing every item produced by the chain's iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crate::functional::iterator_engine::IteratorChain;
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let v = chain.collect();
    /// assert_eq!(v, vec![1, 2, 3]);
    /// ```
    pub fn collect(self) -> Vec<T> {
        self.iterator.collect()
    }

    /// Counts the remaining elements in the chain.
    ///
    /// Returns the number of remaining elements.
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

    /// Retrieve the first element of the chain, consuming the chain.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// assert_eq!(chain.first(), Some(1));
    /// ```
    pub fn first(mut self) -> Option<T> {
        self.iterator.next()
    }

    /// Reduces the iterator's items into a single value by applying an accumulator function.
    ///
    /// # Returns
    ///
    /// The final accumulated value after processing all items.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let sum = chain.fold(0, |acc, x| acc + x);
    /// assert_eq!(sum, 6);
    /// ```
    pub fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, T) -> B,
    {
        self.iterator.fold(init, f)
    }

    /// Returns a slice of operation names recorded by this iterator chain.
    ///
    /// The slice reflects the sequence of transformation names (e.g., "map", "filter", "join")
    /// that have been applied to the chain for debugging or monitoring purposes.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let chain = engine.from_vec(vec![1, 2, 3]).map(|x| x * 2);
    /// let ops = chain.operations();
    /// assert_eq!(ops, &["map"]);
    /// ```
    pub fn operations(&self) -> &[String] {
        &self.operations
    }
}

impl<T, I> fmt::Debug for IteratorChain<T, I>
where
    I: Iterator<Item = T> + fmt::Debug,
{
    /// Formats the `IteratorChain` for debugging by emitting a struct-like representation
    /// with the fields `iterator`, `config`, and `operations`.
    ///
    /// # Examples
    ///
    /// ```
    /// let chain = IteratorChain::new(vec![1, 2, 3].into_iter());
    /// let s = format!("{:?}", chain);
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

    /// Constructs an IteratorEngine configured with the given settings.
    ///
    /// The returned engine uses `config` for its behavior and initializes an empty
    /// performance metrics map.
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = IteratorConfig {
    ///     enable_parallel: true,
    ///     buffer_size: 2048,
    ///     memory_limit: 16 * 1024 * 1024,
    /// };
    /// let engine = IteratorEngine::with_config(cfg);
    /// assert_eq!(engine.metrics().len(), 0);
    /// ```
    pub fn with_config(config: IteratorConfig) -> Self {
        Self {
            config,
            performance_metrics: HashMap::new(),
        }
    }

    /// Create an IteratorChain from an existing iterator using this engine's configuration.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let chain = engine.from_iter(vec![1, 2, 3].into_iter());
    /// let collected = chain.collect();
    /// assert_eq!(collected, vec![1, 2, 3]);
    /// ```
    pub fn from_iter<T, I>(&self, iterator: I) -> IteratorChain<T, I>
    where
        I: Iterator<Item = T>,
    {
        IteratorChain::new(iterator).with_config(self.config.clone())
    }

    /// Creates an `IteratorChain` backed by the given vector.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let chain = engine.from_vec(vec![1, 2, 3]);
    /// let collected: Vec<_> = chain.collect();
    /// assert_eq!(collected, vec![1, 2, 3]);
    /// ```
    pub fn from_vec<T>(&self, vec: Vec<T>) -> IteratorChain<T, std::vec::IntoIter<T>> {
        self.from_iter(vec.into_iter())
    }

    /// Applies `transform` to each element of `data` by reference and returns a `Vec` of the results.
    ///
    /// This function borrows each input (`&T`) so elements are not cloned; when the engine's
    /// `config.enable_parallel` is true and the crate is built with the `"parallel"` feature,
    /// processing may run in parallel for large inputs, otherwise it runs sequentially.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let data = [1, 2, 3];
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

    /// Access the current performance metrics collected by the engine.
    ///
    /// The returned map associates metric names with their recorded numeric values.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::new();
    /// let metrics = engine.metrics();
    /// // newly created engine has no metrics recorded
    /// assert!(metrics.is_empty());
    /// ```
    pub fn metrics(&self) -> &HashMap<String, u64> {
        &self.performance_metrics
    }

    /// Clears all recorded performance metrics from the engine.
    ///
    /// This removes every entry from the engine's internal metrics map so subsequent
    /// calls to `metrics()` will return an empty collection.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut engine = IteratorEngine::new();
    /// // metrics start empty by default; calling reset_metrics ensures they are empty
    /// engine.reset_metrics();
    /// assert!(engine.metrics().is_empty());
    /// ```
    pub fn reset_metrics(&mut self) {
        self.performance_metrics.clear();
    }
}

impl Default for IteratorEngine {
    /// Creates a default IteratorEngine configured with the library's standard settings.
    ///
    /// The created engine uses the default `IteratorConfig` and starts with empty performance metrics.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = IteratorEngine::default();
    /// let chain = engine.from_vec(vec![1, 2, 3]);
    /// assert_eq!(chain.collect(), vec![1, 2, 3]);
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

    #[test]
    fn test_cartesian_product() {
        let engine = IteratorEngine::new();
        let data1 = vec![1, 2];
        let data2 = vec![3, 4];

        let products: Vec<(i32, i32)> = engine.from_vec(data1).cartesian_product(data2).collect();

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
