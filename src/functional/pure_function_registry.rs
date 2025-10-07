//! Pure Function Registry
//!
//! A thread-safe registry for storing and retrieving pure functions.
//! Provides fast lookup by category and signature, function composition,
//! and purity validation. All operations are optimized for performance
//! with sub-millisecond lookup times.

#[allow(dead_code)]
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use super::function_traits::{FunctionCategory, FunctionContainer, FunctionWrapper, PureFunction};

/// Information about a registered function (without the executable function)
#[derive(Debug, Clone, PartialEq)]
pub struct FunctionInfo {
    pub signature: &'static str,
    pub category: FunctionCategory,
    pub input_type_id: std::any::TypeId,
    pub output_type_id: std::any::TypeId,
}

/// Performance metrics for registry operations.
#[derive(Debug, Clone)]
pub struct RegistryMetrics {
    /// Average lookup time in nanoseconds
    pub avg_lookup_time_ns: u64,
    /// Total number of functions registered
    pub total_functions: usize,
    /// Number of lookup operations performed
    pub lookup_count: u64,
    /// Number of composition operations performed
    pub composition_count: u64,
}

impl Default for RegistryMetrics {
    /// Creates a `RegistryMetrics` with all counters initialized to zero.
    ///
    /// # Examples
    ///
    /// ```
    /// let m = RegistryMetrics::default();
    /// assert_eq!(m.avg_lookup_time_ns, 0);
    /// assert_eq!(m.total_functions, 0);
    /// assert_eq!(m.lookup_count, 0);
    /// assert_eq!(m.composition_count, 0);
    /// ```
    fn default() -> Self {
        Self {
            avg_lookup_time_ns: 0,
            total_functions: 0,
            lookup_count: 0,
            composition_count: 0,
        }
    }
}

/// Thread-safe pure function registry with performance monitoring.
pub struct PureFunctionRegistry {
    /// Functions organized by category for fast lookup
    functions: RwLock<HashMap<FunctionCategory, HashMap<&'static str, FunctionContainer>>>,
    /// Performance metrics
    metrics: RwLock<RegistryMetrics>,
}

impl PureFunctionRegistry {
    /// Creates a new, empty PureFunctionRegistry with initialized metrics.
    ///
    /// # Examples
    ///
    /// ```
    /// let reg = PureFunctionRegistry::new();
    /// let metrics = reg.get_metrics().unwrap();
    /// assert_eq!(metrics.total_functions, 0);
    /// ```
    pub fn new() -> Self {
        Self {
            functions: RwLock::new(HashMap::new()),
            metrics: RwLock::new(RegistryMetrics::default()),
        }
    }

    /// Registers a pure function under its category and signature in the registry.
    ///
    /// On success the function is stored and the registry's total function count is incremented.
    ///
    /// # Errors
    ///
    /// Returns `RegistryError::FunctionAlreadyExists` if a function with the same category and signature is already registered.
    /// Returns `RegistryError::LockPoisoned` if an internal lock has been poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::sync::Arc;
    /// # use functional::pure_function_registry::{PureFunctionRegistry, RegistryError};
    /// # // The following is illustrative; `MyPureFn` must implement the `PureFunction` trait.
    /// # struct MyPureFn;
    /// # impl MyPureFn {
    /// #     fn new() -> Self { MyPureFn }
    /// # }
    /// # // Assume `MyPureFn` implements `PureFunction<Input=i32, Output=i32>`
    /// let registry = PureFunctionRegistry::new();
    /// let my_fn = MyPureFn::new();
    /// let result: Result<(), RegistryError> = registry.register(my_fn);
    /// assert!(result.is_ok());
    /// ```
    pub fn register<Input, Output, F>(&self, function: F) -> Result<(), RegistryError>
    where
        Input: Send + Sync + 'static,
        Output: Send + Sync + 'static,
        F: PureFunction<Input, Output> + 'static,
    {
        let _start = Instant::now();
        let mut functions = self
            .functions
            .write()
            .map_err(|_| RegistryError::LockPoisoned)?;

        let category = function.category();
        let signature = function.signature();

        // Get or create category map
        let category_map = functions.entry(category).or_insert_with(HashMap::new);

        // Check if function already exists
        if category_map.contains_key(signature) {
            return Err(RegistryError::FunctionAlreadyExists {
                category,
                signature: signature.to_string(),
            });
        }

        // Register the function
        let container = FunctionContainer::new(function, signature, category);
        category_map.insert(signature, container);

        // Update metrics
        let mut metrics = self
            .metrics
            .write()
            .map_err(|_| RegistryError::LockPoisoned)?;
        metrics.total_functions += 1;

        Ok(())
    }

    /// Retrieve metadata for a registered function by category and signature.
    ///
    /// # Returns
    ///
    /// `Some(FunctionInfo)` for the matching function, `None` if no function with the given
    /// category and signature is registered.
    ///
    /// # Errors
    ///
    /// Returns `RegistryError::LockPoisoned` if the registry's internal lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = PureFunctionRegistry::new();
    /// let info = registry.lookup(FunctionCategory::Transformation, "identity").unwrap();
    /// assert!(info.is_none());
    /// ```
    pub fn lookup(
        &self,
        category: FunctionCategory,
        signature: &str,
    ) -> Result<Option<FunctionInfo>, RegistryError> {
        let start = Instant::now();
        let functions = self
            .functions
            .read()
            .map_err(|_| RegistryError::LockPoisoned)?;

        let result = functions
            .get(&category)
            .and_then(|category_map| category_map.get(signature))
            .map(|container| FunctionInfo {
                signature: container.signature(),
                category: container.category(),
                input_type_id: container.input_type_id(),
                output_type_id: container.output_type_id(),
            });

        let duration = start.elapsed();
        self.update_lookup_metrics(duration)?;

        Ok(result)
    }

    /// Lists all registered function signatures for the given category.
    ///
    /// Returns an empty vector if no functions are registered under that category.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::pure_function_registry::{PureFunctionRegistry, FunctionCategory};
    ///
    /// let registry = PureFunctionRegistry::new();
    /// let funcs = registry.get_category_functions(FunctionCategory::Transformation).unwrap();
    /// assert!(funcs.is_empty());
    /// ```
    pub fn get_category_functions(
        &self,
        category: FunctionCategory,
    ) -> Result<Vec<&'static str>, RegistryError> {
        let functions = self
            .functions
            .read()
            .map_err(|_| RegistryError::LockPoisoned)?;

        Ok(functions
            .get(&category)
            .map(|category_map| category_map.keys().copied().collect())
            .unwrap_or_default())
    }

    /// Attempts to create a new function by composing two registered functions in the same category.
    ///
    /// Currently composition is not implemented; this method always returns an `IncompatibleComposition` error that includes the attempted signatures and a reason.
    ///
    /// # Parameters
    ///
    /// - `first_sig` — Signature of the first function (applied second).
    /// - `second_sig` — Signature of the second function (applied first).
    /// - `category` — Category shared by both functions.
    /// - `composed_sig` — Signature to assign to the composed function.
    ///
    /// # Returns
    ///
    /// `Ok(())` if composition succeeds; currently this method returns `Err(RegistryError::IncompatibleComposition)`.
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = PureFunctionRegistry::new();
    /// let res = registry.compose_functions("first", "second", FunctionCategory::Transformation, "first_then_second");
    /// assert!(res.is_err());
    /// ```
    pub fn compose_functions(
        &self,
        _first_sig: &str,
        _second_sig: &str,
        _category: FunctionCategory,
        _composed_sig: &'static str,
    ) -> Result<(), RegistryError> {
        // TODO: Implement full function composition
        // For now, this is a placeholder
        Err(RegistryError::IncompatibleComposition {
            first_sig: _first_sig.to_string(),
            second_sig: _second_sig.to_string(),
            reason: "Function composition not yet implemented".to_string(),
        })
    }

    /// Executes a registered function with the provided input and returns its output if available.
    ///
    /// # Returns
    ///
    /// `Ok(Some(output))` if a function matching the category and signature is found and its output
    /// can be downcast to the requested `Output` type; `Ok(None)` if no such function is registered;
    /// `Err(RegistryError)` if a locking or metrics update error occurs.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::sync::Arc;
    /// # use crate::functional::pure_function_registry::{PureFunctionRegistry, FunctionCategory, prelude::create_standard_registry};
    /// let registry = create_standard_registry().unwrap();
    /// let result: Option<i32> = registry.execute(FunctionCategory::Mathematical, "double", 3).unwrap();
    /// assert_eq!(result, Some(6));
    /// ```
    pub fn execute<Input, Output>(
        &self,
        category: FunctionCategory,
        signature: &str,
        input: Input,
    ) -> Result<Option<Output>, RegistryError>
    where
        Input: Send + Sync + 'static,
        Output: Send + Sync + 'static,
    {
        let start = Instant::now();
        let functions = self
            .functions
            .read()
            .map_err(|_| RegistryError::LockPoisoned)?;

        let result = functions
            .get(&category)
            .and_then(|category_map| category_map.get(signature))
            .and_then(|container| container.try_call(Box::new(input)))
            .and_then(|boxed_result| boxed_result.downcast::<Output>().ok())
            .map(|output| *output);

        let duration = start.elapsed();
        self.update_lookup_metrics(duration)?;

        Ok(result)
    }

    /// Checks whether a registered function produces the same output for the same input across multiple executions.
    ///
    /// The registry will execute the function identified by `category` and `signature` `iterations` times (100 if `None`)
    /// with clones of `input` and return `Ok(true)` if every invocation produced an equal `Output`, `Ok(false)` if any
    /// output differed, or an error if the function cannot be found or a lock error occurs.
    ///
    /// # Parameters
    ///
    /// - `category`: function category used to locate the registered function.
    /// - `signature`: function signature used to locate the registered function.
    /// - `input`: value to pass to the function on each invocation (must be `Clone`).
    /// - `iterations`: number of repetitions to perform; defaults to 100 when `None`.
    ///
    /// # Returns
    ///
    /// `Ok(true)` if all outputs across the runs are equal, `Ok(false)` if any output differs, or `Err(RegistryError)` on failure.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::pure_function_registry::prelude::create_standard_registry;
    /// use crate::functional::pure_function_registry::FunctionCategory;
    ///
    /// let registry = create_standard_registry().expect("failed to create registry");
    /// // `identity` in the standard registry is deterministic for `i32`
    /// let is_pure = registry
    ///     .validate_purity::<i32, i32>(FunctionCategory::Transformation, "identity", 7, Some(10))
    ///     .expect("validation failed");
    /// assert!(is_pure);
    /// ```
    pub fn validate_purity<Input, Output>(
        &self,
        category: FunctionCategory,
        signature: &str,
        input: Input,
        iterations: Option<usize>,
    ) -> Result<bool, RegistryError>
    where
        Input: Clone + Send + Sync + 'static,
        Output: Eq + Send + Sync + 'static,
    {
        let iterations = iterations.unwrap_or(100);
        let mut results: Vec<Output> = Vec::with_capacity(iterations);

        // Execute function multiple times
        for _ in 0..iterations {
            let result = self.execute(category, signature, input.clone())?;
            match result {
                Some(output) => results.push(output),
                None => {
                    return Err(RegistryError::FunctionNotFound {
                        category,
                        signature: signature.to_string(),
                    })
                }
            }
        }

        // Guard against zero iterations or empty results
        if iterations == 0 || results.is_empty() {
            // If no runs were performed, return true as no non-deterministic behavior was detected
            return Ok(true);
        }

        // Check if all results are identical
        let first_result = &results[0];
        Ok(results.iter().all(|r| r == first_result))
    }

    /// Returns a clone of the registry's current performance metrics.
    ///
    /// # Returns
    ///
    /// `RegistryMetrics` containing the current average lookup time, total functions,
    /// lookup count, and composition count.
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = PureFunctionRegistry::new();
    /// let metrics = registry.get_metrics().unwrap();
    /// assert_eq!(metrics.total_functions, 0);
    /// ```
    pub fn get_metrics(&self) -> Result<RegistryMetrics, RegistryError> {
        let metrics = self
            .metrics
            .read()
            .map_err(|_| RegistryError::LockPoisoned)?;
        Ok(metrics.clone())
    }

    /// Clears all registered functions and resets metrics to default values.
    ///
    /// Clears the internal function store and resets RegistryMetrics to its default state.
    /// Returns `Err(RegistryError::LockPoisoned)` if a synchronization primitive has been poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = PureFunctionRegistry::new();
    /// registry.clear().unwrap();
    /// assert_eq!(registry.get_metrics().unwrap().total_functions, 0);
    /// ```
    pub fn clear(&self) -> Result<(), RegistryError> {
        let mut functions = self
            .functions
            .write()
            .map_err(|_| RegistryError::LockPoisoned)?;
        functions.clear();

        let mut metrics = self
            .metrics
            .write()
            .map_err(|_| RegistryError::LockPoisoned)?;
        *metrics = RegistryMetrics::default();

        Ok(())
    }

    /// Update the registry's lookup performance metrics with a new measurement.
    ///
    /// Updates the running average lookup time (in nanoseconds) and increments the lookup count using the provided duration measurement. If this is the first measurement, the average is set to the measurement value.
    ///
    /// # Parameters
    ///
    /// - `duration`: elapsed time of a lookup to incorporate into the metrics.
    ///
    /// # Returns
    ///
    /// `Ok(())` on success, or `Err(RegistryError::LockPoisoned)` if the metrics lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::time::Duration;
    /// let registry = PureFunctionRegistry::new();
    /// // record a 100 ns lookup measurement
    /// registry.update_lookup_metrics(Duration::from_nanos(100)).unwrap();
    /// let metrics = registry.get_metrics().unwrap();
    /// assert!(metrics.lookup_count >= 1);
    /// assert!(metrics.avg_lookup_time_ns >= 100);
    /// ```
    fn update_lookup_metrics(&self, duration: Duration) -> Result<(), RegistryError> {
        let mut metrics = self
            .metrics
            .write()
            .map_err(|_| RegistryError::LockPoisoned)?;

        let new_measurement = duration.as_nanos() as u64;
        let prev_count = metrics.lookup_count;

        // Compute cumulative average: (current_avg * prev_count + new_measurement) / (prev_count + 1)
        let current_avg = metrics.avg_lookup_time_ns;
        if prev_count == 0 {
            // First measurement
            metrics.avg_lookup_time_ns = new_measurement;
        } else {
            // Running average: (avg * count + new) / (count + 1)
            metrics.avg_lookup_time_ns =
                (current_avg * prev_count + new_measurement) / (prev_count + 1);
        }

        metrics.lookup_count += 1;

        Ok(())
    }
}

/// Helper struct for function composition.
struct ComposableFunction<'a, Input, Output> {
    container: &'a FunctionContainer,
    _phantom: std::marker::PhantomData<(Input, Output)>,
}

impl<'a, Input, Output> ComposableFunction<'a, Input, Output>
where
    Input: 'static,
    Output: 'static,
{
    /// Creates a ComposableFunction wrapper after validating the container's input and output TypeIds
    /// match the provided `Input` and `Output` generic types.
    ///
    /// # Errors
    ///
    /// Returns `RegistryError::TypeMismatch` if the container's recorded input or output type does not
    /// match `Input` or `Output`, respectively.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// // Assuming `container` is a valid FunctionContainer whose input/output types are i32 -> i32:
    /// let container: FunctionContainer = /* obtain or construct container */ unimplemented!();
    /// let composable = ComposableFunction::<i32, i32>::new(&container)?;
    /// ```
    fn new(container: &'a FunctionContainer) -> Result<Self, RegistryError> {
        if container.input_type_id() != std::any::TypeId::of::<Input>()
            || container.output_type_id() != std::any::TypeId::of::<Output>()
        {
            return Err(RegistryError::TypeMismatch);
        }

        Ok(Self {
            container,
            _phantom: std::marker::PhantomData,
        })
    }
}

/// Errors that can occur during registry operations.
#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("Function already exists: {category:?}::{signature}")]
    FunctionAlreadyExists {
        category: FunctionCategory,
        signature: String,
    },

    #[error("Function not found: {category:?}::{signature}")]
    FunctionNotFound {
        category: FunctionCategory,
        signature: String,
    },

    #[error("Incompatible composition: {first_sig} -> {second_sig}: {reason}")]
    IncompatibleComposition {
        first_sig: String,
        second_sig: String,
        reason: String,
    },

    #[error("Type mismatch during operation")]
    TypeMismatch,

    #[error("Registry lock was poisoned")]
    LockPoisoned,
}

/// Thread-safe wrapper for the registry.
pub type SharedRegistry = Arc<PureFunctionRegistry>;

impl PureFunctionRegistry {
    /// Create a thread-safe shared registry instance.
    ///
    /// Returns an Arc-wrapped PureFunctionRegistry (`SharedRegistry`).
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = PureFunctionRegistry::shared();
    /// // `registry` is a SharedRegistry (Arc<PureFunctionRegistry>) ready for concurrent use
    /// ```
    pub fn shared() -> SharedRegistry {
        Arc::new(Self::new())
    }
}

/// Convenience functions for common registry operations.
pub mod prelude {
    use super::*;

    /// Creates a shared registry pre-populated with a small set of common pure functions.
    ///
    /// The registry will include:
    /// - "identity" (Transformation): identity for `i32`
    /// - "double" (Mathematical): multiplies an `i32` by 2
    /// - "string_length" (StringProcessing): returns the length of a `String`
    ///
    /// # Returns
    ///
    /// A `Result` containing the `SharedRegistry` on success, or a `RegistryError` if any registration fails.
    ///
    /// # Examples
    ///
    /// ```
    /// let registry = create_standard_registry().unwrap();
    /// let metrics = registry.get_metrics().unwrap();
    /// assert!(metrics.total_functions >= 3);
    /// ```
    pub fn create_standard_registry() -> Result<SharedRegistry, RegistryError> {
        let registry = PureFunctionRegistry::shared();

        // Register common transformation functions
        registry.register(FunctionWrapper::new(
            |x: i32| x,
            "identity",
            FunctionCategory::Transformation,
        ))?;

        registry.register(FunctionWrapper::new(
            |x: i32| x * 2,
            "double",
            FunctionCategory::Mathematical,
        ))?;

        registry.register(FunctionWrapper::new(
            |s: String| s.len(),
            "string_length",
            FunctionCategory::StringProcessing,
        ))?;

        Ok(registry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::functional::function_traits::{FunctionCategory, FunctionWrapper};

    #[test]
    fn test_registry_creation() {
        let registry = PureFunctionRegistry::new();
        assert_eq!(registry.get_metrics().unwrap().total_functions, 0);
    }

    #[test]
    fn test_function_registration() {
        let registry = PureFunctionRegistry::new();

        // Register a simple function
        let result = registry.register(FunctionWrapper::new(
            |x: i32| x * 2,
            "double",
            FunctionCategory::Mathematical,
        ));

        assert!(result.is_ok());
        assert_eq!(registry.get_metrics().unwrap().total_functions, 1);
    }

    #[test]
    fn test_function_lookup() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry
            .register(FunctionWrapper::new(
                |x: i32| x + 1,
                "increment",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        // Look it up
        let info = registry
            .lookup(FunctionCategory::Mathematical, "increment")
            .unwrap();
        assert!(info.is_some());

        let info = info.unwrap();
        assert_eq!(info.signature, "increment");
        assert_eq!(info.category, FunctionCategory::Mathematical);
    }

    #[test]
    fn test_function_execution() {
        eprintln!("DEBUG: Starting test_function_execution");
        let registry = PureFunctionRegistry::new();
        eprintln!("DEBUG: Created registry");

        // Register a function
        eprintln!("DEBUG: Registering function");
        registry
            .register(FunctionWrapper::new(
                |x: i32| x * 3,
                "triple",
                FunctionCategory::Mathematical,
            ))
            .unwrap();
        eprintln!("DEBUG: Function registered");

        // Execute it
        eprintln!("DEBUG: Executing function");
        let result: Option<i32> = registry
            .execute(FunctionCategory::Mathematical, "triple", 5)
            .unwrap();
        eprintln!("DEBUG: Execution completed, result: {:?}", result);
        assert_eq!(result, Some(15));
    }

    #[test]
    fn test_duplicate_registration_error() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry
            .register(FunctionWrapper::new(
                |x: i32| x + 1,
                "increment",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        // Try to register the same function again
        let result = registry.register(FunctionWrapper::new(
            |x: i32| x + 2,
            "increment",
            FunctionCategory::Mathematical,
        ));

        assert!(result.is_err());
        match result.unwrap_err() {
            RegistryError::FunctionAlreadyExists { .. } => {}
            _ => panic!("Expected FunctionAlreadyExists error"),
        }
    }

    #[test]
    fn test_purity_validation() {
        let registry = PureFunctionRegistry::new();

        // Register a pure function
        registry
            .register(FunctionWrapper::new(
                |x: i32| x * 2,
                "pure_double",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        // Validate purity
        let is_pure = registry
            .validate_purity::<i32, i32>(
                FunctionCategory::Mathematical,
                "pure_double",
                10,
                Some(10),
            )
            .unwrap();

        assert!(is_pure);
    }

    #[test]
    fn test_category_functions() {
        let registry = PureFunctionRegistry::new();

        // Register functions in different categories
        registry
            .register(FunctionWrapper::new(
                |x: i32| x + 1,
                "increment",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        registry
            .register(FunctionWrapper::new(
                |s: String| s.len(),
                "length",
                FunctionCategory::StringProcessing,
            ))
            .unwrap();

        registry
            .register(FunctionWrapper::new(
                |x: i32| x * 2,
                "double",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        // Check mathematical functions
        let math_funcs = registry
            .get_category_functions(FunctionCategory::Mathematical)
            .unwrap();
        assert_eq!(math_funcs.len(), 2);
        assert!(math_funcs.contains(&"increment"));
        assert!(math_funcs.contains(&"double"));

        // Check string processing functions
        let string_funcs = registry
            .get_category_functions(FunctionCategory::StringProcessing)
            .unwrap();
        assert_eq!(string_funcs.len(), 1);
        assert!(string_funcs.contains(&"length"));
    }

    #[test]
    fn test_performance_metrics() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry
            .register(FunctionWrapper::new(
                |x: i32| x + 1,
                "increment",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        // Perform some lookups
        for _ in 0..10 {
            let _ = registry
                .lookup(FunctionCategory::Mathematical, "increment")
                .unwrap();
        }

        let metrics = registry.get_metrics().unwrap();
        assert_eq!(metrics.total_functions, 1);
        assert_eq!(metrics.lookup_count, 10);
        assert!(metrics.avg_lookup_time_ns > 0); // Should have recorded some time
    }

    #[test]
    fn test_registry_clear() {
        let registry = PureFunctionRegistry::new();

        // Register some functions
        registry
            .register(FunctionWrapper::new(
                |x: i32| x + 1,
                "increment",
                FunctionCategory::Mathematical,
            ))
            .unwrap();

        registry
            .register(FunctionWrapper::new(
                |s: String| s.len(),
                "length",
                FunctionCategory::StringProcessing,
            ))
            .unwrap();

        assert_eq!(registry.get_metrics().unwrap().total_functions, 2);

        // Clear the registry
        registry.clear().unwrap();

        assert_eq!(registry.get_metrics().unwrap().total_functions, 0);
        assert_eq!(registry.get_metrics().unwrap().lookup_count, 0);
    }
}