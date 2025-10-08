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
    /// Maps a `ServiceError` variant to its HTTP status code.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::ServiceError;
    /// use actix_web::http::StatusCode;
    ///
    /// let err = ServiceError::Unauthorized { error_message: "no token".into() };
    /// assert_eq!(err.status_code(), StatusCode::UNAUTHORIZED);
    ///
    /// let err = ServiceError::NotFound { error_message: "missing".into() };
    /// assert_eq!(err.status_code(), StatusCode::NOT_FOUND);
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
    /// Builds an HTTP response representing this service error.
    ///
    /// The response uses this error's HTTP status code and a JSON body created by `ResponseBody::new` containing the error's string message and an empty detail string.
    ///
    /// # Examples
    ///
    /// ```
    /// # use actix_web::http::StatusCode;
    /// # use actix_web::error::ResponseError;
    /// # use actix_web_rest_api_with_jwt::error::ServiceError;
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

    /// Returns a transformer that applies this transformer's `transform` method and then applies another transformer to the result.
    ///
    /// The returned closure first invokes `self.transform` on the input `Result<T, E>`, then invokes `other` on the intermediate result and returns the final `Result<T, E>`.
    ///
    /// # Returns
    ///
    /// A closure that takes a `Result<T, E>`, applies this transform, then applies `other`, and returns the resulting `Result<T, E>`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::ErrorTransformer;
    ///
    /// // Two simple transformers that wrap error messages.
    /// let t1 = |r: Result<i32, String>| r.map_err(|e| format!("transformed: {}", e));
    /// let t2 = |r: Result<i32, String>| r.map_err(|e| format!("further: {}", e));
    ///
    /// let mut composed = t1.compose(t2);
    /// let input: Result<i32, String> = Err("err".into());
    /// assert_eq!(composed(input), Err("further: transformed: err".into()));
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
    /// Converts an Option<T> into a Result<U, E> by applying `f` to the contained value or returning `default_error` if empty.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::monadic::option_to_result;
    ///
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

    /// Converts a `Result<Option<T>, E1>` into a `Result<T, E2>`, mapping errors and producing a default `T` when the option is `None`.
    ///
    /// If the input is `Ok(Some(value))` the function returns `Ok(value)`. If the input is `Ok(None)` the function returns
    /// `Ok(T::default())`. If the input is `Err(e)` the function returns `Err(error_mapper(e))`.
    ///
    /// The `error_mapper` parameter is used to convert an `E1` into an `E2`. `T` must implement `Default` so a value can be
    /// produced for the `None` case.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::monadic::flatten_option;
    ///
    /// let res_ok_some: Result<Option<i32>, &str> = Ok(Some(42));
    /// assert_eq!(flatten_option(res_ok_some, |e| format!("err: {}", e)), Ok(42));
    ///
    /// let res_ok_none: Result<Option<i32>, &str> = Ok(None);
    /// assert_eq!(flatten_option(res_ok_none, |e| format!("err: {}", e)), Ok(0)); // i32::default() == 0
    ///
    /// let res_err: Result<Option<i32>, &str> = Err("boom");
    /// assert_eq!(flatten_option(res_err, |e| format!("err: {}", e)), Err(String::from("err: boom")));
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
    /// Applies a sequence of fallible operations to an initial value, returning the final success or the first encountered error.
    ///
    /// Each operation is applied in order; if any operation returns `Err`, processing stops and that error is returned.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::error_pipeline::process_sequence;
    ///
    /// let ops: Vec<fn(i32) -> Result<i32, &str>> = vec![
    ///     |x| Ok(x + 1),
    ///     |x| Ok(x * 2),
    ///     |x| if x > 10 { Err("Too big") } else { Ok(x) },
    /// ];
    ///
    /// assert_eq!(process_sequence(1, ops.into_iter()), Ok(4)); // (1 + 1) * 2 = 4
    ///
    /// let failing: Vec<fn(i32) -> Result<i32, &str>> = vec![|x| Ok(x), |_x| Err("failed")];
    /// assert_eq!(process_sequence(0, failing.into_iter()), Err("failed"));
    /// ```
    pub fn process_sequence<T, E>(
        initial: T,
        operations: impl Iterator<Item = fn(T) -> Result<T, E>>,
    ) -> Result<T, E> {
        operations.fold(Ok(initial), |acc, op| acc.and_then(op))
    }

    /// Collects successful values from an iterator of `Result`s and maps them using `transform`.
    ///
    /// Returns a `Vec<U>` containing the transformed successful values; any errors are ignored.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::error_pipeline::collect_successes;
    ///
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

    /// Creates a closure that records and reports errors into a shared collection.
    ///
    /// The returned closure accepts a `Result<(), E>`. If given `Err(e)`, it calls `reporter(&e)` and appends a clone of `e` into the provided `Arc<Mutex<Vec<E>>>`.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::sync::{Arc, Mutex};
    /// use crate::error::error_pipeline::build_error_reporter;
    ///
    /// let errors = Arc::new(Mutex::new(Vec::new()));
    /// let reporter = |err: &str| println!("reported: {}", err);
    /// let mut collect = build_error_reporter(errors.clone(), reporter);
    /// collect(Err("test error"));
    /// assert_eq!(errors.lock().unwrap().len(), 1);
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

    /// Creates a transformer that logs any error contained in a `Result` at the specified log level.
    ///
    /// The returned closure inspects a `Result`; if it is `Err`, the error is logged using the provided `level`,
    /// and the original `Result` is returned unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use log::Level;
    /// use crate::error::error_logging::log_errors;
    ///
    /// let mut transformer = log_errors::<i32, &str>(Level::Error);
    /// let result: Result<i32, &str> = Err("failure");
    /// let returned = transformer(result);
    /// assert!(returned.is_err());
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

    /// Create a transformer that logs an error only when the provided predicate returns true.
    ///
    /// The returned closure passes through the original `Result` unchanged, but will log the error
    /// at the specified `level` when the predicate evaluates to `true` for the error value.
    ///
    /// # Examples
    ///
    /// ```
    /// use log::Level;
    /// use crate::error::error_logging::log_errors_if;
    ///
    /// let mut transformer = log_errors_if(|e: &String| e.contains("critical"), Level::Error);
    /// let result: Result<i32, String> = Err("critical failure".into());
    /// let out = transformer(result);
    /// assert_eq!(out, Err("critical failure".to_string()));
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

    /// Returns a transformer that first applies a logger to a `Result` and then applies a transformer.
    ///
    /// The returned closure invokes the provided `logger` with the input `Result`, then passes the logger's output into `transformer`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::error_logging::{log_errors, chain_log_and_transform};
    /// use log::Level;
    ///
    /// let logger = log_errors::<i32, &str>(Level::Error);
    /// let transformer = |r: Result<i32, &str>| r.map_err(|e| format!("Handled: {}", e));
    /// let mut combined = chain_log_and_transform(logger, transformer);
    ///
    /// let result = combined(Err("original error"));
    /// assert_eq!(result, Err("Handled: original error".to_string()));
    /// ```
    pub fn chain_log_and_transform<T, E1, E2>(
        mut logger: impl FnMut(Result<T, E1>) -> Result<T, E1>,
        transformer: impl Fn(Result<T, E1>) -> Result<T, E2>,
    ) -> impl FnMut(Result<T, E1>) -> Result<T, E2> {
        move |result: Result<T, E1>| transformer(logger(result))
    }
}