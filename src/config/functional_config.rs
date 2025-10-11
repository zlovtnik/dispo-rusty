//! Functional Configuration Patterns
//!
//! This module provides functional programming patterns specifically designed for configuration
//! operations. It includes composable builders, functional error handling, and pipeline-based
//! initialization patterns that align with the project's functional programming principles.

use crate::{error::ServiceError, services::functional_patterns::Either};

use actix_web::web;

/// Functional route builder that composes route configurations
#[derive(Default)]
pub struct RouteBuilder {
    routes: Vec<Box<dyn Fn(&mut web::ServiceConfig) + Send + Sync + 'static>>,
}

impl RouteBuilder {
    /// Create a new RouteBuilder
    pub fn new() -> Self {
        Self { routes: Vec::new() }
    }

    /// Add a route configuration function
    pub fn add_route<F>(mut self, route_fn: F) -> Self
    where
        F: Fn(&mut web::ServiceConfig) + Send + Sync + 'static,
    {
        self.routes.push(Box::new(route_fn));
        self
    }

    /// Build all routes into the configuration
    pub fn build(self, cfg: &mut web::ServiceConfig) {
        for route_fn in self.routes {
            route_fn(cfg);
        }
    }
}

/// Functional logger for configuration operations
pub struct FunctionalLogger;

impl FunctionalLogger {
    /// Create a new functional logger
    pub fn new() -> Self {
        Self
    }

    /// Execute configuration with logging
    pub fn with_logging<F>(self, f: F) -> impl Fn(&mut web::ServiceConfig)
    where
        F: Fn(&mut web::ServiceConfig) + Clone + 'static,
    {
        move |cfg| {
            log::info!("Starting functional configuration...");

            // Wrap f(cfg) call in panic handler
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                f(cfg);
            }));

            match result {
                Ok(_) => {
                    log::info!("Functional configuration completed successfully");
                }
                Err(panic_info) => {
                    log::error!("Functional configuration panicked: {:?}", panic_info);
                    // Re-raise the panic so callers still observe the unwind
                    std::panic::resume_unwind(panic_info);
                }
            }
        }
    }
}

impl Default for FunctionalLogger {
    fn default() -> Self {
        Self::new()
    }
}

/// Functional configuration result that uses Either for error handling
pub type ConfigResult<T> = Either<ServiceError, T>;

/// Configuration builder using functional patterns
pub struct PoolConfig<T> {
    config: T,
}

impl<T> PoolConfig<T> {
    /// Create a new pool configuration
    pub fn new(config: T) -> Self {
        Self { config }
    }

    /// Apply a transformation to the configuration
    pub fn transform<U, F>(self, f: F) -> PoolConfig<U>
    where
        F: FnOnce(T) -> U,
    {
        PoolConfig::new(f(self.config))
    }

    /// Extract the configuration value
    pub fn into_inner(self) -> T {
        self.config
    }
}

/// URL masking utility for secure logging
pub struct UrlMasker;

impl UrlMasker {
    /// Mask sensitive parts of URLs for logging using robust URL parsing
    pub fn mask_url(url: &str) -> String {
        match url::Url::parse(url) {
            Ok(mut parsed_url) => {
                // If the URL has a password, mask it
                if parsed_url.password().is_some() {
                    // Set password to masked value
                    let _ = parsed_url.set_password(Some("***"));
                }
                parsed_url.to_string()
            }
            Err(_) => {
                // If parsing fails, return the original URL unchanged
                url.to_string()
            }
        }
    }
}

#[allow(dead_code)]
/// Configuration error handler using functional patterns
pub struct ConfigErrorHandler(());

// The struct is uninhabitable and used for namespacing static functions
#[allow(dead_code)]
impl ConfigErrorHandler {
    /// Handle configuration errors with functional composition
    pub fn handle_error<T, E1, E2>(
        result: Result<T, E1>,
        error_transformer: impl Fn(E1) -> E2,
    ) -> Either<E2, T> {
        match result {
            Ok(value) => Either::Right(value),
            Err(error) => Either::Left(error_transformer(error)),
        }
    }

    /// Chain error handling operations
    pub fn chain_error_handling<T, E1, E2, F>(
        first: Result<T, E1>,
        second_fn: F,
    ) -> Either<String, T>
    where
        F: FnOnce(&T) -> Result<(), E2>,
        E1: std::fmt::Display,
        E2: std::fmt::Display,
    {
        match first {
            Ok(value) => match second_fn(&value) {
                Ok(()) => Either::Right(value),
                Err(e) => Either::Left(format!("Secondary operation failed: {}", e)),
            },
            Err(e) => Either::Left(format!("Primary operation failed: {}", e)),
        }
    }
}

/// Utility trait for converting between Either and Result types
pub trait EitherConvert<T, E> {
    fn into_result(self) -> Result<T, E>;
    fn from_result(result: Result<T, E>) -> Self;
}

impl<T, E> EitherConvert<T, E> for Either<E, T> {
    fn into_result(self) -> Result<T, E> {
        match self {
            Either::Left(error) => Err(error),
            Either::Right(value) => Ok(value),
        }
    }

    fn from_result(result: Result<T, E>) -> Self {
        match result {
            Ok(value) => Either::Right(value),
            Err(error) => Either::Left(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_masker() {
        let url = "postgres://user:password@localhost:5432/db";
        let masked = UrlMasker::mask_url(url);
        assert!(masked.contains("user:***"));
        assert!(!masked.contains("password"));
    }

    #[test]
    fn test_route_builder() {
        let builder = RouteBuilder::new();
        assert_eq!(builder.routes.len(), 0);
    }

    #[test]
    fn test_config_error_handler() {
        let result: Result<i32, &str> = Ok(42);
        let either = ConfigErrorHandler::handle_error(result, |e| e.to_string());
        assert!(either.is_right());
    }
}
