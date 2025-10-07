//! Functional Query Composition
//!
//! This module provides functional composition capabilities for database queries,
//! enabling lazy evaluation of large result sets, automatic parameter sanitization,
//! and type-safe predicate composition. It integrates deeply with Diesel ORM
//! while maintaining functional programming principles.
//!
//! **SQL Injection Protection Strategy:**
//! This module implements defense-in-depth for SQL injection prevention:
//! - **Primary defense:** Diesel ORM's parameterized queries handle all user input
//! - **Secondary defense:** The ParameterSanitizer provides additional validation
//!   by rejecting dangerous patterns in SQL comments, keywords, and encoded sequences
//! - All user-provided values are bound as parameters, never concatenated into SQL strings
//!
//! Key Features:
//! - Lazy evaluation for large datasets with automatic chunking
//! - Parameterized queries with automatic sanitization
//! - Functional predicate composition with monadic operations
//! - Query performance monitoring and optimization
//! - Asynchronous query execution patterns

use crate::functional::query_builder::{
    Column, Operator, Predicate, QueryFilter, TypeSafeQueryBuilder,
};
use std::collections::HashMap;
use std::marker::PhantomData;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

/// Lazy evaluation configuration for large result sets.
///
/// Controls how queries are chunked and evaluated to prevent
/// memory exhaustion with large datasets.
#[derive(Debug, Clone)]
pub struct LazyEvaluationConfig {
    /// Maximum number of records to load at once
    pub chunk_size: usize,
    /// Maximum total records to process
    pub max_total_records: Option<usize>,
    /// Timeout for individual query chunks
    pub chunk_timeout: Duration,
    /// Enable parallel processing of chunks
    pub parallel_processing: bool,
    /// Maximum concurrent chunks
    pub max_concurrent_chunks: usize,
}

impl Default for LazyEvaluationConfig {
    /// Creates a default LazyEvaluationConfig with sensible chunking and concurrency settings.
    ///
    /// The default values are:
    /// - `chunk_size = 1000`
    /// - `max_total_records = Some(100_000)`
    /// - `chunk_timeout = 30` seconds
    /// - `parallel_processing = true`
    /// - `max_concurrent_chunks = 4`
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = LazyEvaluationConfig::default();
    /// assert_eq!(cfg.chunk_size, 1000);
    /// assert_eq!(cfg.max_total_records, Some(100_000));
    /// assert_eq!(cfg.chunk_timeout.as_secs(), 30);
    /// assert!(cfg.parallel_processing);
    /// assert_eq!(cfg.max_concurrent_chunks, 4);
    /// ```
    fn default() -> Self {
        Self {
            chunk_size: 1000,
            max_total_records: Some(100_000),
            chunk_timeout: Duration::from_secs(30),
            parallel_processing: true,
            max_concurrent_chunks: 4,
        }
    }
}

/// Performance metrics for query composition and execution.
#[derive(Debug, Clone)]
pub struct QueryPerformanceMetrics {
    /// Total time spent composing the query
    pub composition_time: Duration,
    /// Total time spent executing the query
    pub execution_time: Duration,
    /// Number of records processed
    pub records_processed: usize,
    /// Query complexity score (0-100, higher is more complex)
    pub complexity_score: u32,
    /// Memory usage in bytes
    pub memory_usage: usize,
    /// Number of database round trips
    pub round_trips: usize,
}

/// Functional query composer that combines predicates using monadic operations.
///
/// This struct enables functional composition of database queries while maintaining
/// type safety and providing lazy evaluation capabilities.
pub struct FunctionalQueryComposer<T, U> {
    /// Base query builder
    builder: TypeSafeQueryBuilder<T, U>,
    /// Current composed filter
    current_filter: Option<QueryFilter<U>>,
    /// Lazy evaluation configuration
    lazy_config: LazyEvaluationConfig,
    /// Performance metrics collector
    metrics: QueryPerformanceMetrics,
    /// Type markers
    _phantom: PhantomData<(T, U)>,
}

// Monadic predicate composition for functional query building.
///
/// This represents a predicate that can be composed with others using
/// functional programming patterns (map, flat_map, filter, etc.)
pub struct ComposablePredicate<T> {
    /// The underlying predicate
    predicate: Predicate<T>,
    /// Metadata for composition and optimization
    metadata: PredicateMetadata,
}

#[derive(Debug, Clone)]
pub struct PredicateMetadata {
    /// Estimated selectivity (0.0 to 1.0, lower is more selective)
    pub selectivity: f64,
    /// Estimated cost in query execution time
    pub cost_estimate: Duration,
    /// Whether this predicate can be pushed down to the database
    pub pushdown_capable: bool,
    /// Dependencies on other predicates
    pub dependencies: Vec<String>,
}

impl<T> ComposablePredicate<T>
where
    T: Clone + Send + Sync + 'static,
{
    /// Constructs a ComposablePredicate from the provided predicate and metadata.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use std::time::Duration;
    /// // construct a predicate and metadata appropriate for your domain
    /// let predicate = Predicate::equals("id", 42);
    /// let metadata = PredicateMetadata {
    ///     selectivity: 0.1,
    ///     cost_estimate: Duration::from_millis(10),
    ///     pushdown_capable: true,
    ///     dependencies: vec![],
    /// };
    /// let composable = ComposablePredicate::new(predicate, metadata);
    /// ```
    pub fn new(predicate: Predicate<T>, metadata: PredicateMetadata) -> Self {
        Self {
            predicate,
            metadata,
        }
    }

    /// Map operation for functional composition.
    ///
    /// # Arguments
    /// * `f` - Mapping function
    ///
    /// # Returns
    /// A new ComposablePredicate with transformed predicate
    pub fn map<F, U>(self, f: F) -> ComposablePredicate<U>
    where
        F: FnOnce(Predicate<T>) -> Predicate<U>,
        U: Clone + Send + Sync + 'static,
    {
        let new_predicate = f(self.predicate);
        ComposablePredicate {
            predicate: new_predicate,
            metadata: self.metadata,
        }
    }

    /// Transforms the underlying predicate into an iterator of composable predicates using the provided mapping function.
    ///
    /// Applies the closure `f` to the contained `Predicate<T>` and returns the resulting iterator of `ComposablePredicate<U>`.
    ///
    /// # Parameters
    ///
    /// - `f` - A function that takes the inner `Predicate<T>` and produces an iterator yielding `ComposablePredicate<U>`.
    ///
    /// # Returns
    ///
    /// An iterator that yields `ComposablePredicate<U>` items produced by the mapping function.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// // Example usage: map the inner predicate to a vector of new composable predicates and iterate them.
    /// let composer_predicate = /* a ComposablePredicate<i32> value */;
    /// let iter = composer_predicate.flat_map(|pred| {
    ///     // create one or more ComposablePredicate<String> instances from `pred`
    ///     vec![/* ComposablePredicate::new(...) */].into_iter()
    /// });
    /// for p in iter {
    ///     // process each ComposablePredicate<String>
    /// }
    /// ```
    pub fn flat_map<F, U, I>(self, f: F) -> I
    where
        F: FnOnce(Predicate<T>) -> I,
        I: Iterator<Item = ComposablePredicate<U>>,
        U: Clone + Send + Sync + 'static,
    {
        f(self.predicate)
    }

    /// Returns the predicate wrapped in `Some` when a provided test returns true.
    ///
    /// Applies `f` to the underlying `Predicate<T>` and yields `Some(self)` if `f` returns `true`, otherwise `None`.
    ///
    /// # Parameters
    ///
    /// - `f`: Closure that receives a reference to the inner `Predicate<T>` and returns `true` to keep the predicate.
    ///
    /// # Examples
    ///
    /// ```
    /// // hypothetical usage; replace `some_predicate` and `metadata` with real values
    /// let p = ComposablePredicate::new(some_predicate, metadata);
    /// let kept = p.filter(|pred| /* inspect pred and return true to keep */ true);
    /// assert!(kept.is_some());
    /// ```
    pub fn filter<F>(self, f: F) -> Option<Self>
    where
        F: FnOnce(&Predicate<T>) -> bool,
    {
        if f(&self.predicate) {
            Some(self)
        } else {
            None
        }
    }
}

/// Lazy evaluation iterator for large datasets.
///
/// This iterator processes data in chunks to prevent memory exhaustion
/// while providing a seamless streaming interface.
pub struct LazyQueryIterator<T, U> {
    /// The query composer
    composer: Arc<FunctionalQueryComposer<T, U>>,
    /// Current chunk being processed
    current_chunk: Vec<U>,
    /// Current position in the chunk
    chunk_position: usize,
    /// Current offset in the total dataset
    offset: usize,
    /// Page size for chunked loading
    page_size: usize,
    /// Total records processed so far
    total_processed: usize,
    /// Whether the iterator is exhausted
    exhausted: bool,
    /// Semaphore for controlling concurrency
    semaphore: Arc<Semaphore>,
    /// Performance metrics
    metrics: QueryPerformanceMetrics,
}

impl<T, U> LazyQueryIterator<T, U>
where
    T: Send + Sync + 'static,
    U: Clone + Send + Sync + 'static,
{
    /// Creates a new LazyQueryIterator that will stream query results in configurable chunks.
    ///
    /// The iterator is initialized with an empty current chunk, zeroed positions/counters, and a
    /// page size taken from the composer's `lazy_config.chunk_size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::sync::Arc;
    /// use tokio::sync::Semaphore;
    ///
    /// // `composer` should be a prepared FunctionalQueryComposer<T, U>.
    /// // `metrics` should be a QueryPerformanceMetrics instance.
    /// let composer: Arc<FunctionalQueryComposer<i32, String>> = Arc::new(/* composer */ unimplemented!());
    /// let semaphore = Arc::new(Semaphore::new(1));
    /// let metrics = QueryPerformanceMetrics {
    ///     composition_time: std::time::Duration::from_secs(0),
    ///     execution_time: std::time::Duration::from_secs(0),
    ///     records_processed: 0,
    ///     complexity_score: 0,
    ///     memory_usage: 0,
    ///     round_trips: 0,
    /// };
    ///
    /// let iter = LazyQueryIterator::new(composer, semaphore, metrics);
    /// assert_eq!(iter.chunk_position, 0);
    /// ```
    pub fn new(
        composer: Arc<FunctionalQueryComposer<T, U>>,
        semaphore: Arc<Semaphore>,
        metrics: QueryPerformanceMetrics,
    ) -> Self {
        let page_size = composer.lazy_config.chunk_size;
        Self {
            composer,
            current_chunk: Vec::new(),
            chunk_position: 0,
            offset: 0,
            page_size,
            total_processed: 0,
            exhausted: false,
            semaphore,
            metrics,
        }
    }
}

impl<T, U> Iterator for LazyQueryIterator<T, U>
where
    T: Send + Sync + 'static,
    U: Clone + Send + Sync + 'static,
{
    type Item = U;

    /// Advances the lazy chunked iterator and yields the next item from the currently loaded page.
    ///
    /// If the current chunk is depleted the iterator attempts to load the next chunk; if no further
    /// data is available or chunk loading fails, the iterator becomes exhausted and subsequent calls
    /// return `None`. When an item is returned, the iterator's position and processed count are
    /// advanced.
    ///
    /// # Returns
    ///
    /// `Some(item)` with the next element from the current chunk, `None` when iteration is exhausted
    /// or when loading the next chunk fails.
    ///
    /// # Examples
    ///
    /// ```
    /// // Construct a LazyQueryIterator via its public constructor and consume items.
    /// // (Constructor shown here for illustration; adapt to actual `new` signature.)
    /// // let mut it = LazyQueryIterator::new(composer, semaphore, metrics);
    /// // while let Some(item) = it.next() {
    /// //     println!("{:?}", item);
    /// // }
    /// ```
    fn next(&mut self) -> Option<Self::Item> {
        if self.exhausted {
            return None;
        }

        // If we've exhausted the current chunk, load the next one
        if self.chunk_position >= self.current_chunk.len() {
            // TODO: In a real implementation, this would execute a chunked query:
            // 1. Build a query with LIMIT self.page_size OFFSET self.offset
            // 2. Execute the query and retrieve the next chunk of results
            // 3. Handle potential database errors (convert to iterator termination)
            //
            // Example pseudocode:
            // match self.composer.execute_chunk_query(self.offset, self.page_size) {
            //     Ok(chunk) => {
            //         if chunk.is_empty() {
            //             self.exhausted = true;
            //             return None;
            //         }
            //         self.current_chunk = chunk;
            //         self.chunk_position = 0;
            //         self.offset += self.current_chunk.len();
            //     }
            //     Err(_) => {
            //         // Database error - terminate iteration
            //         self.exhausted = true;
            //         return None;
            //     }
            // }
            //
            // For now, we mark as exhausted since query execution requires connection pool
            self.exhausted = true;
            return None;
        }

        // Return the next item from the current chunk
        let item = self.current_chunk[self.chunk_position].clone();
        self.chunk_position += 1;

        // Only update total_processed when we actually return an item
        self.total_processed += 1;

        Some(item)
    }
}

/// Automatic parameter sanitization for SQL injection prevention.
///
/// This struct ensures all query parameters are properly sanitized
/// and bound using parameterized queries.
pub struct ParameterSanitizer {
    /// Parameter bindings with type information
    bindings: HashMap<String, ParameterBinding>,
    /// Sanitization rules
    rules: Vec<SanitizationRule>,
}

#[derive(Debug, Clone)]
pub struct ParameterBinding {
    /// Parameter name
    pub name: String,
    /// Parameter value as string (for logging/debugging)
    pub value: String,
    /// SQL type of the parameter
    pub sql_type: String,
    /// Whether the parameter has been validated
    pub validated: bool,
}

#[derive(Debug, Clone)]
pub struct SanitizationRule {
    /// Rule name
    pub name: String,
    /// Rule pattern (regex or validation function)
    pub pattern: String,
    /// Error message if validation fails
    pub error_message: String,
}

impl ParameterSanitizer {
    /// Creates a new ParameterSanitizer with default sanitization rules and no bindings.
    ///
    /// # Examples
    ///
    /// ```
    /// let sanitizer = ParameterSanitizer::new();
    /// assert!(sanitizer.bindings().is_empty());
    /// ```
    pub fn new() -> Self {
        Self {
            bindings: HashMap::new(),
            rules: Self::default_rules(),
        }
    }

    /// Binds a parameter after validating its string representation against the configured sanitization rules.
    ///
    /// Converts `value` to a string, applies each sanitization rule in `self.rules`, and on success inserts a
    /// `ParameterBinding` marked `validated` into `self.bindings`.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut sanitizer = ParameterSanitizer::new();
    /// sanitizer
    ///     .bind_parameter("username".to_string(), "alice", "VARCHAR".to_string())
    ///     .unwrap();
    /// assert!(sanitizer.bindings().contains_key("username"));
    /// ```
    ///
    /// # Returns
    ///
    /// `Ok(())` on success; `Err(SanitizationError::ValidationFailed { .. })` if any rule rejects the value.
    pub fn bind_parameter<T>(
        &mut self,
        name: String,
        value: T,
        sql_type: String,
    ) -> Result<(), SanitizationError>
    where
        T: ToString + Send + Sync + 'static,
    {
        let value_str = value.to_string();

        // Apply sanitization rules
        for rule in &self.rules {
            if !self.apply_rule(&value_str, rule) {
                return Err(SanitizationError::ValidationFailed {
                    parameter: name.clone(),
                    rule: rule.name.clone(),
                    message: rule.error_message.clone(),
                });
            }
        }

        // Store the validated binding
        self.bindings.insert(
            name.clone(),
            ParameterBinding {
                name,
                value: value_str,
                sql_type,
                validated: true,
            },
        );

        Ok(())
    }

    /// Applies a sanitization rule to a string and reports whether it passes.
    ///
    /// Validates `value` according to `rule` (for example, rejecting SQL-injection patterns
    /// for the `"no_sql_injection"` rule or enforcing a maximum length for `"reasonable_length"`).
    ///
    /// # Arguments
    /// * `value` - The input string to validate.
    /// * `rule` - The sanitization rule that defines the check to perform.
    ///
    /// # Returns
    /// `true` if `value` satisfies the provided rule, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let sanitizer = crate::functional::query_composition::ParameterSanitizer::new();
    /// let rule = crate::functional::query_composition::SanitizationRule {
    ///     name: "reasonable_length".into(),
    ///     pattern: "".into(),
    ///     error_message: "too long".into(),
    /// };
    /// assert!(sanitizer.apply_rule("short", &rule));
    /// ```
    fn apply_rule(&self, value: &str, rule: &SanitizationRule) -> bool {
        // Defense-in-depth validation:
        // Primary defense is Diesel's parameterized queries
        // This provides additional pattern-based rejection
        match rule.name.as_str() {
            "no_sql_injection" => {
                // Reject SQL comment patterns
                if value.contains("--") || value.contains("/*") || value.contains("*/") {
                    return false;
                }
                // Reject common SQL statement keywords at word boundaries
                // (case-insensitive check for: SELECT, INSERT, UPDATE, DELETE, DROP, UNION, EXEC)
                let value_upper = value.to_uppercase();
                let dangerous_keywords = [
                    " SELECT ",
                    " INSERT ",
                    " UPDATE ",
                    " DELETE ",
                    " DROP ",
                    " UNION ",
                    " EXEC ",
                    " EXECUTE ",
                    ";SELECT",
                    ";INSERT",
                    ";UPDATE",
                    ";DELETE",
                    ";DROP",
                    ";UNION",
                    ";EXEC",
                ];
                for keyword in &dangerous_keywords {
                    if value_upper.contains(keyword) {
                        return false;
                    }
                }
                // Reject percent-encoding attempts (e.g., %27 for single quote)
                if value.contains('%') && value.chars().any(|c| c.is_ascii_hexdigit()) {
                    return false;
                }
                // Reject semicolons (statement terminators)
                !value.contains(&rule.pattern)
            }
            "reasonable_length" => value.len() <= 255, // Max reasonable length
            _ => true,                                 // Unknown rules pass by default
        }
    }

    /// Provides the module's default parameter sanitization rules.
    ///
    /// The returned vector contains two rules: `"no_sql_injection"`, which flags semicolon-like
    /// patterns as potentially dangerous, and `"reasonable_length"`, a placeholder rule that
    /// enforces a maximum length constraint.
    ///
    /// # Examples
    ///
    /// ```
    /// let rules = default_rules();
    /// assert!(rules.iter().any(|r| r.name == "no_sql_injection"));
    /// assert!(rules.iter().any(|r| r.name == "reasonable_length"));
    /// ```
    fn default_rules() -> Vec<SanitizationRule> {
        vec![
            SanitizationRule {
                name: "no_sql_injection".to_string(),
                pattern: ";".to_string(),
                error_message: "Parameter contains potentially dangerous SQL characters"
                    .to_string(),
            },
            SanitizationRule {
                name: "reasonable_length".to_string(),
                pattern: "".to_string(), // Would check length in real implementation
                error_message: "Parameter is too long".to_string(),
            },
        ]
    }

    /// Access the map of validated parameter bindings.
    ///
    /// # Returns
    ///
    /// A reference to the internal `HashMap` that maps parameter names to their validated `ParameterBinding` entries.
    ///
    /// # Examples
    ///
    /// ```
    /// let sanitizer = ParameterSanitizer::new();
    /// // after binding parameters...
    /// let bindings = sanitizer.bindings();
    /// if let Some(binding) = bindings.get("user_id") {
    ///     assert!(binding.validated);
    /// }
    /// ```
    pub fn bindings(&self) -> &HashMap<String, ParameterBinding> {
        &self.bindings
    }
}

/// Sanitization error types.
#[derive(Debug, Clone)]
pub enum SanitizationError {
    /// Parameter failed validation
    ValidationFailed {
        /// Parameter name
        parameter: String,
        /// Rule name that failed
        rule: String,
        /// Error message
        message: String,
    },
    /// Other sanitization error
    Other(String),
}

impl std::fmt::Display for SanitizationError {
    /// Formats the `SanitizationError` into a human-readable message.
    ///
    /// For `ValidationFailed`, produces:
    /// `"Parameter '<parameter>' failed rule '<rule>': <message>"`.
    /// For `Other`, produces: `"Sanitization error: <message>"`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::query_composition::SanitizationError;
    ///
    /// let v = SanitizationError::ValidationFailed {
    ///     parameter: "id".into(),
    ///     rule: "no_sql_injection".into(),
    ///     message: "contains ';'".into(),
    /// };
    /// assert_eq!(
    ///     format!("{}", v),
    ///     "Parameter 'id' failed rule 'no_sql_injection': contains ';'"
    /// );
    ///
    /// let o = SanitizationError::Other("unknown".into());
    /// assert_eq!(format!("{}", o), "Sanitization error: unknown");
    /// ```
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SanitizationError::ValidationFailed {
                parameter,
                rule,
                message,
            } => {
                write!(
                    f,
                    "Parameter '{}' failed rule '{}': {}",
                    parameter, rule, message
                )
            }
            SanitizationError::Other(msg) => write!(f, "Sanitization error: {}", msg),
        }
    }
}

impl std::error::Error for SanitizationError {}

/// Query optimization engine for functional compositions.
///
/// This analyzes predicate compositions and optimizes query execution
/// order and strategies.
pub struct QueryOptimizationEngine {
    /// Optimization rules
    rules: Vec<OptimizationRule>,
    /// Query complexity analyzer
    complexity_analyzer: ComplexityAnalyzer,
}

#[derive(Debug, Clone)]
pub struct OptimizationRule {
    /// Rule name
    pub name: String,
    /// Optimization logic description
    pub description: String,
    /// When this rule applies
    pub condition: String,
    /// Expected performance improvement
    pub improvement_factor: f64,
}

#[derive(Debug, Clone)]
pub struct ComplexityAnalyzer {
    /// Base complexity score
    pub base_score: u32,
    /// Complexity multipliers for different operations
    pub multipliers: HashMap<String, f64>,
}

impl QueryOptimizationEngine {
    /// Constructs a new QueryOptimizationEngine configured with default optimization rules and a fresh ComplexityAnalyzer.
    ///
    /// # Returns
    /// A configured `QueryOptimizationEngine` containing the default set of optimization rules and a newly initialized `ComplexityAnalyzer`.
    ///
    /// # Examples
    ///
    /// ```
    /// let engine = QueryOptimizationEngine::new();
    /// assert_eq!(engine.rules.len(), QueryOptimizationEngine::default_rules().len());
    /// ```
    pub fn new() -> Self {
        Self {
            rules: Self::default_rules(),
            complexity_analyzer: ComplexityAnalyzer::new(),
        }
    }

    /// Optimize a functional query composition and return the updated composer together with performance metrics.
    ///
    /// Applies the engine's optimization rules to the provided composer (may be a no-op) and produces updated
    /// composition metrics such as composition time and complexity score.
    ///
    /// # Arguments
    ///
    /// * `composer` - The functional query composition to optimize; ownership is taken and the (possibly)
    ///   optimized composer is returned.
    ///
    /// # Returns
    ///
    /// A tuple containing the optimized `FunctionalQueryComposer` and its updated `QueryPerformanceMetrics`.
    ///
    /// # Examples
    ///
    /// ```
    /// // Assume `engine` is a QueryOptimizationEngine and `composer` is a FunctionalQueryComposer.
    /// // let engine = QueryOptimizationEngine::new();
    /// // let composer = FunctionalQueryComposer::new(...);
    /// let (optimized, metrics) = engine.optimize(composer);
    /// // `optimized` is the (possibly) transformed composer and `metrics` contains updated timings/scores.
    /// ```
    pub fn optimize<T, U>(
        &self,
        composer: FunctionalQueryComposer<T, U>,
    ) -> (FunctionalQueryComposer<T, U>, QueryPerformanceMetrics)
    where
        T: Send + Sync + 'static,
        U: Clone + Send + Sync + 'static,
    {
        let start_time = Instant::now();

        // Apply optimization rules
        let optimized_composer = composer;

        // Calculate complexity
        let complexity = self.complexity_analyzer.analyze(&optimized_composer);

        // Update metrics
        let mut metrics = optimized_composer.metrics.clone();
        metrics.composition_time = start_time.elapsed();
        metrics.complexity_score = complexity;

        (optimized_composer, metrics)
    }

    /// Provide the default set of optimization rules applied by the query optimizer.
    ///
    /// The returned rules describe common optimization opportunities (filter pushdown, index utilization, and lazy evaluation),
    /// including a descriptive condition and an expected improvement factor for each rule.
    ///
    /// # Examples
    ///
    /// ```
    /// let rules = default_rules();
    /// assert!(rules.iter().any(|r| r.name == "filter_pushdown"));
    /// assert!(rules.iter().any(|r| r.name == "index_utilization"));
    /// assert!(rules.iter().any(|r| r.name == "lazy_evaluation"));
    /// ```
    fn default_rules() -> Vec<OptimizationRule> {
        vec![
            OptimizationRule {
                name: "filter_pushdown".to_string(),
                description: "Push selective filters down to reduce rows processed".to_string(),
                condition: "High selectivity predicates exist".to_string(),
                improvement_factor: 2.5,
            },
            OptimizationRule {
                name: "index_utilization".to_string(),
                description: "Ensure indexed columns are used effectively".to_string(),
                condition: "Indexed columns are being queried".to_string(),
                improvement_factor: 10.0,
            },
            OptimizationRule {
                name: "lazy_evaluation".to_string(),
                description: "Use lazy evaluation for large result sets".to_string(),
                condition: "Estimated result set > 10k rows".to_string(),
                improvement_factor: 3.0,
            },
        ]
    }
}

impl ComplexityAnalyzer {
    /// Constructs a ComplexityAnalyzer with default scoring multipliers.
    ///
    /// The returned analyzer has a base score of 10 and predefined multipliers for
    /// common operations: `join` (2.0), `subquery` (3.0), `aggregation` (1.5),
    /// and `ordering` (1.2).
    ///
    /// # Examples
    ///
    /// ```
    /// let analyzer = ComplexityAnalyzer::new();
    /// assert_eq!(analyzer.base_score, 10);
    /// assert_eq!(analyzer.multipliers.get("join"), Some(&2.0));
    /// ```
    pub fn new() -> Self {
        let mut multipliers = HashMap::new();
        multipliers.insert("join".to_string(), 2.0);
        multipliers.insert("subquery".to_string(), 3.0);
        multipliers.insert("aggregation".to_string(), 1.5);
        multipliers.insert("ordering".to_string(), 1.2);

        Self {
            base_score: 10,
            multipliers,
        }
    }

    /// Computes a bounded complexity score for a query composition.
    ///
    /// The score is a heuristic 0–100 measure of composition complexity derived from
    /// the analyzer's base score and adjusted for the number of filters and ordering
    /// specifications present in the provided composer.
    ///
    /// # Parameters
    ///
    /// * `composer` - The query composer whose composition is being evaluated.
    ///
    /// # Returns
    ///
    /// `u32` complexity score between 0 and 100 (inclusive).
    ///
    /// # Examples
    ///
    /// ```no_run
    /// let analyzer = ComplexityAnalyzer::new();
    /// // construct or obtain a FunctionalQueryComposer<T, U> named `composer`
    /// let score = analyzer.analyze(&composer);
    /// assert!(score <= 100);
    /// ```
    pub fn analyze<T, U>(&self, composer: &FunctionalQueryComposer<T, U>) -> u32
    where
        T: Send + Sync + 'static,
        U: Clone + Send + Sync + 'static,
    {
        let mut score = self.base_score;

        // Add complexity for each filter
        score += composer.builder.filters().len() as u32 * 5;

        // Add complexity for ordering
        score += composer.builder.order_by_specs().len() as u32 * 3;

        // Cap at 100
        score.min(100)
    }
}

/// Creates a ComposablePredicate for the given column comparison and attaches optimization metadata.
///
/// The `selectivity` value should be between 0.0 and 1.0 and expresses an estimate of the fraction of rows that will match this predicate. The function derives a `cost_estimate` from the provided `operator` and sets `pushdown_capable` to true by default.
///
/// # Returns
///
/// A `ComposablePredicate` containing the constructed `Predicate` and its `PredicateMetadata`.
///
/// # Examples
///
/// ```
/// use crate::functional::query_composition::{composable_predicate, Operator, Column};
///
/// // Example: equality predicate on a string column with low selectivity
/// let col = Column::new("users", "name");
/// let cp = composable_predicate(col, Operator::Equals, Some("alice".to_string()), "name".into(), 0.1);
/// assert_eq!(cp.metadata.selectivity, 0.1);
/// ```
pub fn composable_predicate<T>(
    column: Column<T, T>,
    operator: Operator,
    value: Option<T>,
    field_name: String,
    selectivity: f64,
) -> ComposablePredicate<T>
where
    T: Clone + Send + Sync + 'static,
{
    let predicate = Predicate::new(column, operator, value, field_name);

    let cost_estimate = match operator {
        Operator::Equals => Duration::from_millis(1),
        Operator::Contains => Duration::from_millis(5),
        Operator::GreaterThan | Operator::LessThan => Duration::from_millis(2),
        _ => Duration::from_millis(3),
    };

    let metadata = PredicateMetadata {
        selectivity,
        cost_estimate,
        pushdown_capable: true,
        dependencies: Vec::new(),
    };

    ComposablePredicate::new(predicate, metadata)
}

/// Convert a FieldFilter into a ComposablePredicate for compatibility with the functional query composer.
///
/// Converts a legacy FieldFilter (field, operator, value) into a ComposablePredicate<String>
/// that contains equivalent predicate metadata and a default selectivity.
///
/// # Returns
///
/// A `ComposablePredicate<String>` representing the same filtering condition as `filter`.
///
/// # Examples
///
/// ```
/// use crate::functional::query_composition::field_filter_to_composable;
/// use crate::models::filters::FieldFilter;
///
/// let f = FieldFilter { field: "name".into(), operator: "contains".into(), value: "alice".into() };
/// let pred = field_filter_to_composable(&f, "users");
/// // pred can now be used with the functional query composer APIs
/// ```
pub fn field_filter_to_composable(
    filter: &crate::models::filters::FieldFilter,
    table_name: &str,
) -> ComposablePredicate<String> {
    use crate::functional::query_builder::Operator::*;

    let operator = match filter.operator.as_str() {
        "equals" => Equals,
        "contains" => Contains,
        "gt" => GreaterThan,
        "lt" => LessThan,
        "gte" => GreaterThanEqual,
        "lte" => LessThanEqual,
        _ => Equals, // Default fallback
    };

    let field_name = filter.field.clone();
    let column_str = filter.field.clone();
    let column = Column::new(table_name.to_string(), column_str);

    composable_predicate(
        column,
        operator,
        Some(filter.value.clone()),
        field_name,
        0.5, // Default selectivity
    )
}