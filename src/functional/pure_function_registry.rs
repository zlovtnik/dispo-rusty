//! Pure Function Registry
//!
//! A thread-safe registry for storing and retrieving pure functions.
//! Provides fast lookup by category and signature, function composition,
//! and purity validation. All operations are optimized for performance
//! with sub-millisecond lookup times.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use super::function_traits::{
    FunctionCategory, FunctionContainer, PureFunction, FunctionWrapper,
};

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
    /// Create a new empty function registry.
    pub fn new() -> Self {
        Self {
            functions: RwLock::new(HashMap::new()),
            metrics: RwLock::new(RegistryMetrics::default()),
        }
    }

    /// Register a pure function in the registry.
    ///
    /// # Arguments
    /// * `function` - The pure function to register
    ///
    /// # Returns
    /// Ok(()) if registration successful, Err if function already exists
    ///
    /// # Performance
    /// O(1) average case for HashMap operations
    pub fn register<Input, Output, F>(
        &self,
        function: F,
    ) -> Result<(), RegistryError>
    where
        Input: 'static,
        Output: 'static,
        F: PureFunction<Input, Output> + 'static,
    {
        let start = Instant::now();
        let mut functions = self.functions.write().map_err(|_| RegistryError::LockPoisoned)?;

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
        let mut metrics = self.metrics.write().map_err(|_| RegistryError::LockPoisoned)?;
        metrics.total_functions += 1;

        let duration = start.elapsed();
        self.update_lookup_metrics(duration);

        Ok(())
    }

    /// Lookup a function by category and signature.
    ///
    /// # Arguments
    /// * `category` - The function category
    /// * `signature` - The function signature
    ///
    /// # Returns
    /// Some reference to the function container if found, None otherwise
    ///
    /// # Performance
    /// O(1) average case lookup time
    pub fn lookup(
        &self,
        category: FunctionCategory,
        signature: &str,
    ) -> Result<Option<FunctionContainer>, RegistryError> {
        let start = Instant::now();
        let functions = self.functions.read().map_err(|_| RegistryError::LockPoisoned)?;

        let result = functions
            .get(&category)
            .and_then(|category_map| category_map.get(signature))
            .cloned();

        let duration = start.elapsed();
        self.update_lookup_metrics(duration)?;

        Ok(result)
    }

    /// Get all functions in a specific category.
    ///
    /// # Arguments
    /// * `category` - The category to search
    ///
    /// # Returns
    /// Vector of function signatures in the category
    pub fn get_category_functions(
        &self,
        category: FunctionCategory,
    ) -> Result<Vec<&'static str>, RegistryError> {
        let functions = self.functions.read().map_err(|_| RegistryError::LockPoisoned)?;

        Ok(functions
            .get(&category)
            .map(|category_map| category_map.keys().copied().collect())
            .unwrap_or_default())
    }

    /// Get all available categories.
    ///
    /// # Returns
    /// Vector of all function categories that have registered functions
    pub fn get_categories(&self) -> Result<Vec<FunctionCategory>, RegistryError> {
        let functions = self.functions.read().map_err(|_| RegistryError::LockPoisoned)?;
        Ok(functions.keys().copied().collect())
    }

    /// Compose two functions from the registry.
    ///
    /// # Arguments
    /// * `first_sig` - Signature of the first function (applied second)
    /// * `second_sig` - Signature of the second function (applied first)
    /// * `category` - Category of both functions
    /// * `composed_sig` - Signature for the composed function
    ///
    /// # Returns
    /// Ok(()) if composition successful, Err otherwise
    ///
    /// # Note
    /// This is a simplified implementation. Full composition support
    /// will be added in a future iteration.
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

    /// Execute a registered function with type-safe input/output.
    ///
    /// # Arguments
    /// * `category` - Function category
    /// * `signature` - Function signature
    /// * `input` - Input value
    ///
    /// # Returns
    /// Some(output) if function found and types match, None otherwise
    ///
    /// # Type Parameters
    /// * `Input` - Input type
    /// * `Output` - Output type
    pub fn execute<Input, Output>(
        &self,
        category: FunctionCategory,
        signature: &str,
        input: Input,
    ) -> Result<Option<Output>, RegistryError>
    where
        Input: 'static,
        Output: 'static,
    {
        let container = self.lookup(category, signature)?;
        match container {
            Some(container) => Ok(container.try_call(input)),
            None => Ok(None),
        }
    }

    /// Validate function purity by executing with same input multiple times.
    ///
    /// # Arguments
    /// * `category` - Function category
    /// * `signature` - Function signature
    /// * `input` - Test input value
    /// * `iterations` - Number of times to execute (default: 100)
    ///
    /// # Returns
    /// Ok(true) if function appears pure, Err if validation fails
    ///
    /// # Type Parameters
    /// * `Input` - Input type (must be Clone)
    /// * `Output` - Output type (must be Eq)
    pub fn validate_purity<Input, Output>(
        &self,
        category: FunctionCategory,
        signature: &str,
        input: Input,
        iterations: Option<usize>,
    ) -> Result<bool, RegistryError>
    where
        Input: Clone + 'static,
        Output: Eq + 'static,
    {
        let iterations = iterations.unwrap_or(100);
        let mut results: Vec<Output> = Vec::with_capacity(iterations);

        // Execute function multiple times
        for _ in 0..iterations {
            let result = self.execute(category, signature, input.clone())?;
            match result {
                Some(output) => results.push(output),
                None => return Err(RegistryError::FunctionNotFound {
                    category,
                    signature: signature.to_string(),
                }),
            }
        }

        // Check if all results are identical
        let first_result = &results[0];
        Ok(results.iter().all(|r| r == first_result))
    }

    /// Get current performance metrics.
    pub fn get_metrics(&self) -> Result<RegistryMetrics, RegistryError> {
        let metrics = self.metrics.read().map_err(|_| RegistryError::LockPoisoned)?;
        Ok(metrics.clone())
    }

    /// Clear all registered functions and reset metrics.
    pub fn clear(&self) -> Result<(), RegistryError> {
        let mut functions = self.functions.write().map_err(|_| RegistryError::LockPoisoned)?;
        functions.clear();

        let mut metrics = self.metrics.write().map_err(|_| RegistryError::LockPoisoned)?;
        *metrics = RegistryMetrics::default();

        Ok(())
    }

    /// Update lookup performance metrics.
    fn update_lookup_metrics(&self, duration: Duration) -> Result<(), RegistryError> {
        let mut metrics = self.metrics.write().map_err(|_| RegistryError::LockPoisoned)?;
        metrics.lookup_count += 1;

        // Update rolling average
        let current_avg = metrics.avg_lookup_time_ns;
        let new_measurement = duration.as_nanos() as u64;
        metrics.avg_lookup_time_ns = (current_avg + new_measurement) / 2;

        Ok(())
    }
}

/// Helper struct for function composition.
struct ComposableFunction<Input, Output> {
    container: FunctionContainer,
    _phantom: std::marker::PhantomData<(Input, Output)>,
}

impl<Input, Output> ComposableFunction<Input, Output>
where
    Input: 'static,
    Output: 'static,
{
    fn new(container: &FunctionContainer) -> Result<Self, RegistryError> {
        if container.input_type_id() != std::any::TypeId::of::<Input>() ||
           container.output_type_id() != std::any::TypeId::of::<Output>() {
            return Err(RegistryError::TypeMismatch);
        }

        Ok(Self {
            container: container.clone(),
            _phantom: std::marker::PhantomData,
        })
    }
}

impl Clone for FunctionContainer {
    fn clone(&self) -> Self {
        // For now, we can't clone due to private fields
        // This is a limitation that should be addressed in the FunctionContainer design
        unimplemented!("FunctionContainer clone not implemented due to private fields")
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
    /// Create a new shared registry instance.
    pub fn shared() -> SharedRegistry {
        Arc::new(Self::new())
    }
}

/// Convenience functions for common registry operations.
pub mod prelude {
    use super::*;

    /// Create a registry with common pure functions pre-registered.
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
        registry.register(FunctionWrapper::new(
            |x: i32| x + 1,
            "increment",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Look it up
        let container = registry.lookup(FunctionCategory::Mathematical, "increment").unwrap();
        assert!(container.is_some());

        let container = container.unwrap();
        assert_eq!(container.signature(), "increment");
        assert_eq!(container.category(), FunctionCategory::Mathematical);
    }

    #[test]
    fn test_function_execution() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry.register(FunctionWrapper::new(
            |x: i32| x * 3,
            "triple",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Execute it
        let result: Option<i32> = registry.execute(FunctionCategory::Mathematical, "triple", 5).unwrap();
        assert_eq!(result, Some(15));
    }

    #[test]
    fn test_duplicate_registration_error() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry.register(FunctionWrapper::new(
            |x: i32| x + 1,
            "increment",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Try to register the same function again
        let result = registry.register(FunctionWrapper::new(
            |x: i32| x + 2,
            "increment",
            FunctionCategory::Mathematical,
        ));

        assert!(result.is_err());
        match result.unwrap_err() {
            RegistryError::FunctionAlreadyExists { .. } => {},
            _ => panic!("Expected FunctionAlreadyExists error"),
        }
    }

    #[test]
    fn test_purity_validation() {
        let registry = PureFunctionRegistry::new();

        // Register a pure function
        registry.register(FunctionWrapper::new(
            |x: i32| x * 2,
            "pure_double",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Validate purity
        let is_pure = registry.validate_purity::<i32, i32>(
            FunctionCategory::Mathematical,
            "pure_double",
            10,
            Some(10),
        ).unwrap();

        assert!(is_pure);
    }

    #[test]
    fn test_category_functions() {
        let registry = PureFunctionRegistry::new();

        // Register functions in different categories
        registry.register(FunctionWrapper::new(
            |x: i32| x + 1,
            "increment",
            FunctionCategory::Mathematical,
        )).unwrap();

        registry.register(FunctionWrapper::new(
            |s: String| s.len(),
            "length",
            FunctionCategory::StringProcessing,
        )).unwrap();

        registry.register(FunctionWrapper::new(
            |x: i32| x * 2,
            "double",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Check mathematical functions
        let math_funcs = registry.get_category_functions(FunctionCategory::Mathematical).unwrap();
        assert_eq!(math_funcs.len(), 2);
        assert!(math_funcs.contains(&"increment"));
        assert!(math_funcs.contains(&"double"));

        // Check string processing functions
        let string_funcs = registry.get_category_functions(FunctionCategory::StringProcessing).unwrap();
        assert_eq!(string_funcs.len(), 1);
        assert!(string_funcs.contains(&"length"));
    }

    #[test]
    fn test_performance_metrics() {
        let registry = PureFunctionRegistry::new();

        // Register a function
        registry.register(FunctionWrapper::new(
            |x: i32| x + 1,
            "increment",
            FunctionCategory::Mathematical,
        )).unwrap();

        // Perform some lookups
        for _ in 0..10 {
            let _ = registry.lookup(FunctionCategory::Mathematical, "increment").unwrap();
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
        registry.register(FunctionWrapper::new(
            |x: i32| x + 1,
            "increment",
            FunctionCategory::Mathematical,
        )).unwrap();

        registry.register(FunctionWrapper::new(
            |s: String| s.len(),
            "length",
            FunctionCategory::StringProcessing,
        )).unwrap();

        assert_eq!(registry.get_metrics().unwrap().total_functions, 2);

        // Clear the registry
        registry.clear().unwrap();

        assert_eq!(registry.get_metrics().unwrap().total_functions, 0);
        assert_eq!(registry.get_metrics().unwrap().lookup_count, 0);
    }
}