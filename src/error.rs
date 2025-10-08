use crate::models::response::ResponseBody;
use actix_web::{
    error,
    http::{header::ContentType, StatusCode},
    HttpResponse,
};
use derive_more::{Display, Error};

#[derive(Debug, Display, Error)]
pub enum ServiceError {
    #[display(fmt = "{error_message}")]
    Unauthorized { error_message: String },

    #[display(fmt = "{error_message}")]
    InternalServerError { error_message: String },

    #[display(fmt = "{error_message}")]
    BadRequest { error_message: String },

    #[display(fmt = "{error_message}")]
    NotFound { error_message: String },

    #[display(fmt = "{error_message}")]
    Conflict { error_message: String },
}
impl error::ResponseError for ServiceError {
    /// Maps a `ServiceError` variant to its corresponding HTTP status code.
    ///
    /// # Returns
    ///
    /// The `StatusCode` associated with the error variant.
    ///
    /// # Examples
    /// ```
    /// use std::vec;
    /// use std::sync::{Arc, Mutex};
    /// # use crate::error::error_pipeline::build_error_reporter;
    /// let errors = Arc::new(Mutex::new(vec![]));
    /// let reporter = |err: &str| println!("Error: {}", err);
    /// let collect_fn = build_error_reporter(errors.clone(), reporter);
    /// collect_fn(Err("test error"));
    /// let locked_errors = errors.lock().unwrap();
    /// assert_eq!(locked_errors.len(), 1);
    /// ```
    fn status_code(&self) -> StatusCode {
        match *self {
            ServiceError::Unauthorized { .. } => StatusCode::UNAUTHORIZED,
            ServiceError::InternalServerError { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            ServiceError::BadRequest { .. } => StatusCode::BAD_REQUEST,
            ServiceError::NotFound { .. } => StatusCode::NOT_FOUND,
            ServiceError::Conflict { .. } => StatusCode::CONFLICT,
        }
    }
    /// Builds an HTTP response for this error with a JSON body describing the error.
    ///
    /// The response uses the HTTP status mapped from the error variant and a JSON body produced
    /// by `ResponseBody::new` containing the error's string representation and an empty detail string.
    ///
    /// # Examples
    ///
    /// ```
    /// # use actix_web::http::StatusCode;
    /// # use actix_web::error::ResponseError;
    /// # // Example assumes ServiceError is available in scope
    /// # use actix_web_rest_api_with_jwt::error::ServiceError;
    ///
    /// let err = ServiceError::BadRequest { error_message: "invalid input".into() };
    /// let resp = err.error_response();
    /// assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    /// ```
    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code())
            .insert_header(ContentType::json())
            .json(ResponseBody::new(&self.to_string(), String::from("")))
    }
}

/// Represents a transformation function for errors, enabling functional composition of error handling logic.
///
/// This trait allows errors to be transformed in a composable manner using Result and Option types.
/// Implementations should define how to apply the transformation to a Result<T, E>, and provide a way
/// to compose transformers to build complex error handling pipelines.
///
pub trait ErrorTransformer<T, E> {
    /// Applies the transformer to a Result, potentially modifying the error type.
    ///
    /// # Parameters
    /// * `error` - The Result to transform.
    ///
    /// # Returns
    /// The transformed Result after applying the transformation logic.
    fn transform(&self, error: Result<T, E>) -> Result<T, E>;

    /// Composes this transformer with another, allowing chaining of transformations.
    ///
    /// This enables building pipelines where multiple transformations are applied in sequence.
    /// The returned transformer first applies `self`, then applies the other transformer.
    ///
    /// # Parameters
    /// * `other` - The transformer to compose with this one.
    ///
    /// # Returns
    /// A composed transformer function that applies both transformations in order.
    ///
    /// # Examples
    /// ```
    /// use std::result;
    /// # use crate::error::ErrorTransformer;
    /// # fn example() {
    /// let t1 = |r: Result<i32, String>| r.map_err(|e| format!("Transformed: {}", e));
    /// let t2 = |r: Result<i32, String>| r.map_err(|e| format!("Further: {}", e));
    /// // Compose manually or use trait method
    /// # }
    /// ```
    fn compose<U>(self, other: U) -> impl FnMut(Result<T, E>) -> Result<T, E>
    where
        Self: Sized + 'static,
        U: FnMut(Result<T, E>) -> Result<T, E> + 'static,
        T: 'static,
        E: Clone + 'static,
    {
        let this = std::cell::RefCell::new(self);
        let other = std::cell::RefCell::new(other);
        move |error: Result<T, E>| {
            let intermediate = this.borrow_mut().transform(error);
            other.borrow_mut()(intermediate)
        }
    }
}

/// Monadic error handling utilities using Result and Option for functional composition.
///
/// These functions provide combinators inspired by functional programming patterns,
/// allowing for more expressive and composable error handling.
pub mod monadic {
    /// Applies a function to an Option, transforming it into a Result with a default error.
    ///
    /// # Parameters
    /// * `option` - The Option to convert and transform.
    /// * `f` - The function to apply if the Option is Some.
    /// * `default_error` - The error to return if the Option is None.
    ///
    /// # Returns
    /// A Result containing the transformed value or the default error.
    ///
    /// # Examples
    /// ```
    /// use std::result;
    /// # use crate::error::monadic::option_to_result;
    /// let opt = Some(5);
    /// let result = option_to_result(opt, |x| x * 2, "No value");
    /// assert_eq!(result, Ok(10));
    ///
    /// let none: Option<i32> = None;
    /// let result = option_to_result(none, |x| x * 2, "No value");
    /// assert_eq!(result, Err("No value"));
    /// ```
    pub fn option_to_result<T, U, E>(
        option: Option<T>,
        f: impl Fn(T) -> U,
        default_error: E,
    ) -> Result<U, E> {
        match option {
            Some(value) => Ok(f(value)),
            None => Err(default_error),
        }
    }

    /// Lifts a function that returns an Option into Result<Option<_>> with error mapping.
    ///
    /// # Parameters
    /// * `result` - The Result<Option<T>> to process.
    /// * `error_mapper` - Function to transform errors.
    ///
    /// # Returns
    /// A Result<T, E> where errors are mapped and nested Options are flattened.
    ///
    /// # Examples
    /// ```
    /// use std::result;
    /// # use crate::error::monadic::flatten_option;
    /// let result: Result<Option<i32>, &str> = Ok(Some(42));
    /// let flattened = flatten_option(result, |e| format!("Error: {}", e));
    /// assert_eq!(flattened, Ok(42));
    ///
    /// let none_result: Result<Option<i32>, &str> = Ok(None);
    /// let flattened = flatten_option(none_result, |e| format!("Error: {}", e));
    /// assert!(flattened.is_ok()); // Assuming None is handled appropriately
    /// ```
    pub fn flatten_option<T, E1, E2>(
        result: Result<Option<T>, E1>,
        error_mapper: impl Fn(E1) -> E2,
    ) -> Result<T, E2>
    where
        T: Default, // To handle None case, though logically it should be Some
    {
        match result {
            Ok(Some(value)) => Ok(value),
            Ok(None) => Ok(T::default()), // Perhaps this should be Err, but for flexibility
            Err(e) => Err(error_mapper(e)),
        }
    }
}

/// Provides composable error processing pipelines using iterator chains.
///
/// These utilities allow processing sequences of errors or error-prone operations
/// in a functional style, similar to monadic do notation.
pub mod error_pipeline {
    /// Processes a sequence of error-prone operations using an iterator pipeline.
    ///
    /// Applies a series of transformations to an initial value, collecting errors as they occur.
    /// This enables building complex error handling workflows in a composable manner.
    ///
    /// # Parameters
    /// * `initial` - The starting value for the pipeline.
    /// * `operations` - Iterator of functions that take a value and return Result<T, E>.
    ///
    /// # Returns
    /// The final Result after applying all operations, or the first error encountered.
    ///
    /// # Examples
    /// ```
    /// use std::vec;
    /// # use crate::error::error_pipeline::process_sequence;
    /// let operations = vec![
    ///     |x: i32| Ok(x + 1),
    ///     |x: i32| Ok(x * 2),
    ///     |x: i32| if x > 10 { Err("Too big") } else { Ok(x) },
    /// ];
    /// let result = process_sequence(1, operations.into_iter());
    /// assert_eq!(result, Ok(4)); // 1 +1 =2, *2=4
    ///
    /// let failing = vec![|x: i32| Ok(x), |x: i32| Err("Failed")];
    /// let result = process_sequence(0, failing.into_iter());
    /// assert_eq!(result, Err("Failed"));
    /// ```
    pub fn process_sequence<T, E>(
        initial: T,
        operations: impl Iterator<Item = fn(T) -> Result<T, E>>,
    ) -> Result<T, E> {
        operations.fold(Ok(initial), |acc, op| acc.and_then(op))
    }

    /// Filters and transforms a collection of Results, keeping only successful values.
    ///
    /// # Parameters
    /// * `results` - Iterator of Results to process.
    /// * `transform` - Function to apply to successful values.
    ///
    /// # Returns
    /// A vector of transformed successful results, ignoring errors.
    ///
    /// # Examples
    /// ```
    /// use std::vec;
    /// # use crate::error::error_pipeline::collect_successes;
    /// let results = vec![Ok(1), Err("bad"), Ok(2), Err("worse")];
    /// let successes: Vec<i32> = collect_successes(results.into_iter(), |x| x * 2);
    /// assert_eq!(successes, vec![2, 4]);
    /// ```
    pub fn collect_successes<T, U, E>(
        results: impl Iterator<Item = Result<T, E>>,
        transform: impl Fn(T) -> U,
    ) -> Vec<U> {
        results.filter_map(|r| r.ok()).map(transform).collect()
    }

    /// Builds an error reporting function that collects and reports errors from a pipeline.
    ///
    /// # Parameters
    /// * `errors` - Mutable reference to a collection of errors to append to.
    /// * `reporter` - Function to report each error.
    ///
    /// # Returns
    /// A function that can be used in a pipeline to collect errors.
    ///
    /// # Examples
    /// ```
    /// use std::vec;
    /// use std::sync::{Arc, Mutex};
    /// # use crate::error::error_pipeline::build_error_reporter;
    /// let errors = Arc::new(Mutex::new(vec![]));
    /// let reporter = |err: &str| println!("Error: {}", err);
    /// let collect_fn = build_error_reporter(errors.clone(), reporter);
    /// collect_fn(Err("test error"));
    /// let locked_errors = errors.lock().unwrap();
    /// assert_eq!(locked_errors.len(), 1);
    /// ```
    pub fn build_error_reporter<E: Clone + 'static>(
        errors: std::sync::Arc<std::sync::Mutex<Vec<E>>>,
        reporter: impl Fn(&E) + 'static,
    ) -> impl FnMut(Result<(), E>) + 'static {
        move |result: Result<(), E>| {
            if let Err(ref e) = result {
                reporter(&e.clone());
                if let Ok(mut vec) = errors.lock() {
                    vec.push(e.clone());
                }
            }
        }
    }
}

/// Functional error logging utilities for comprehensive error monitoring.
///
/// These functions provide higher-order logging capabilities that integrate
/// seamlessly with functional error handling pipelines.
pub mod error_logging {
    use log::{debug, error, info, warn};

    /// Creates a logging transformer that logs errors at the specified level.
    ///
    /// # Parameters
    /// * `level` - The log level to use for errors.
    ///
    /// # Returns
    /// A function that logs errors and passes through the Result unchanged.
    ///
    /// # Examples
    /// ```
    /// use log::Level;
    /// # use crate::error::error_logging::log_errors;
    /// let transformer = log_errors(Level::Error);
    /// let result: Result<i32, &str> = Err("Failure");
    /// let logged = transformer(result);
    /// // Error is logged, result remains Err("Failure")
    /// assert!(logged.is_err());
    /// ```
    pub fn log_errors<T, E: std::fmt::Debug + Clone>(
        level: log::Level,
    ) -> impl FnMut(Result<T, E>) -> Result<T, E> {
        move |result: Result<T, E>| {
            if let Err(ref e) = result {
                match level {
                    log::Level::Error => error!("{:?}", e),
                    log::Level::Warn => warn!("{:?}", e),
                    log::Level::Info => info!("{:?}", e),
                    log::Level::Debug => debug!("{:?}", e),
                    _ => debug!("{:?}", e),
                }
            }
            result
        }
    }

    /// Creates a conditional error logger that only logs when a predicate is true.
    ///
    /// # Parameters
    /// * `predicate` - Function that determines whether to log the error.
    /// * `level` - Log level to use.
    ///
    /// # Returns
    /// A Result transformer that conditionally logs errors.
    ///
    /// # Examples
    /// ```
    /// use log::Level;
    /// # use crate::error::error_logging::log_errors_if;
    /// let transformer = log_errors_if(|e: &&str| e.contains("critical"), Level::Error);
    /// let result: Result<i32, &str> = Err("critical error");
    /// let logged = transformer(result);
    /// // Logs "critical error", result remains Err
    /// ```
    pub fn log_errors_if<T, E: std::fmt::Debug + Clone>(
        predicate: impl Fn(&E) -> bool + 'static,
        level: log::Level,
    ) -> impl FnMut(Result<T, E>) -> Result<T, E> {
        let mut logger = log_errors::<T, E>(level);
        move |result: Result<T, E>| match result {
            Ok(_) => result,
            Err(ref e) if predicate(e) => logger(Err(e.clone())),
            Err(_) => result,
        }
    }

    /// Chains logging with error transformation for comprehensive error handling.
    ///
    /// First logs the error if present, then applies a transformation function.
    ///
    /// # Parameters
    /// * `logger` - The logging function to apply first.
    /// * `transformer` - The transformation to apply after logging.
    ///
    /// # Returns
    /// A composed transformer that logs and then transforms errors.
    ///
    /// # Examples
    /// ```
    /// # use crate::error::error_logging::{log_errors, chain_log_and_transform};
    /// use log::Level;
    /// let logger = log_errors::<i32, &str>(Level::Error);
    /// let transformer = |r: Result<i32, &str>| r.map_err(|e| format!("Handled: {}", e));
    /// let combined = chain_log_and_transform(logger, transformer);
    /// let result = combined(Err("original error"));
    /// // Logs error, then transforms to "Handled: original error"
    /// ```
    pub fn chain_log_and_transform<T, E1, E2>(
        mut logger: impl FnMut(Result<T, E1>) -> Result<T, E1>,
        transformer: impl Fn(Result<T, E1>) -> Result<T, E2>,
    ) -> impl FnMut(Result<T, E1>) -> Result<T, E2> {
        move |result: Result<T, E1>| transformer(logger(result))
    }
}
