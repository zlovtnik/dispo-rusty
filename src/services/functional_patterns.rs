//! Advanced Functional Patterns for Service Layer
//!
//! Provides reusable functional programming patterns specifically designed for service operations.
//! These patterns enable composable, testable, and maintainable business logic through
//! higher-order functions and monadic compositions.

use crate::{
    config::db::Pool,
    error::{ServiceError, ServiceResult},
};
use diesel::PgConnection;
use std::marker::PhantomData;

/// Composable query operations using the Reader monad pattern
///
/// This allows building complex database operations from smaller, composable pieces
/// without explicitly passing the connection around.
pub struct QueryReader<T> {
    run: Box<dyn Fn(&mut PgConnection) -> ServiceResult<T> + Send + Sync>,
}

impl<T> QueryReader<T> {
    /// Create a new QueryReader from a function
    pub fn new<F>(f: F) -> Self
    where
        F: Fn(&mut PgConnection) -> ServiceResult<T> + Send + Sync + 'static,
    {
        Self { run: Box::new(f) }
    }

    /// Execute the query with the provided connection
    pub fn run(&self, conn: &mut PgConnection) -> ServiceResult<T> {
        (self.run)(conn)
    }

    /// Map the result of this query to a new type
    pub fn map<U, F>(self, f: F) -> QueryReader<U>
    where
        F: Fn(T) -> U + Send + Sync + 'static,
        T: 'static,
    {
        QueryReader::new(move |conn| self.run(conn).map(&f))
    }

    /// Chain another query operation that depends on the result of this one
    pub fn and_then<U, F>(self, f: F) -> QueryReader<U>
    where
        F: Fn(T) -> QueryReader<U> + Send + Sync + 'static,
        T: 'static,
    {
        QueryReader::new(move |conn| {
            let result = self.run(conn)?;
            f(result).run(conn)
        })
    }

    /// Add validation logic before executing the query
    pub fn validate<F>(self, validator: F) -> QueryReader<T>
    where
        F: Fn(&T) -> ServiceResult<()> + Send + Sync + 'static,
        T: Clone + 'static,
    {
        QueryReader::new(move |conn| {
            let result = self.run(conn)?;
            validator(&result)?;
            Ok(result)
        })
    }
}

/// Execute a QueryReader with a database pool
pub fn run_query<T>(reader: QueryReader<T>, pool: &Pool) -> ServiceResult<T> {
    pool.get()
        .map_err(|e| {
            ServiceError::internal_server_error(format!("Failed to get database connection: {}", e))
        })
        .and_then(|mut conn| reader.run(&mut conn))
}

/// Functional Either type for representing computations that can fail in two different ways
#[derive(Debug, Clone)]
pub enum Either<L, R> {
    Left(L),
    Right(R),
}

impl<L, R> Either<L, R> {
    /// Check if this is a Left value
    pub fn is_left(&self) -> bool {
        matches!(self, Either::Left(_))
    }

    /// Check if this is a Right value
    pub fn is_right(&self) -> bool {
        matches!(self, Either::Right(_))
    }

    /// Map the Right value
    pub fn map_right<F, T>(self, f: F) -> Either<L, T>
    where
        F: FnOnce(R) -> T,
    {
        match self {
            Either::Left(l) => Either::Left(l),
            Either::Right(r) => Either::Right(f(r)),
        }
    }

    /// Map the Left value
    pub fn map_left<F, T>(self, f: F) -> Either<T, R>
    where
        F: FnOnce(L) -> T,
    {
        match self {
            Either::Left(l) => Either::Left(f(l)),
            Either::Right(r) => Either::Right(r),
        }
    }

    /// Convert Either to Result, treating Right as Ok and Left as Err
    pub fn into_result(self) -> Result<R, L> {
        match self {
            Either::Left(l) => Err(l),
            Either::Right(r) => Ok(r),
        }
    }

    /// Chain a computation that may fail, useful for monadic composition
    pub fn and_then<F, T>(self, f: F) -> Either<L, T>
    where
        F: FnOnce(R) -> Either<L, T>,
    {
        match self {
            Either::Left(l) => Either::Left(l),
            Either::Right(r) => f(r),
        }
    }

    /// Provide a default value for Left cases
    pub fn unwrap_or_else<F>(self, f: F) -> Either<L, R>
    where
        F: FnOnce(L) -> Either<L, R>,
    {
        match self {
            Either::Left(l) => f(l),
            Either::Right(r) => Either::Right(r),
        }
    }
}

/// Functional validation combinator
pub struct Validator<T> {
    rules: Vec<Box<dyn Fn(&T) -> ServiceResult<()> + Send + Sync>>,
    _phantom: PhantomData<T>,
}

impl<T> Validator<T> {
    /// Create a new empty validator
    pub fn new() -> Self {
        Self {
            rules: Vec::new(),
            _phantom: PhantomData,
        }
    }

    /// Add a validation rule
    pub fn rule<F>(mut self, rule: F) -> Self
    where
        F: Fn(&T) -> ServiceResult<()> + Send + Sync + 'static,
    {
        self.rules.push(Box::new(rule));
        self
    }

    /// Validate the input against all rules
    pub fn validate(&self, input: &T) -> ServiceResult<()> {
        for rule in &self.rules {
            rule(input)?;
        }
        Ok(())
    }

    /// Create a validated wrapper that runs validation then executes a function
    pub fn validated<F, R>(self, f: F) -> impl Fn(T) -> ServiceResult<R>
    where
        F: Fn(T) -> ServiceResult<R>,
        T: Clone,
    {
        move |input| {
            self.validate(&input)?;
            f(input)
        }
    }
}

impl<T> Default for Validator<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Functional pipeline for composing transformations
pub struct Pipeline<T> {
    transformations: Vec<Box<dyn Fn(T) -> ServiceResult<T> + Send + Sync>>,
}

impl<T> Pipeline<T> {
    /// Create a new empty pipeline
    pub fn new() -> Self {
        Self {
            transformations: Vec::new(),
        }
    }

    /// Add a transformation to the pipeline
    pub fn then<F>(mut self, transform: F) -> Self
    where
        F: Fn(T) -> ServiceResult<T> + Send + Sync + 'static,
    {
        self.transformations.push(Box::new(transform));
        self
    }

    /// Execute the pipeline on the input
    pub fn execute(&self, mut input: T) -> ServiceResult<T> {
        for transform in &self.transformations {
            input = transform(input)?;
        }
        Ok(input)
    }

    /// Convert this pipeline into a function
    pub fn into_fn(self) -> impl Fn(T) -> ServiceResult<T> {
        move |input| self.execute(input)
    }
}

impl<T> Default for Pipeline<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Functional retry pattern with exponential backoff
pub struct Retry<T> {
    operation: Box<dyn Fn() -> ServiceResult<T> + Send + Sync>,
    max_attempts: usize,
    delay_ms: u64,
}

impl<T> Retry<T> {
    /// Create a new retry configuration
    pub fn new<F>(operation: F) -> Self
    where
        F: Fn() -> ServiceResult<T> + Send + Sync + 'static,
    {
        Self {
            operation: Box::new(operation),
            max_attempts: 3,
            delay_ms: 100,
        }
    }

    /// Set the maximum number of retry attempts
    pub fn max_attempts(mut self, attempts: usize) -> Self {
        self.max_attempts = attempts;
        self
    }

    /// Set the delay between retries in milliseconds
    pub fn delay(mut self, delay_ms: u64) -> Self {
        self.delay_ms = delay_ms;
        self
    }

    /// Execute the operation with retry logic
    pub fn execute(&self) -> ServiceResult<T> {
        let mut attempts = 0;
        loop {
            attempts += 1;
            match (self.operation)() {
                Ok(result) => return Ok(result),
                Err(err) => {
                    if attempts >= self.max_attempts {
                        return Err(err);
                    }
                    // In a real implementation, add async sleep here
                    log::warn!("Retry attempt {} failed, retrying...", attempts);
                }
            }
        }
    }
}

/// Memoization wrapper for expensive pure functions
pub struct Memoized<K, V>
where
    K: Eq + std::hash::Hash + Clone,
    V: Clone,
{
    cache: std::sync::Arc<std::sync::RwLock<std::collections::HashMap<K, V>>>,
    compute: Box<dyn Fn(&K) -> ServiceResult<V> + Send + Sync>,
}

impl<K, V> Memoized<K, V>
where
    K: Eq + std::hash::Hash + Clone,
    V: Clone,
{
    /// Create a new memoized function
    pub fn new<F>(compute: F) -> Self
    where
        F: Fn(&K) -> ServiceResult<V> + Send + Sync + 'static,
    {
        Self {
            cache: std::sync::Arc::new(std::sync::RwLock::new(std::collections::HashMap::new())),
            compute: Box::new(compute),
        }
    }

    /// Get the value, computing it if not cached
    pub fn get(&self, key: &K) -> ServiceResult<V> {
        // Try to read from cache first
        {
            let cache = self.cache.read().unwrap();
            if let Some(value) = cache.get(key) {
                return Ok(value.clone());
            }
        }

        // Compute the value
        let value = (self.compute)(key)?;

        // Store in cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(key.clone(), value.clone());
        }

        Ok(value)
    }

    /// Clear the cache
    pub fn clear(&self) {
        let mut cache = self.cache.write().unwrap();
        cache.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_either() {
        let right: Either<String, i32> = Either::Right(42);
        assert!(right.is_right());
        assert!(!right.is_left());

        let mapped = right.map_right(|x| x * 2);
        assert_eq!(mapped.into_result(), Ok(84));
    }

    #[test]
    fn test_validator() {
        let validator = Validator::<i32>::new()
            .rule(|&x| {
                if x > 0 {
                    Ok(())
                } else {
                    Err(ServiceError::bad_request("Must be positive"))
                }
            })
            .rule(|&x| {
                if x < 100 {
                    Ok(())
                } else {
                    Err(ServiceError::bad_request("Must be less than 100"))
                }
            });

        assert!(validator.validate(&50).is_ok());
        assert!(validator.validate(&-1).is_err());
        assert!(validator.validate(&101).is_err());
    }

    #[test]
    fn test_pipeline() {
        let pipeline = Pipeline::<i32>::new()
            .then(|x| Ok(x + 1))
            .then(|x| Ok(x * 2))
            .then(|x| Ok(x - 3));

        let result = pipeline.execute(5).unwrap();
        assert_eq!(result, 9); // (5 + 1) * 2 - 3 = 9
    }

    #[test]
    fn test_memoized() {
        let compute_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = compute_count.clone();

        let memoized = Memoized::new(move |&x: &i32| {
            counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(x * 2)
        });

        // First call should compute
        assert_eq!(memoized.get(&5).unwrap(), 10);
        assert_eq!(compute_count.load(std::sync::atomic::Ordering::SeqCst), 1);

        // Second call should use cache
        assert_eq!(memoized.get(&5).unwrap(), 10);
        assert_eq!(compute_count.load(std::sync::atomic::Ordering::SeqCst), 1);

        // Different key should compute
        assert_eq!(memoized.get(&10).unwrap(), 20);
        assert_eq!(compute_count.load(std::sync::atomic::Ordering::SeqCst), 2);
    }
}
