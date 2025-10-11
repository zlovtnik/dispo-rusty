//! Models Module with Functional Programming Support
//!
//! This module provides database models with integrated functional programming
//! capabilities from the functional crate. Models leverage type-safe query builders,
//! iterator-based validation, and composable data processing pipelines.
//!
//! Key Features:
//! - Functional query composition with lazy evaluation
//! - Iterator-based validation engines
//! - Type-safe column references and predicates
//! - Pure function registries for data transformations
//! - Performance monitoring for database operations

pub mod filters;
pub mod login_history;
pub mod nfe_cofins;
pub mod nfe_document;
pub mod nfe_emitter;
pub mod nfe_icms;
pub mod nfe_ipi;
pub mod nfe_item;
pub mod nfe_pis;
pub mod nfe_product;
pub mod nfe_recipient;
pub mod pagination;
pub mod person;
pub mod refresh_token;
pub mod response;
pub mod tenant;
pub mod user;
pub mod user_token;

// Re-export functional programming utilities for model operations
pub use crate::functional::{
    iterator_engine::{IteratorChain, IteratorEngine},
    pure_function_registry::{PureFunctionRegistry, RegistryError, SharedRegistry},
    query_builder::{
        compare, contains, equals, null_check, Column, Operator, Predicate, QueryFilter,
        TypeSafeQueryBuilder,
    },
    query_composition::{
        composable_predicate, field_filter_to_composable, ComposablePredicate,
        FunctionalQueryComposer, LazyEvaluationConfig, ParameterSanitizer, QueryOptimizationEngine,
        QueryPerformanceMetrics,
    },
    response_transformers::ResponseTransformer,
    validation_engine::{
        validate_struct_field, validator, validator_with_config, LazyValidationIterator,
        ValidationConfig, ValidationContext, ValidationEngine, ValidationOutcome,
        ValidationPipeline, ValidationPipelineResult,
    },
    validation_rules::{
        all, any, not, when, Custom, Email, Length, MustBeTrue, OneOf, Phone, Range, Required,
        Unique, Url, ValidationError, ValidationResult, ValidationRule,
    },
};

// Re-export commonly used functional traits
pub use crate::functional::function_traits::{FunctionCategory, PureFunction};

// Functional model utilities
pub mod functional_utils {
    //! Functional utilities specifically for model operations

    use super::*;

    /// Creates a type-safe column reference for functional queries
    pub fn column<T, C>(table: &str, column: &str) -> Column<T, C> {
        Column::new(table.to_string(), column.to_string())
    }

    /// Creates a validation engine with default configuration
    pub fn validation_engine() -> ValidationEngine<()> {
        ValidationEngine::new()
    }

    /// Creates a validation engine with custom configuration
    /// Note: ValidationEngine doesn't take config in constructor, use builder pattern
    pub fn validation_engine_with_config(_config: ValidationConfig) -> ValidationEngine<()> {
        ValidationEngine::new()
    }
}
