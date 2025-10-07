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

#[cfg(test)]
mod tests {
    use super::*;

    // Test helper struct
    struct AddOne;
    impl PureFunction<i32, i32> for AddOne {
        fn call(&self, input: i32) -> i32 {
            input + 1
        }

        fn signature(&self) -> &'static str {
            "add_one"
        }

        fn category(&self) -> FunctionCategory {
            FunctionCategory::Mathematical
        }
    }

    struct Double;
    impl PureFunction<i32, i32> for Double {
        fn call(&self, input: i32) -> i32 {
            input * 2
        }

        fn signature(&self) -> &'static str {
            "double"
        }

        fn category(&self) -> FunctionCategory {
            FunctionCategory::Mathematical
        }
    }

    struct ToString;
    impl PureFunction<i32, String> for ToString {
        fn call(&self, input: i32) -> String {
            input.to_string()
        }

        fn signature(&self) -> &'static str {
            "to_string"
        }

        fn category(&self) -> FunctionCategory {
            FunctionCategory::Transformation
        }
    }

    #[test]
    fn test_pure_function_trait() {
        let add_one = AddOne;
        assert_eq\!(add_one.call(5), 6);
        assert_eq\!(add_one.call(5), 6); // Deterministic
        assert_eq\!(add_one.signature(), "add_one");
        assert_eq\!(add_one.category(), FunctionCategory::Mathematical);
    }

    #[test]
    fn test_function_category_equality() {
        assert_eq\!(FunctionCategory::Mathematical, FunctionCategory::Mathematical);
        assert_ne\!(FunctionCategory::Mathematical, FunctionCategory::Validation);
        assert_ne\!(FunctionCategory::Transformation, FunctionCategory::Aggregation);
    }

    #[test]
    fn test_function_category_debug() {
        let cat = FunctionCategory::Transformation;
        let debug_str = format\!("{:?}", cat);
        assert\!(debug_str.contains("Transformation"));
    }

    #[test]
    fn test_function_wrapper_creation() {
        let wrapper = FunctionWrapper::new(
            |x: i32| x + 10,
            "add_ten",
            FunctionCategory::Mathematical,
        );

        assert_eq\!(wrapper.call(5), 15);
        assert_eq\!(wrapper.signature(), "add_ten");
        assert_eq\!(wrapper.category(), FunctionCategory::Mathematical);
    }

    #[test]
    fn test_function_wrapper_with_string() {
        let wrapper = FunctionWrapper::new(
            |s: String| s.to_uppercase(),
            "to_upper",
            FunctionCategory::StringProcessing,
        );

        assert_eq\!(wrapper.call("hello".to_string()), "HELLO");
        assert_eq\!(wrapper.signature(), "to_upper");
        assert_eq\!(wrapper.category(), FunctionCategory::StringProcessing);
    }

    #[test]
    fn test_function_wrapper_determinism() {
        let wrapper = FunctionWrapper::new(
            |x: i32| x * x,
            "square",
            FunctionCategory::Mathematical,
        );

        // Test determinism by calling multiple times
        let input = 7;
        let result1 = wrapper.call(input);
        let result2 = wrapper.call(input);
        let result3 = wrapper.call(input);

        assert_eq\!(result1, 49);
        assert_eq\!(result1, result2);
        assert_eq\!(result2, result3);
    }

    #[test]
    fn test_function_container_creation() {
        let func = AddOne;
        let container = FunctionContainer::new(func, "add_one", FunctionCategory::Mathematical);

        assert_eq\!(container.signature(), "add_one");
        assert_eq\!(container.category(), FunctionCategory::Mathematical);
        assert_eq\!(container.input_type_id(), std::any::TypeId::of::<i32>());
        assert_eq\!(container.output_type_id(), std::any::TypeId::of::<i32>());
    }

    #[test]
    fn test_function_container_type_ids() {
        let func = ToString;
        let container = FunctionContainer::new(func, "to_string", FunctionCategory::Transformation);

        assert_eq\!(container.input_type_id(), std::any::TypeId::of::<i32>());
        assert_eq\!(container.output_type_id(), std::any::TypeId::of::<String>());
        assert_ne\!(container.input_type_id(), container.output_type_id());
    }

    #[test]
    fn test_function_container_try_call_success() {
        let func = AddOne;
        let container = FunctionContainer::new(func, "add_one", FunctionCategory::Mathematical);

        let input: Box<dyn std::any::Any> = Box::new(10);
        let result = container.try_call(input);

        assert\!(result.is_some());
        let output = result.unwrap();
        let value = output.downcast::<i32>().unwrap();
        assert_eq\!(*value, 11);
    }

    #[test]
    fn test_function_container_try_call_type_mismatch() {
        let func = AddOne;
        let container = FunctionContainer::new(func, "add_one", FunctionCategory::Mathematical);

        // Try to call with wrong type (String instead of i32)
        let input: Box<dyn std::any::Any> = Box::new("wrong".to_string());
        let result = container.try_call(input);

        assert\!(result.is_none());
    }

    #[test]
    fn test_function_wrapper_with_complex_type() {
        #[derive(Debug, Clone, PartialEq)]
        struct Person {
            name: String,
            age: i32,
        }

        let wrapper = FunctionWrapper::new(
            |p: Person| Person {
                name: p.name.to_uppercase(),
                age: p.age + 1,
            },
            "transform_person",
            FunctionCategory::Transformation,
        );

        let input = Person {
            name: "alice".to_string(),
            age: 30,
        };

        let output = wrapper.call(input);
        assert_eq\!(output.name, "ALICE");
        assert_eq\!(output.age, 31);
    }

    #[test]
    fn test_all_function_categories() {
        let categories = vec\![
            FunctionCategory::Transformation,
            FunctionCategory::Aggregation,
            FunctionCategory::Validation,
            FunctionCategory::Filtering,
            FunctionCategory::Sorting,
            FunctionCategory::Grouping,
            FunctionCategory::Mathematical,
            FunctionCategory::StringProcessing,
            FunctionCategory::BusinessLogic,
        ];

        // Test that all categories are unique
        for (i, cat1) in categories.iter().enumerate() {
            for (j, cat2) in categories.iter().enumerate() {
                if i == j {
                    assert_eq\!(cat1, cat2);
                } else {
                    assert_ne\!(cat1, cat2);
                }
            }
        }
    }

    #[test]
    fn test_function_categories_hash() {
        use std::collections::HashSet;

        let mut set = HashSet::new();
        set.insert(FunctionCategory::Mathematical);
        set.insert(FunctionCategory::Transformation);
        set.insert(FunctionCategory::Mathematical); // Duplicate

        assert_eq\!(set.len(), 2); // Should only have 2 unique categories
        assert\!(set.contains(&FunctionCategory::Mathematical));
        assert\!(set.contains(&FunctionCategory::Transformation));
    }

    #[test]
    fn test_can_compose_with_default() {
        let func1 = AddOne;
        let func2 = Double;

        // Default implementation should allow composition
        assert\!(func1.can_compose_with(&func2));
        assert\!(func2.can_compose_with(&func1));
    }

    #[test]
    fn test_callable_trait_type_ids() {
        let wrapper = FunctionWrapper::new(
            |x: i32| x * 3,
            "triple",
            FunctionCategory::Mathematical,
        );

        assert_eq\!(wrapper.input_type_id(), std::any::TypeId::of::<i32>());
        assert_eq\!(wrapper.output_type_id(), std::any::TypeId::of::<i32>());
    }

    #[test]
    fn test_function_wrapper_edge_cases() {
        // Test with zero
        let wrapper = FunctionWrapper::new(
            |x: i32| x * 2,
            "double",
            FunctionCategory::Mathematical,
        );
        assert_eq\!(wrapper.call(0), 0);

        // Test with negative numbers
        assert_eq\!(wrapper.call(-5), -10);

        // Test with max value edge case
        let max_half = i32::MAX / 2;
        assert_eq\!(wrapper.call(max_half), max_half * 2);
    }

    #[test]
    fn test_function_wrapper_with_option() {
        let wrapper = FunctionWrapper::new(
            |x: Option<i32>| x.unwrap_or(0) * 2,
            "double_option",
            FunctionCategory::Mathematical,
        );

        assert_eq\!(wrapper.call(Some(5)), 10);
        assert_eq\!(wrapper.call(None), 0);
    }

    #[test]
    fn test_function_wrapper_with_result() {
        let wrapper = FunctionWrapper::new(
            |x: i32| -> Result<i32, String> {
                if x > 0 {
                    Ok(x * 2)
                } else {
                    Err("Input must be positive".to_string())
                }
            },
            "safe_double",
            FunctionCategory::Mathematical,
        );

        assert_eq\!(wrapper.call(5), Ok(10));
        assert\!(wrapper.call(-1).is_err());
        assert_eq\!(wrapper.call(0), Err("Input must be positive".to_string()));
    }

    #[test]
    fn test_function_container_with_different_types() {
        // Test i32 -> String transformation
        let to_string = FunctionWrapper::new(
            |x: i32| format\!("Number: {}", x),
            "format_number",
            FunctionCategory::StringProcessing,
        );

        let container = FunctionContainer::new(
            to_string,
            "format_number",
            FunctionCategory::StringProcessing,
        );

        let input: Box<dyn std::any::Any> = Box::new(42);
        let result = container.try_call(input);
        assert\!(result.is_some());

        let output = result.unwrap().downcast::<String>().unwrap();
        assert_eq\!(*output, "Number: 42");
    }

    #[test]
    fn test_multiple_function_wrappers() {
        let add = FunctionWrapper::new(
            |x: i32| x + 5,
            "add_five",
            FunctionCategory::Mathematical,
        );

        let mult = FunctionWrapper::new(
            |x: i32| x * 3,
            "triple",
            FunctionCategory::Mathematical,
        );

        let sub = FunctionWrapper::new(
            |x: i32| x - 2,
            "sub_two",
            FunctionCategory::Mathematical,
        );

        let input = 10;
        let result1 = add.call(input);  // 15
        let result2 = mult.call(result1);  // 45
        let result3 = sub.call(result2);  // 43

        assert_eq\!(result3, 43);
    }

    #[test]
    fn test_function_category_clone() {
        let cat1 = FunctionCategory::Validation;
        let cat2 = cat1.clone();
        assert_eq\!(cat1, cat2);
    }

    #[test]
    fn test_function_category_copy() {
        let cat1 = FunctionCategory::BusinessLogic;
        let cat2 = cat1; // Copy semantics
        assert_eq\!(cat1, cat2);
    }
}