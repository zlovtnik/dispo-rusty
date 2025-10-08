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
    /// ```
    /// use crate::error::ServiceError;
    /// use actix_web::http::StatusCode;
    ///
    /// let e = ServiceError::Unauthorized { error_message: "no token".into() };
    /// assert_eq!(e.status_code(), StatusCode::UNAUTHORIZED);
    ///
    /// let e = ServiceError::InternalServerError { error_message: "oops".into() };
    /// assert_eq!(e.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
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
    /// The response uses the HTTP status mapped from the error variant, sets `Content-Type: application/json`,
    /// and has a JSON body containing the error's string representation as the message and an empty detail string.
    ///
    /// # Examples
    ///
    /// ```
    /// # use actix_web::http::StatusCode;
    /// # use actix_web::error::ResponseError;
    /// # // Example assumes ServiceError is available in scope
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

    /// Compose this transformer with another transformer, producing a closure that applies them in sequence.
    ///
    /// The returned closure applies `self.transform` to its input `Result`, then passes the intermediate
    /// result to the provided transformer and returns that final result.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::ErrorTransformer;
    ///
    /// struct PrefixTransformer(pub String);
    ///
    /// impl<T, E> ErrorTransformer<T, E> for PrefixTransformer {
    ///     fn transform(&self, r: Result<T, E>) -> Result<T, E> {
    ///         r.map_err(|e| format!("{}{}", self.0, format!("{:?}", e)).into())
    ///     }
    /// }
    ///
    /// let t1 = PrefixTransformer("A: ".to_string());
    /// let mut composed = t1.compose(|r: Result<i32, String>| r.map_err(|e| format!("B: {}", e)));
    ///
    /// let res: Result<i32, String> = Err("err".into());
    /// let out = composed(res);
    /// assert!(out.is_err());
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
    /// Converts an `Option<T>` into a `Result<U, E>` by applying `f` to the contained value or returning `default_error` when the option is `None`.
    ///
    /// # Returns
    ///
    /// `Ok(f(value))` if `option` is `Some(value)`, `Err(default_error)` if `option` is `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::monadic::option_to_result;
    ///
    /// let opt = Some(5);
    /// let res = option_to_result(opt, |x| x * 2, "No value");
    /// assert_eq!(res, Ok(10));
    ///
    /// let none: Option<i32> = None;
    /// let res = option_to_result(none, |x| x * 2, "No value");
    /// assert_eq!(res, Err("No value"));
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

    /// Convert a `Result<Option<T>, E1>` into `Result<T, E2>`, mapping errors and replacing `None` with `T::default()`.
    ///
    /// If the input is `Ok(Some(value))` returns `Ok(value)`. If the input is `Ok(None)` returns `Ok(T::default())`.
    /// If the input is `Err(e)` returns `Err(error_mapper(e))`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::monadic::flatten_option;
    ///
    /// let r: Result<Option<i32>, &str> = Ok(Some(42));
    /// assert_eq!(flatten_option(r, |e| format!("err: {}", e)), Ok(42));
    ///
    /// let r_none: Result<Option<i32>, &str> = Ok(None);
    /// assert_eq!(flatten_option(r_none, |e| format!("err: {}", e)), Ok(0)); // i32::default() == 0
    ///
    /// let r_err: Result<Option<i32>, &str> = Err("oops");
    /// assert_eq!(flatten_option(r_err, |e| format!("err: {}", e)), Err("err: oops".to_string()));
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
    /// Applies a sequence of fallible operations to an initial value, returning the first error encountered or the final value.
    ///
    /// Each operation is invoked with the current value; if it returns `Ok(next)` the pipeline continues, if it returns `Err(e)` the pipeline short-circuits and returns that error.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::error_pipeline::process_sequence;
    ///
    /// let ops: Vec<fn(i32) -> Result<i32, &'static str>> = vec![|x| Ok(x + 1), |x| Ok(x * 2)];
    /// assert_eq!(process_sequence(1, ops.into_iter()), Ok(4)); // (1 + 1) * 2 = 4
    ///
    /// let failing: Vec<fn(i32) -> Result<i32, &'static str>> = vec![|x| Ok(x), |_| Err("failed")];
    /// assert_eq!(process_sequence(0, failing.into_iter()), Err("failed"));
    /// ```
    pub fn process_sequence<T, E>(
        initial: T,
        operations: impl Iterator<Item = fn(T) -> Result<T, E>>,
    ) -> Result<T, E> {
        operations.fold(Ok(initial), |acc, op| acc.and_then(op))
    }

    /// Collects and transforms successful values from an iterator of `Result`s.
    ///
    /// Returns a `Vec<U>` with `transform` applied to each `Ok` value; `Err` values are ignored.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::error_pipeline::collect_successes;
    ///
    /// let results = vec![Ok(1), Err("bad"), Ok(2)];
    /// let successes: Vec<i32> = collect_successes(results.into_iter(), |x| x * 2);
    /// assert_eq!(successes, vec![2, 4]);
    /// ```
    pub fn collect_successes<T, U, E>(
        results: impl Iterator<Item = Result<T, E>>,
        transform: impl Fn(T) -> U,
    ) -> Vec<U> {
        results.filter_map(|r| r.ok()).map(transform).collect()
    }

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
    ///
    /// ```
    /// use std::sync::{Arc, Mutex};
    /// use crate::error::error_pipeline::build_error_reporter;
    ///
    /// let errors = Arc::new(Mutex::new(Vec::<&str>::new()));
    /// let reporter = |err: &&str| eprintln!("reported: {}", err);
    /// let mut collect_fn = build_error_reporter(errors.clone(), reporter);
    ///
    /// collect_fn(Err("test error"));
    ///
    /// let locked = errors.lock().unwrap();
    /// assert_eq!(locked.len(), 1);
    /// assert_eq!(locked[0], "test error");
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

    /// Returns a transformer closure that logs any contained error at the specified log `level` and yields the original `Result`.
    ///
    /// The closure inspects the `Result`; if it is `Err`, the error is logged (using the corresponding `log` macro for the level),
    /// then the same `Result` is returned unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use log::Level;
    /// use crate::error::error_logging::log_errors;
    ///
    /// let mut transformer = log_errors::<i32, &str>(Level::Error);
    /// let result: Result<i32, &str> = Err("failure");
    /// let logged = transformer(result);
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

    /// Creates a transformer that logs errors only when `predicate` returns `true`.
    ///
    /// Returns the input `Result<T, E>` unchanged; if the input is `Err(e)` and `predicate(&e)`
    /// is true, the error is logged at the provided `level` before being returned.
    ///
    /// # Examples
    ///
    /// ```
    /// use log::Level;
    /// use crate::error::error_logging::log_errors_if;
    ///
    /// let mut transformer = log_errors_if(|e: &String| e.contains("critical"), Level::Error);
    /// let res: Result<i32, String> = Err("critical failure".to_owned());
    /// let out = transformer(res);
    /// assert!(out.is_err());
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

    /// Applies a logging function to a `Result`, then applies a transformer to the logger's output.
    ///
    /// The returned closure first invokes `logger` with the input `Result`, then passes the returned
    /// `Result` to `transformer` and returns the transformer's result.
    ///
    /// # Examples
    ///
    /// ```
    /// use log::Level;
    ///
    /// // logger that passes through the result
    /// let mut logger = |r: Result<i32, &str>| { r };
    /// let transformer = |r: Result<i32, &str>| r.map_err(|e| format!("handled: {}", e));
    ///
    /// let mut combined = crate::error::error_logging::chain_log_and_transform(logger, transformer);
    ///
    /// let out = combined(Err("boom"));
    /// assert_eq!(out, Err(String::from("handled: boom")));
    /// ```
    pub fn chain_log_and_transform<T, E1, E2>(
        mut logger: impl FnMut(Result<T, E1>) -> Result<T, E1>,
        transformer: impl Fn(Result<T, E1>) -> Result<T, E2>,
    ) -> impl FnMut(Result<T, E1>) -> Result<T, E2> {
        move |result: Result<T, E1>| transformer(logger(result))
    }
}