//! Functional Configuration Patterns
//!
//! This module provides functional programming patterns specifically designed for configuration
//! operations. It includes composable builders, functional error handling, and pipeline-based
//! initialization patterns that align with the project's functional programming principles.

use crate::{
    error::ServiceError,
    services::functional_patterns::Either,
};

use actix_web::web;

/// Functional route builder that composes route configurations
#[derive(Clone)]
pub struct RouteBuilder {
    routes: Vec<fn(&mut web::ServiceConfig)>,
}

impl RouteBuilder {
    /// Create a new RouteBuilder
    pub fn new() -> Self {
        Self { routes: Vec::new() }
    }

    /// Add a route configuration function
    pub fn add_route(mut self, route_fn: fn(&mut web::ServiceConfig)) -> Self {
        self.routes.push(route_fn);
        self
    }

    /// Build all routes into the configuration
    pub fn build(self, cfg: &mut web::ServiceConfig) {
        for route_fn in self.routes {
            route_fn(cfg);
        }
    }
}

impl Default for RouteBuilder {
    fn default() -> Self {
        Self::new()
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
            f(cfg);
            log::info!("Functional configuration completed successfully");
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
    /// Mask sensitive parts of URLs for logging
    pub fn mask_url(url: &str) -> String {
        if url.contains("://") && url.contains("@") {
            // Basic masking for database URLs
            let parts: Vec<&str> = url.split("@").collect();
            if parts.len() >= 2 {
                let scheme_and_masked = parts[0]
                    .split("://")
                    .map(|part| {
                        if part.contains(":") {
                            // Mask the password part
                            let auth_parts: Vec<&str> = part.split(":").collect();
                            if auth_parts.len() >= 2 {
                                format!("{}:***", auth_parts[0])
                            } else {
                                part.to_string()
                            }
                        } else {
                            part.to_string()
                        }
                    })
                    .collect::<Vec<String>>()
                    .join("://");

                format!("{}@{}", scheme_and_masked, parts[1..].join("@"))
            } else {
                url.to_string()
            }
        } else {
            url.to_string()
        }
    }
}

/// Configuration error handler using functional patterns
pub struct ConfigErrorHandler;

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
