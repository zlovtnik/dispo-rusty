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

    /// Determines whether this function can be composed with another function.
    ///
    /// The default implementation allows composition and may be overridden by implementations
    /// that enforce additional compatibility rules.
    ///
    /// # Arguments
    ///
    /// * `other` - the function to test composition compatibility with
    ///
    /// # Returns
    ///
    /// `true` if the functions can be composed, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// struct Id;
    /// impl PureFunction<i32, i32> for Id {
    ///     fn call(&self, input: i32) -> i32 { input }
    ///     fn signature(&self) -> &'static str { "Id" }
    ///     fn category(&self) -> FunctionCategory { FunctionCategory::Transformation }
    /// }
    ///
    /// let a = Id;
    /// let b = Id;
    /// assert!(a.can_compose_with(&b));
    /// ```
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
    /// Constructs a FunctionWrapper that wraps a pure function together with its signature and category.
    ///
    /// The `function` is the pure callable to be wrapped. The `signature` is a static string used to describe
    /// the function's signature for composition and lookup. The `category` classifies the function for organization.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::function_traits::{FunctionWrapper, FunctionCategory};
    ///
    /// let wrapped = FunctionWrapper::new(|x: i32| x + 1, "i32 -> i32", FunctionCategory::Transformation);
    /// assert_eq!(wrapped.call(1), 2);
    /// ```
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
    /// Invokes the wrapped pure function with the provided input.
    ///
    /// # Returns
    ///
    /// `Output` — the result of applying the wrapped function to `input`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::function_traits::{FunctionWrapper, FunctionCategory};
    ///
    /// let fw = FunctionWrapper::new(|x: i32| x + 1, "increment", FunctionCategory::Mathematical);
    /// let result = fw.call(1);
    /// assert_eq!(result, 2);
    /// ```
    fn call(&self, input: Input) -> Output {
        (self.function)(input)
    }

    /// Get the stored signature of the contained function.
    ///
    /// # Returns
    ///
    /// The stored signature string for the contained function.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::function_traits::{FunctionContainer, FunctionCategory};
    ///
    /// let container = FunctionContainer::new(|x: i32| x + 1, "add_one", FunctionCategory::Transformation);
    /// assert_eq!(container.signature(), "add_one");
    /// ```
    fn signature(&self) -> &'static str {
        self.signature
    }

    /// Returns the category assigned to this function container.
    ///
    /// # Examples
    ///
    /// ```
    /// let wrapper = FunctionWrapper::new(|x: i32| x + 1, "inc", FunctionCategory::Transformation);
    /// let container = FunctionContainer::new(wrapper, "inc", FunctionCategory::Transformation);
    /// assert_eq!(container.category(), FunctionCategory::Transformation);
    /// ```
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
    /// Constructs a type-erased container that holds a pure function together with its signature,
    /// category, and input/output type IDs.
    ///
    /// The container can be stored in heterogeneous registries and invoked via type-erased values.
    ///
    /// # Examples
    ///
    /// ```
    /// // Create a FunctionWrapper from a closure, then wrap it in a FunctionContainer.
    /// let wrapper = pure_closure!("inc_i32", FunctionCategory::Transformation, |x: i32| x + 1);
    /// let container = FunctionContainer::new(wrapper, "inc_i32", FunctionCategory::Transformation);
    /// // `container` now holds a callable with recorded input/output TypeIds.
    /// ```
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

    /// Retrieve the stored static signature for this function.
    ///
    /// # Returns
    ///
    /// The stored `&'static str` signature.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::{FunctionContainer, FunctionCategory};
    /// let cont = FunctionContainer::new(|x: i32| x + 1, "inc", FunctionCategory::Transformation);
    /// assert_eq!(cont.signature(), "inc");
    /// ```
    pub fn signature(&self) -> &'static str {
        self.signature
    }

    /// Returns the function's assigned category.
    ///
    /// # Returns
    ///
    /// The FunctionCategory value associated with this function.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::function_traits::{FunctionWrapper, FunctionCategory, pure_closure};
    ///
    /// let wrapper = pure_closure!("sig", FunctionCategory::Transformation, |x: i32| x + 1);
    /// let category = wrapper.category();
    /// assert_eq!(category, FunctionCategory::Transformation);
    /// ```
    pub fn category(&self) -> FunctionCategory {
        self.category
    }

    /// Provides the TypeId of the container's input type.
    ///
    /// # Returns
    ///
    /// The TypeId corresponding to the stored input type.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::any::TypeId;
    /// // Construct a container holding a function from i32 to i32
    /// let container = FunctionContainer::new::<i32, i32, _>(|x| x + 1, "inc_i32", FunctionCategory::Transformation);
    /// let id = container.input_type_id();
    /// assert_eq!(id, TypeId::of::<i32>());
    /// ```
    pub fn input_type_id(&self) -> std::any::TypeId {
        self.input_type_id
    }

    /// The `TypeId` of the function's output type.
    ///
    /// # Returns
    ///
    /// `TypeId` representing the function's output type.
    ///
    /// # Examples
    ///
    /// ```
    /// let wrapper = FunctionWrapper::new(|x: i32| x.to_string(), "to_string", FunctionCategory::Transformation);
    /// let container = FunctionContainer::new(wrapper, "to_string", FunctionCategory::Transformation);
    /// assert_eq!(container.output_type_id(), std::any::TypeId::of::<String>());
    /// ```
    pub fn output_type_id(&self) -> std::any::TypeId {
        self.output_type_id
    }

    /// Attempt to invoke the contained function with a type-erased input.
    ///
    /// If the boxed input's concrete type matches the function's expected input type, the function is called and its boxed output is returned; otherwise `None` is returned.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::any::Any;
    /// // Assuming `FunctionContainer` and `FunctionCategory` are in scope:
    /// let container = FunctionContainer::new(|x: i32| x + 1, "inc", FunctionCategory::Mathematical);
    /// let res = container.try_call(Box::new(1i32));
    /// assert_eq!(res.unwrap().downcast::<i32>().map(|b| *b).ok(), Some(2));
    ///
    /// // Type mismatch yields None
    /// let none = container.try_call(Box::new("not an i32"));
    /// assert!(none.is_none());
    /// ```
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
    /// Invoke the wrapped function using a type-erased boxed input and return the result as a boxed `Any`.
    ///
    /// Panics if the provided `input` does not have the expected concrete type for this callable.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::any::Any;
    /// // Construct a FunctionWrapper that adds 1 to an i32
    /// let wrapper = FunctionWrapper::new(|x: i32| x + 1, "inc", FunctionCategory::Mathematical);
    /// let input: Box<dyn Any> = Box::new(41i32);
    /// let output = wrapper.call_boxed(input);
    /// let result = *output.downcast::<i32>().unwrap();
    /// assert_eq!(result, 42);
    /// ```
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

    /// Gets the TypeId for the callable's input type.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::any::TypeId;
    /// let fw = FunctionWrapper::new(|x: i32| x, "id", FunctionCategory::Transformation);
    /// assert_eq!(fw.input_type_id(), TypeId::of::<i32>());
    /// ```
    fn input_type_id(&self) -> std::any::TypeId {
        std::any::TypeId::of::<Input>()
    }

    /// Get the TypeId for the callable's output type.
    ///
    /// Returns the `TypeId` corresponding to the callable's output type.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::any::TypeId;
    /// use crate::functional::function_traits::{FunctionWrapper, FunctionCategory};
    ///
    /// let wrapper = FunctionWrapper::new(|x: i32| x + 1, "add_one", FunctionCategory::Transformation);
    /// assert_eq!(wrapper.output_type_id(), TypeId::of::<i32>());
    /// ```
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