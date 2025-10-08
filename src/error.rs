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
/// Map a `ServiceError` variant to its corresponding HTTP status code.
    ///
    /// The mapping is:
    /// - `Unauthorized` -> `401 UNAUTHORIZED`
    /// - `InternalServerError` -> `500 INTERNAL_SERVER_ERROR`
    /// - `BadRequest` -> `400 BAD_REQUEST`
    /// - `NotFound` -> `404 NOT_FOUND`
    /// - `Conflict` -> `409 CONFLICT`
    ///
    /// # Returns
    ///
    /// The `StatusCode` that represents the HTTP status for this error variant.
    ///
    /// # Examples
    ///
    ///
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
/// Implementations should define how to apply the transformation to a `Result<T, E>` and return the
/// transformed result. The trait intentionally keeps a narrow surface to simplify usage and avoid
/// introducing unnecessary blanket implementations or additional trait bounds.
pub trait ErrorTransformer<T, E> {
    /// Applies the transformer to the provided `Result`, potentially modifying the contained value or error.
    fn transform(&self, error: Result<T, E>) -> Result<T, E>;
}

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
    /// If the input is `Ok(Some(value))` returns `Ok(value)`. If the input is `Ok(None)` returns `Ok(T::default())`.
    /// If the input is `Err(e)` returns `Err(error_mapper(e))`.
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
    pub fn flatten_option<T, E1, E2>(
        result: Result<Option<T>, E1>,
        error_mapper: impl Fn(E1) -> E2,
        none_error: E2,
    ) -> Result<T, E2>
    {
        match result {
            Ok(Some(value)) => Ok(value),
            Ok(None) => Err(none_error),
            Err(e) => Err(error_mapper(e)),
        }
    }
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
    /// use crate::error::error_pipeline::collect_successes;
    ///
    /// let results = vec![Ok(1), Err("bad"), Ok(2)];

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
    /// Creates a closure that reports and collects errors produced by pipeline steps.
    ///
    /// The returned closure accepts a `Result<(), E>`; on `Err(e)` it invokes `reporter(&e)`
    /// and attempts to append a clone of `e` to the shared `errors` vector (locks the mutex).
    ///
    /// # Parameters
    ///
    /// * `errors` - Shared `Arc<Mutex<Vec<E>>>` where encountered errors will be stored.
    /// * `reporter` - Callback invoked with a reference to each reported error.
    ///
    /// # Returns
    ///
    /// A `FnMut(Result<(), E>)` closure that reports and stores errors on `Err` and does nothing on `Ok`.
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
    use std::sync::{Arc, Mutex};

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

    /// Returns the input `Result<T, E>` unchanged; if the input is `Err(e)` and `predicate(&e)`
    /// is true, the error is logged at the provided `level` before being returned.

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

    /// Composes two mutable error transformers into a single transformer guarded by mutexes.
    ///
    /// The returned closure first acquires the lock around `first`, invokes it with the incoming
    /// `Result`, and then feeds the intermediate result into `second`. Both closures are stored in
    /// `Arc<Mutex<...>>` wrappers to ensure thread-safe mutation even when the composed transformer
    /// is shared across threads.
    pub fn compose_transformers<T, E, F, G>(
        first: F,
        second: G,
    ) -> impl FnMut(Result<T, E>) -> Result<T, E>
    where
        T: Send + 'static,
        E: Send + 'static,
        F: FnMut(Result<T, E>) -> Result<T, E> + Send + 'static,
        G: FnMut(Result<T, E>) -> Result<T, E> + Send + 'static,
    {
        let first = Arc::new(Mutex::new(first));
        let second = Arc::new(Mutex::new(second));

        move |result: Result<T, E>| {
            let intermediate = {
                let mut first_guard = first
                    .lock()
                    .expect("compose_transformers: first transformer mutex poisoned");
                (&mut *first_guard)(result)
            };

            let mut second_guard = second
                .lock()
                .expect("compose_transformers: second transformer mutex poisoned");

            (&mut *second_guard)(intermediate)
        }
    }

    /// Chains logging with error transformation for comprehensive error handling.
    ///
    /// First logs the error if present, then applies a transformation function.
    /// Applies a logging function to a `Result`, then applies a transformer to the logger's output.
    ///
    /// The returned closure first invokes `logger` with the input `Result`, then passes the returned
    /// `Result` to `transformer` and returns the transformer's result.
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

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::ResponseError;
    use std::sync::{Arc, Mutex};

    // ErrorTransformer trait tests
    #[test]
    fn error_transformer_basic_usage() {
        struct DoubleError;
        
        impl ErrorTransformer<i32, String> for DoubleError {
            fn transform(&self, error: Result<i32, String>) -> Result<i32, String> {
                error.map_err(|e| format!("{}{}", e, e))
            }
        }
        
        let transformer = DoubleError;
        let result = transformer.transform(Err("error".to_string()));
    assert_eq!(result, Err("errorerror".to_string()));
        
        let ok_result = transformer.transform(Ok(42));
    assert_eq!(ok_result, Ok(42));
    }

    #[test]
    fn error_transformer_compose() {
    let t1 = |r: Result<i32, String>| r.map_err(|e| format!("T1: {}", e));
    let t2 = |r: Result<i32, String>| r.map_err(|e| format!("T2: {}", e));
        
        let result = t1(Err("original".to_string()));
        let result = t2(result);
    assert_eq!(result, Err("T2: T1: original".to_string()));
    }

    // Monadic error handling tests
    #[test]
    fn monadic_option_to_result_with_some() {
        let result = monadic::option_to_result(Some(5), |x| x * 2, "error");
    assert_eq!(result, Ok(10));
    }

    #[test]
    fn monadic_option_to_result_with_none() {
        let result: Result<i32, &str> =
            monadic::option_to_result(None::<i32>, |x| x * 2, "no value");
    assert_eq!(result, Err("no value"));
    }

    #[test]
    fn monadic_flatten_option_success() {
        let result: Result<Option<i32>, &str> = Ok(Some(42));
        let flattened = monadic::flatten_option(result, |e| format!("Error: {}", e));
    assert_eq!(flattened, Ok(42));
    }

    #[test]
    fn monadic_flatten_option_with_none() {
        let result: Result<Option<String>, &str> = Ok(None);
    let flattened = monadic::flatten_option(result, |e| format!("Error: {}", e));
    assert_eq!(flattened, Ok(String::default()));
    }

    #[test]
    fn monadic_flatten_option_with_error() {
        let result: Result<Option<i32>, &str> = Err("failure");
    let flattened = monadic::flatten_option(result, |e| format!("Error: {}", e));
    assert_eq!(flattened, Err("Error: failure".to_string()));
    }

    // Error pipeline tests
    #[test]
    fn error_pipeline_process_sequence_success() {
    let operations: Vec<fn(i32) -> Result<i32, &'static str>> = vec![
            |x| Ok(x + 1),
            |x| Ok(x * 2),
            |x| Ok(x - 3),
        ];
        
        let result = error_pipeline::process_sequence(5, operations.into_iter());
    assert_eq!(result, Ok(9)); // (5 + 1) * 2 - 3 = 9
    }

    #[test]
    fn error_pipeline_process_sequence_with_error() {
    let operations: Vec<fn(i32) -> Result<i32, &'static str>> = vec![
            |x| Ok(x + 1),
            |_| Err("operation failed"),
            |x| Ok(x * 2),
        ];
        
        let result = error_pipeline::process_sequence(5, operations.into_iter());
    assert_eq!(result, Err("operation failed"));
    }

    #[test]
    fn error_pipeline_process_sequence_empty() {
    let operations: Vec<fn(i32) -> Result<i32, &'static str>> = vec![];
        let result = error_pipeline::process_sequence(42, operations.into_iter());
    assert_eq!(result, Ok(42));
    }

    #[test]
    fn error_pipeline_collect_successes_filters_errors() {
    let results = vec![Ok(1), Err("bad"), Ok(2), Ok(3), Err("worse")];
        let successes = error_pipeline::collect_successes(results.into_iter(), |x| x * 10);
    assert_eq!(successes, vec![10, 20, 30]);
    }

    #[test]
    fn error_pipeline_collect_successes_all_errors() {
    let results: Vec<Result<i32, &str>> = vec![Err("a"), Err("b"), Err("c")];
        let successes = error_pipeline::collect_successes(results.into_iter(), |x| x * 10);
    assert!(successes.is_empty());
    }

    #[test]
    fn error_pipeline_collect_successes_no_transform() {
        let results: Vec<Result<i32, &str>> = vec![Ok(1), Ok(2), Ok(3)];
        let successes = error_pipeline::collect_successes(results.into_iter(), |x| x);
    assert_eq!(successes, vec![1, 2, 3]);
    }

    #[test]
    fn error_pipeline_build_error_reporter_collects_errors() {
    let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        let reported = Arc::new(Mutex::new(Vec::new()));
        
        let reported_clone = reported.clone();
        let reporter = move |err: &String| {
            reported_clone.lock().unwrap().push(err.clone());
        };
        
        let mut collect_fn = error_pipeline::build_error_reporter(errors.clone(), reporter);
        
        collect_fn(Err("error1".to_string()));
        collect_fn(Ok(()));
        collect_fn(Err("error2".to_string()));
        
        let collected = errors.lock().unwrap();
    assert_eq!(collected.len(), 2);
    assert_eq!(collected[0], "error1");
    assert_eq!(collected[1], "error2");
        
        let reported_items = reported.lock().unwrap();
    assert_eq!(reported_items.len(), 2);
    }

    // Error logging tests
    #[test]
    fn error_logging_log_errors_passes_through_ok() {
        let mut logger = error_logging::log_errors::<i32, String>(log::Level::Error);
        let result = logger(Ok(42));
    assert_eq!(result, Ok(42));
    }

    #[test]
    fn error_logging_log_errors_passes_through_err() {
        let mut logger = error_logging::log_errors::<i32, String>(log::Level::Error);
        let result = logger(Err("failure".to_string()));
    assert_eq!(result, Err("failure".to_string()));
    }

    #[test]
    fn error_logging_log_errors_if_conditional() {
        let mut logger = error_logging::log_errors_if(
            |e: &&str| e.contains("critical"),
            log::Level::Error,
        );
        
        let result: Result<(), &str> = logger(Err("critical failure"));
    assert!(result.is_err());
        
        let result2 = logger(Err("minor issue"));
    assert!(result2.is_err());
    }

    #[test]
    fn error_logging_chain_log_and_transform() {
        let logger = error_logging::log_errors::<i32, String>(log::Level::Error);
    let transformer = |r: Result<i32, String>| r.map_err(|e| format!("Transformed: {}", e));
        
        let mut combined = error_logging::chain_log_and_transform(logger, transformer);
        
        let result = combined(Err("original".to_string()));
    assert_eq!(result, Err("Transformed: original".to_string()));
        
        let ok_result = combined(Ok(100));
    assert_eq!(ok_result, Ok(100));
    }

    #[test]
    fn error_logging_compose_transformers_applies_in_order() {
        let first = |r: Result<i32, String>| r.map(|value| value + 1);
        let second = |r: Result<i32, String>| r.map(|value| value * 2);

        let mut composed = error_logging::compose_transformers(first, second);

        let result = composed(Ok(5));
    assert_eq!(result, Ok(12));

        let err_result = composed(Err("fail".to_string()));
    assert_eq!(err_result, Err("fail".to_string()));
    }

    // Integration tests combining multiple utilities
    #[test]
    fn integration_pipeline_with_error_collection() {
        let operations: Vec<fn(i32) -> Result<i32, String>> = vec![
            |x| if x > 0 { Ok(x + 1) } else { Err("negative input".to_string()) },
            |x| if x < 100 { Ok(x * 2) } else { Err("too large".to_string()) },
        ];
        
        let result = error_pipeline::process_sequence(5, operations.into_iter());
    assert_eq!(result, Ok(12)); // (5 + 1) * 2 = 12
    }

    #[test]
    fn integration_monadic_with_pipeline() {
        let opt = Some(10);
        let result = monadic::option_to_result(opt, |x| x * 2, "missing value");
        
    let operations: Vec<fn(i32) -> Result<i32, &'static str>> = vec![
            |x| Ok(x + 5),
            |x| if x > 100 { Err("overflow") } else { Ok(x * 3) },
        ];
        
        let final_result = result.and_then(|val| {
            error_pipeline::process_sequence(val, operations.into_iter())
        });
        
    assert_eq!(final_result, Ok(75)); // (10 * 2 + 5) * 3 = 75
    }

    #[test]
    fn service_error_status_codes() {
    assert_eq!(
            ServiceError::Unauthorized { error_message: "test".to_string() }.status_code(),
            StatusCode::UNAUTHORIZED
        );
    assert_eq!(
            ServiceError::NotFound { error_message: "test".to_string() }.status_code(),
            StatusCode::NOT_FOUND
        );
    assert_eq!(
            ServiceError::BadRequest { error_message: "test".to_string() }.status_code(),
            StatusCode::BAD_REQUEST
        );
    assert_eq!(
            ServiceError::InternalServerError { error_message: "test".to_string() }.status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    assert_eq!(
            ServiceError::Conflict { error_message: "test".to_string() }.status_code(),
            StatusCode::CONFLICT
        );
    }

    #[test]
    fn service_error_display() {
        let error = ServiceError::Unauthorized {
            error_message: "Invalid token".to_string(),
        };
    assert_eq!(format!("{}", error), "Invalid token");
    }
}