//! Functional Programming Infrastructure
//!
//! This module provides advanced functional programming capabilities
//! for the Actix Web REST API, leveraging itertools and Rust's
//! functional programming features to create efficient, composable
//! data processing pipelines.
//!
//! Key components:
//! - Iterator Engine: Core iterator chain processing with itertools integration
//! - Chain Builder: Fluent API for building complex iterator chains
//! - Pure Function Registry: Storage and composition of pure functions
//! - Immutable State Management: Functional state handling with structural sharing
//! - State Transitions: High-level functional state transition operations
//! - Query Composition: Type-safe functional query building
//! - Validation Engine: Iterator-based validation pipelines
//! - Lazy Evaluation: Deferred computation patterns
//! - Concurrent Processing: Parallel functional operations
//! - Response Transformers: Composable API response formatting
//! - Error Handling: Monadic error processing
//! - Pagination: Iterator-based pagination
//! - Performance Monitoring: Functional pipeline metrics

// pub mod iterator_engine;
// pub mod chain_builder;
pub mod function_traits;
pub mod pure_function_registry;
pub mod immutable_state;
pub mod state_transitions;

// Re-export commonly used types for convenience
// pub use iterator_engine::{IteratorEngine, IteratorChain};
// pub use chain_builder::ChainBuilder;
// pub use pure_function_registry::{PureFunctionRegistry, SharedRegistry, RegistryError};

// pub use immutable_state::{
//     ImmutableRef, ImmutableStateManager, PersistentHashMap, PersistentVector,
//     QueryResult, StateTransitionMetrics, TenantApplicationState
// };
// pub use state_transitions::{TransitionError, TransitionResult, build_login_transitions, build_logout_transitions};
