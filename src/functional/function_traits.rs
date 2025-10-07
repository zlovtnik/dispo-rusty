//! Function Traits for Pure Functional Programming
//!
//! This module defines the core traits and types for pure functions
//! used in the functional programming infrastructure. All functions
//! must be pure (deterministic, side-effect free), thread-safe,
//! and composable.

#[allow(dead_code)]
use std::fmt::Debug;
use std::hash::Hash;

/// Core trait for pure functions that can be registered and composed.
///
/// Pure functions must be:
/// - Deterministic: Same input always produces same output
/// - Side-effect free: No mutations, I/O, or external state changes
/// - Thread-safe: Send + Sync for concurrent execution
/// - Composable: Can be chained with other pure functions
pub trait PureFunction<Input, Output>: Send + Sync + 'static {
    /// Execute the pure function with the given input.
    ///
    /// # Arguments
    /// * `input` - The input value to process
    ///
    /// # Returns
    /// The output value after processing
    fn call(&self, input: Input) -> Output;

    /// Get the function signature for type checking and composition.
    ///
    /// # Returns
    /// A string representation of the function signature
    fn signature(&self) -> &'static str;

    /// Get the function category for organization and lookup.
    ///
    /// # Returns
    /// The category this function belongs to
    fn category(&self) -> FunctionCategory;

    /// Check if this function can be composed with another function.
    ///
    /// # Arguments
    /// * `other` - The function to check composition compatibility with
    ///
    /// # Returns
    /// true if the functions can be composed, false otherwise
    fn can_compose_with(&self, _other: &dyn PureFunction<Output, Output>) -> bool
    where
        Output: Clone,
    {
        // Default implementation: functions can compose if output type matches input type
        true
    }
}

/// Function categories for organization and lookup optimization.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FunctionCategory {
    /// Data transformation functions (map, filter, etc.)
    Transformation,
    /// Data aggregation functions (sum, count, etc.)
    Aggregation,
    /// Validation functions
    Validation,
    /// Data filtering functions
    Filtering,
    /// Data sorting and ordering functions
    Sorting,
    /// Data grouping functions
    Grouping,
    /// Mathematical operations
    Mathematical,
    /// String processing functions
    StringProcessing,
    /// Custom business logic functions
    BusinessLogic,
}

/// Generic function wrapper that implements PureFunction trait.
///
/// This allows storing different function types in the registry
/// while maintaining type safety and purity guarantees.
pub struct FunctionWrapper<Input, Output, F>
where
    Input: Send + Sync + 'static,
    Output: Send + Sync + 'static,
    F: Fn(Input) -> Output + Send + Sync + 'static,
{
    function: F,
    signature: &'static str,
    category: FunctionCategory,
    _phantom: std::marker::PhantomData<(Input, Output)>,
}

impl<Input, Output, F> FunctionWrapper<Input, Output, F>
where
    Input: Send + Sync + 'static,
    Output: Send + Sync + 'static,
    F: Fn(Input) -> Output + Send + Sync + 'static,
{
    /// Create a new function wrapper.
    ///
    /// # Arguments
    /// * `function` - The pure function to wrap
    /// * `signature` - Function signature string
    /// * `category` - Function category
    ///
    /// # Returns
    /// A new FunctionWrapper instance
    pub fn new(function: F, signature: &'static str, category: FunctionCategory) -> Self {
        Self {
            function,
            signature,
            category,
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<Input, Output, F> PureFunction<Input, Output> for FunctionWrapper<Input, Output, F>
where
    Input: Send + Sync + 'static,
    Output: Send + Sync + 'static,
    F: Fn(Input) -> Output + Send + Sync + 'static,
{
    fn call(&self, input: Input) -> Output {
        (self.function)(input)
    }

    fn signature(&self) -> &'static str {
        self.signature
    }

    fn category(&self) -> FunctionCategory {
        self.category
    }
}

/// Type-erased function container for storage in the registry.
///
/// This allows storing functions with different input/output types
/// in the same collection while maintaining thread safety.
pub struct FunctionContainer {
    /// Type-erased callable function
    callable: Box<dyn Callable>,
    /// Function signature
    signature: &'static str,
    /// Function category
    category: FunctionCategory,
    /// Type information for composition checking
    input_type_id: std::any::TypeId,
    output_type_id: std::any::TypeId,
}

impl FunctionContainer {
    /// Create a new function container.
    ///
    /// # Arguments
    /// * `function` - The pure function implementation
    /// * `signature` - Unique function signature for identification
    /// * `category` - Function category for organization
    ///
    /// # Returns
    /// A new FunctionContainer instance
    pub fn new<Input, Output, F>(
        function: F,
        signature: &'static str,
        category: FunctionCategory,
    ) -> Self
    where
        Input: Send + Sync + 'static,
        Output: Send + Sync + 'static,
        F: PureFunction<Input, Output> + 'static,
    {
        // Create a closure that calls the PureFunction
        let closure = move |input: Input| function.call(input);
        let wrapper = FunctionWrapper::new(closure, signature, category);
        Self {
            callable: Box::new(wrapper),
            signature,
            category,
            input_type_id: std::any::TypeId::of::<Input>(),
            output_type_id: std::any::TypeId::of::<Output>(),
        }
    }

    /// Get the function signature.
    pub fn signature(&self) -> &'static str {
        self.signature
    }

    /// Get the function category.
    pub fn category(&self) -> FunctionCategory {
        self.category
    }

    /// Get the input type ID for composition checking.
    pub fn input_type_id(&self) -> std::any::TypeId {
        self.input_type_id
    }

    /// Get the output type ID for composition checking.
    pub fn output_type_id(&self) -> std::any::TypeId {
        self.output_type_id
    }

    /// Try to call the function with type-erased input/output.
    ///
    /// # Arguments
    /// * `input` - The input value as Any
    ///
    /// # Returns
    /// Some(output) if the types match, None otherwise
    pub fn try_call(&self, input: Box<dyn std::any::Any>) -> Option<Box<dyn std::any::Any>> {
        // Check if the input type matches by checking the inner type
        if (*input).type_id() != self.input_type_id {
            return None;
        }

        // Call the function using the Callable trait
        Some(self.callable.call_boxed(input))
    }
}

/// Object-safe callable trait for type-erased function calls
pub trait Callable: Send + Sync {
    fn call_boxed(&self, input: Box<dyn std::any::Any>) -> Box<dyn std::any::Any>;
    fn input_type_id(&self) -> std::any::TypeId;
    fn output_type_id(&self) -> std::any::TypeId;
}

impl<Input, Output, F> Callable for FunctionWrapper<Input, Output, F>
where
    Input: Send + Sync + 'static,
    Output: Send + Sync + 'static,
    F: Fn(Input) -> Output + Send + Sync + 'static,
{
    fn call_boxed(&self, input: Box<dyn std::any::Any>) -> Box<dyn std::any::Any> {
        // Check type before downcast
        if (*input).type_id() != std::any::TypeId::of::<Input>() {
            eprintln!(
                "Type mismatch in callable: expected {:?}, got {:?}",
                std::any::TypeId::of::<Input>(),
                (*input).type_id()
            );
            panic!("Type mismatch in callable");
        }

        // Downcast the input to the expected type
        if let Ok(input) = input.downcast::<Input>() {
            let result = (self.function)(*input);
            Box::new(result)
        } else {
            panic!("Type mismatch in callable")
        }
    }

    fn input_type_id(&self) -> std::any::TypeId {
        std::any::TypeId::of::<Input>()
    }

    fn output_type_id(&self) -> std::any::TypeId {
        std::any::TypeId::of::<Output>()
    }
}

#[macro_export]
macro_rules! pure_function {
    ($name:ident, $input:ty, $output:ty, $category:expr, $body:expr) => {
        pub struct $name;

        impl $crate::functional::function_traits::PureFunction<$input, $output> for $name {
            fn call(&self, input: $input) -> $output {
                $body(input)
            }

            fn signature(&self) -> &'static str {
                stringify!($name)
            }

            fn category(&self) -> $crate::functional::function_traits::FunctionCategory {
                $category
            }
        }
    };
}

#[macro_export]
macro_rules! pure_closure {
    ($signature:expr, $category:expr, $closure:expr) => {
        $crate::functional::function_traits::FunctionWrapper::new($closure, $signature, $category)
    };
}
