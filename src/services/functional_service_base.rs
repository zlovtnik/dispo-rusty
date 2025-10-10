//! Functional Service Base
//!
//! Core functional programming patterns and utilities for service layer refactoring.
//! Provides common abstractions for database operations, error handling, and
//! data transformation using functional programming principles.

use crate::{
    config::db::Pool,
    error::{ServiceError, ServiceResult},
};
use diesel::PgConnection;
use std::future::Future;
use std::pin::Pin;

/// Simple validation trait for basic validation patterns
pub trait SimpleValidation<T> {
    fn validate(&self, data: &T) -> ServiceResult<()>;
}

/// Functional service pipeline for database operations
///
/// Provides a composable interface for building database operation chains
/// with automatic error handling, validation, and transaction management.
pub struct ServicePipeline<T> {
    pool: Pool,
    data: Option<T>,
    validations: Vec<Box<dyn SimpleValidation<T> + Send + Sync>>,
    transformations: Vec<Box<dyn Fn(T) -> Result<T, ServiceError> + Send + Sync>>,
}

impl<T> ServicePipeline<T>
where
    T: Send + Sync + 'static,
{
    /// Create a new service pipeline with the given pool
    pub fn new(pool: Pool) -> Self {
        Self {
            pool,
            data: None,
            validations: Vec::new(),
            transformations: Vec::new(),
        }
    }

    /// Set the input data for the pipeline
    pub fn with_data(mut self, data: T) -> Self {
        self.data = Some(data);
        self
    }

    /// Add a validation rule to the pipeline
    pub fn with_validation(
        mut self,
        validation: impl SimpleValidation<T> + Send + Sync + 'static,
    ) -> Self {
        self.validations.push(Box::new(validation));
        self
    }

    /// Add a transformation function to the pipeline
    pub fn with_transformation<F>(mut self, transform: F) -> Self
    where
        F: Fn(T) -> Result<T, ServiceError> + Send + Sync + 'static,
    {
        self.transformations.push(Box::new(transform));
        self
    }

    /// Execute the pipeline with the given database operation
    pub fn execute<F, R>(self, operation: F) -> ServiceResult<R>
    where
        F: FnOnce(T, &mut PgConnection) -> Result<R, ServiceError>,
    {
        let data = self
            .data
            .ok_or_else(|| ServiceError::bad_request("No data provided to pipeline"))?;

        // Run validations using functional iterator pattern
        for validation in &self.validations {
            validation.validate(&data)?;
        }

        // Apply transformations using functional pipeline
        let mut transformed_data = data;
        for transform in &self.transformations {
            transformed_data = transform(transformed_data)?;
        }

        // Execute database operation
        self.pool
            .get()
            .map_err(|e| {
                ServiceError::internal_server_error("Failed to get database connection")
                    .with_tag("db")
                    .with_detail(e.to_string())
            })
            .and_then(|mut conn| operation(transformed_data, &mut conn))
    }
}

/// Functional query builder for database operations
pub struct FunctionalQueryService {
    pool: Pool,
}

impl FunctionalQueryService {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }

    /// Execute a query with functional composition
    pub fn query<F, R>(&self, query_builder: F) -> ServiceResult<R>
    where
        F: FnOnce(&mut PgConnection) -> Result<R, ServiceError>,
    {
        self.pool
            .get()
            .map_err(|e| {
                ServiceError::internal_server_error("Failed to get database connection")
                    .with_tag("db")
                    .with_detail(e.to_string())
            })
            .and_then(|mut conn| query_builder(&mut conn))
    }

    /// Execute a query with validation and transformation pipeline
    pub fn query_with_pipeline<T, Q, V, Tr, R>(
        &self,
        input: T,
        query_fn: Q,
        validator: V,
        transformer: Tr,
    ) -> ServiceResult<R>
    where
        T: Send + Sync + 'static,
        Q: FnOnce(T, &mut PgConnection) -> Result<R, ServiceError>,
        V: SimpleValidation<T> + Send + Sync + 'static,
        Tr: Fn(T) -> Result<T, ServiceError> + Send + Sync + 'static,
    {
        ServicePipeline::new(self.pool.clone())
            .with_data(input)
            .with_validation(validator)
            .with_transformation(transformer)
            .execute(query_fn)
    }
}

/// Functional error handling for service operations
pub trait FunctionalErrorHandling<T> {
    /// Map errors to different types using functional composition
    fn map_error<F, E>(self, f: F) -> Result<T, E>
    where
        F: FnOnce(ServiceError) -> E;

    /// Chain error handling operations
    fn and_then_error<F, U, E>(self, f: F) -> Result<U, E>
    where
        F: FnOnce(T) -> Result<U, E>,
        E: From<ServiceError>;

    /// Log errors in a functional way
    fn log_error(self, context: &str) -> Result<T, ServiceError>;
}

impl<T> FunctionalErrorHandling<T> for ServiceResult<T> {
    fn map_error<F, E>(self, f: F) -> Result<T, E>
    where
        F: FnOnce(ServiceError) -> E,
    {
        self.map_err(f)
    }

    fn and_then_error<F, U, E>(self, f: F) -> Result<U, E>
    where
        F: FnOnce(T) -> Result<U, E>,
        E: From<ServiceError>,
    {
        match self {
            Ok(value) => f(value),
            Err(err) => Err(err.into()),
        }
    }

    fn log_error(self, context: &str) -> Result<T, ServiceError> {
        self.map_err(|err| {
            log::error!("Error in {}: {:?}", context, err);
            err
        })
    }
}

/// Functional data transformation utilities
pub struct DataTransformer;

impl DataTransformer {
    /// Transform data using a functional pipeline
    pub fn transform<T, U, F>(data: T, transform: F) -> ServiceResult<U>
    where
        F: FnOnce(T) -> Result<U, ServiceError>,
    {
        transform(data)
    }

    /// Transform collections using iterator chains
    pub fn transform_collection<T, U, F>(data: Vec<T>, transform: F) -> ServiceResult<Vec<U>>
    where
        F: Fn(T) -> Result<U, ServiceError>,
    {
        data.into_iter()
            .map(transform)
            .collect::<Result<Vec<_>, _>>()
    }

    /// Filter and transform data in a single pass
    pub fn filter_transform<T, U, P, F>(
        data: Vec<T>,
        predicate: P,
        transform: F,
    ) -> ServiceResult<Vec<U>>
    where
        P: Fn(&T) -> bool,
        F: Fn(T) -> Result<U, ServiceError>,
    {
        data.into_iter()
            .filter(predicate)
            .map(transform)
            .collect::<Result<Vec<_>, _>>()
    }
}

/// Async functional operations for future service enhancements
pub trait AsyncFunctionalOps<T> {
    /// Map async operations functionally
    fn map_async<F, U, Fut>(self, f: F) -> Pin<Box<dyn Future<Output = ServiceResult<U>> + Send>>
    where
        F: FnOnce(T) -> Fut + Send + 'static,
        Fut: Future<Output = ServiceResult<U>> + Send + 'static,
        T: Send + 'static,
        U: Send + 'static;
}

impl<T> AsyncFunctionalOps<T> for ServiceResult<T>
where
    T: Send + 'static,
{
    fn map_async<F, U, Fut>(self, f: F) -> Pin<Box<dyn Future<Output = ServiceResult<U>> + Send>>
    where
        F: FnOnce(T) -> Fut + Send + 'static,
        Fut: Future<Output = ServiceResult<U>> + Send + 'static,
        U: Send + 'static,
    {
        Box::pin(async move {
            match self {
                Ok(value) => f(value).await,
                Err(err) => Err(err),
            }
        })
    }
}

// Common validation implementations
pub struct NonEmptyStringValidation;

impl SimpleValidation<String> for NonEmptyStringValidation {
    fn validate(&self, data: &String) -> ServiceResult<()> {
        if data.trim().is_empty() {
            Err(ServiceError::bad_request("String cannot be empty"))
        } else {
            Ok(())
        }
    }
}

pub struct LengthValidation {
    pub min: usize,
    pub max: usize,
}

impl SimpleValidation<String> for LengthValidation {
    fn validate(&self, data: &String) -> ServiceResult<()> {
        let len = data.chars().count();
        if len < self.min {
            Err(ServiceError::bad_request(format!(
                "String too short, minimum length is {}",
                self.min
            )))
        } else if len > self.max {
            Err(ServiceError::bad_request(format!(
                "String too long, maximum length is {}",
                self.max
            )))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestValidation;

    impl SimpleValidation<i32> for TestValidation {
        fn validate(&self, data: &i32) -> ServiceResult<()> {
            if *data > 0 {
                Ok(())
            } else {
                Err(ServiceError::bad_request("Value must be positive"))
            }
        }
    }

    #[test]
    fn test_data_transformer() {
        let data = vec![1, 2, 3, 4, 5];
        let result =
            DataTransformer::filter_transform(data, |&x| x % 2 == 0, |x| Ok(x * 2)).unwrap();

        assert_eq!(result, vec![4, 8]);
    }

    #[test]
    fn test_functional_error_handling() {
        let result: ServiceResult<i32> = Ok(42);
        let mapped = result.map_error(|_| "custom error");
        assert!(mapped.is_ok());

        let error_result: ServiceResult<i32> = Err(ServiceError::internal_server_error("test"));
        let mapped_error = error_result.map_error(|_| "custom error");
        assert!(mapped_error.is_err());
    }

    #[test]
    fn test_validation() {
        let validation = TestValidation;
        assert!(validation.validate(&5).is_ok());
        assert!(validation.validate(&-1).is_err());
    }

    #[test]
    fn test_string_validation() {
        let validation = NonEmptyStringValidation;
        assert!(validation.validate(&"hello".to_string()).is_ok());
        assert!(validation.validate(&"".to_string()).is_err());
        assert!(validation.validate(&"   ".to_string()).is_err());
    }

    #[test]
    fn test_length_validation() {
        let validation = LengthValidation { min: 2, max: 10 };
        assert!(validation.validate(&"hello".to_string()).is_ok());
        assert!(validation.validate(&"a".to_string()).is_err());
        assert!(validation
            .validate(&"this is too long".to_string())
            .is_err());
    }
}
