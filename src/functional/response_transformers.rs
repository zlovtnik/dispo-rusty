//! Composable Response Transformers
//!
//! This module implements functional response composition utilities that
//! standardize API responses, provide content-type negotiation, and
//! integrate seamlessly with Actix Web's [`Responder`] trait. The design
//! embraces immutable data, pure transformation functions, and
//! declarative configuration to keep response formatting predictable and
//! testable across all endpoints.
//!
//! # Highlights
//!
//! - [`ResponseTransformer`] is a fluent, functional builder for HTTP
//!   responses that supports `map`-style transformations on payload,
//!   message, and metadata.
//! - Automatic content-type negotiation honours the caller's `Accept`
//!   header while allowing explicit format overrides where required.
//! - Optional metadata attachment enables enriched responses without
//!   forcing schema changes on the underlying data structures.
//! - A fallible API (`try_with_metadata`, `try_insert_header`) provides
//!   ergonomic error handling without sacrificing composability.
//!
//! ```no_run
//! use actix_web::http::StatusCode;
//! use actix_web::test::TestRequest;
//! use actix_web::Responder;
//! use crate::functional::response_transformers::ResponseTransformer;
//!
//! # actix_rt::System::new().block_on(async {
//! let response = ResponseTransformer::new(vec![1, 2, 3])
//!     .with_message("numbers")
//!     .with_status(StatusCode::CREATED)
//!     .map_data(|numbers| numbers.into_iter().map(|n| n * 2).collect::<Vec<_>>())
//!     .respond_to(&TestRequest::default().to_http_request());
//! assert_eq!(response.status(), StatusCode::CREATED);
//! # });
//! ```

use std::borrow::Cow;
use std::str::FromStr;

use actix_web::body::{self, BoxBody};
use actix_web::http::header::{
    self, HeaderName, HeaderValue, InvalidHeaderName, InvalidHeaderValue,
};
use actix_web::http::StatusCode;
use actix_web::{HttpRequest, HttpResponse, HttpResponseBuilder, Responder};
use serde::Serialize;
use serde_json::{self, json, Value as JsonValue};
use thiserror::Error;

use crate::constants;
use crate::models::response::ResponseBody;

/// Supported output formats handled by the response transformer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResponseFormat {
    /// Standard JSON (`application/json`).
    Json,
    /// Pretty-printed JSON (`application/json`).
    JsonPretty,
    /// Plain text (`text/plain`).
    Text,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FormatStrategy {
    Auto,
    Forced(ResponseFormat),
}

/// Errors that can occur while composing responses.
#[derive(Debug, Error)]
pub enum ResponseTransformError {
    #[error("metadata serialization failed: {0}")]
    MetadataSerialization(#[from] serde_json::Error),
    #[error("invalid header name: {0}")]
    InvalidHeaderName(#[from] InvalidHeaderName),
    #[error("invalid header value: {0}")]
    InvalidHeaderValue(#[from] InvalidHeaderValue),
}

/// Serializable response envelope used for standardized payloads.
#[derive(Debug, Clone, Serialize)]
pub struct ResponseEnvelope<T>
where
    T: Serialize,
{
    pub message: String,
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonValue>,
}

/// Functional response transformer with fluent, immutable composition.
#[derive(Debug)]
pub struct ResponseTransformer<T> {
    message: Cow<'static, str>,
    data: T,
    status: StatusCode,
    metadata: Option<JsonValue>,
    headers: Vec<(HeaderName, HeaderValue)>,
    allowed_formats: Vec<ResponseFormat>,
    strategy: FormatStrategy,
}

impl<T> ResponseTransformer<T> {
    /// Creates a ResponseTransformer containing the given payload with sensible defaults:
    /// HTTP 200 status, message "OK", no metadata, no headers, and JSON formats allowed.
    ///
    /// # Examples
    ///
    /// ```
    /// let _ = ResponseTransformer::new("payload");
    /// ```
    pub fn new(data: T) -> Self {
        Self {
            message: Cow::Borrowed(constants::MESSAGE_OK),
            data,
            status: StatusCode::OK,
            metadata: None,
            headers: Vec::new(),
            allowed_formats: vec![ResponseFormat::Json, ResponseFormat::JsonPretty],
            strategy: FormatStrategy::Auto,
        }
    }

    /// Set the envelope message used in the response.
    ///
    /// # Examples
    ///
    /// ```
    /// let _ = ResponseTransformer::new(()).with_message("Created");
    /// ```
    pub fn with_message(mut self, message: impl Into<Cow<'static, str>>) -> Self {
        self.message = message.into();
        self
    }

    /// Transform the transformer's message using the provided function.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::borrow::Cow;
    ///
    /// let transformed = ResponseTransformer::new(42)
    ///     .map_message(|m: Cow<'static, str>| Cow::Owned(format!("greet: {}", m)));
    ///
    /// let _ = transformed;
    /// ```
    pub fn map_message<F>(self, transform: F) -> Self
    where
        F: FnOnce(Cow<'static, str>) -> Cow<'static, str>,
    {
        let Self {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        } = self;

        let new_message = transform(message);

        Self {
            message: new_message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        }
    }

    /// Sets the HTTP status code to use for the generated response.
    ///
    /// # Examples
    ///
    /// ```
    /// use http::StatusCode;
    /// // Construct a transformer and set the status to 201 Created
    /// let transformer = ResponseTransformer::new(vec![1, 2, 3]).with_status(StatusCode::CREATED);
    /// ```
    pub fn with_status(mut self, status: StatusCode) -> Self {
        self.status = status;
        self
    }

    /// Set the envelope metadata to a pre-serialized JSON value, replacing any existing metadata.
    ///
    /// The provided `metadata` is stored as-is and will be included in the serialized response envelope.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// use crate::functional::response_transformers::ResponseTransformer;
    ///
    /// let transformer = ResponseTransformer::new(())
    ///     .with_metadata_value(json!({"request_id": "abc123"}));
    ///
    /// // transformer now carries the provided JSON metadata for inclusion in the response envelope
    /// ```
    pub fn with_metadata_value(mut self, metadata: JsonValue) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Attach serializable metadata to the transformer by converting it to a JSON value.
    ///
    /// Serializes `metadata` into a `serde_json::Value` and stores it in the transformer's
    /// metadata field. Returns an error if serialization fails.
    ///
    /// # Returns
    ///
    /// `Ok(Self)` with the metadata attached on success, `Err(ResponseTransformError::MetadataSerialization)` if serialization fails.
    ///
    /// # Examples
    ///
    /// ```
    /// let transformer = ResponseTransformer::new(());
    /// let transformer = transformer.try_with_metadata(&("key", "value")).unwrap();
    /// ```
    pub fn try_with_metadata<M>(mut self, metadata: M) -> Result<Self, ResponseTransformError>
    where
        M: Serialize,
    {
        self.metadata = Some(serde_json::to_value(metadata)?);
        Ok(self)
    }

    /// Transforms the transformer's stored metadata using the provided function.
    ///
    /// The closure receives the current `Option<JsonValue>` and returns the new `Option<JsonValue>`.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// // Construct a transformer and replace or set its metadata
    /// let _ = ResponseTransformer::new(1)
    ///     .map_metadata(|opt| {
    ///         opt.or(Some(json!({"injected": true})))
    ///     });
    /// ```
    pub fn map_metadata<F>(self, transform: F) -> Self
    where
        F: FnOnce(Option<JsonValue>) -> Option<JsonValue>,
    {
        let Self {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        } = self;

        let new_metadata = transform(metadata);

        Self {
            message,
            data,
            status,
            metadata: new_metadata,
            headers,
            allowed_formats,
            strategy,
        }
    }

    /// Appends an HTTP header to the transformer's header list.
    ///
    /// # Examples
    ///
    /// ```
    /// use actix_http::http::header::{HeaderName, HeaderValue};
    ///
    /// let transformer = ResponseTransformer::new(42)
    ///     .insert_header((HeaderName::from_static("x-test"), HeaderValue::from_static("v")));
    /// ```
    pub fn insert_header(mut self, header: (HeaderName, HeaderValue)) -> Self {
        self.headers.push(header);
        self
    }

    /// Attempt to parse and insert an HTTP header from string `name` and `value`.
    ///
    /// On success returns the transformer with the parsed header appended to its header list.
    /// On failure returns a `ResponseTransformError` indicating either an invalid header name or an invalid header value.
    ///
    /// # Examples
    ///
    /// ```
    /// use actix_web::http::header::CONTENT_TYPE;
    /// let t = crate::functional::response_transformers::ResponseTransformer::new(());
    /// let res = t.try_insert_header("X-Custom", "value");
    /// assert!(res.is_ok());
    ///
    /// // Using a known header name constant:
    /// let res2 = t.try_insert_header(CONTENT_TYPE.as_str(), "application/json");
    /// assert!(res2.is_ok());
    /// ```
    pub fn try_insert_header(
        mut self,
        name: &str,
        value: &str,
    ) -> Result<Self, ResponseTransformError> {
        let header_name = HeaderName::from_str(name)?;
        let header_value = HeaderValue::from_str(value)?;
        self.headers.push((header_name, header_value));
        Ok(self)
    }

    /// Add a response format to the transformer's allowed formats if it is not already present.
    ///
    /// Returns a new transformer with the given `format` included in `allowed_formats`.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::response_transformers::{ResponseTransformer, ResponseFormat};
    ///
    /// let transformer = ResponseTransformer::new(())
    ///     .allow_format(ResponseFormat::Text);
    ///
    /// // `transformer` now permits `Text` in content negotiation.
    /// ```
    pub fn allow_format(mut self, format: ResponseFormat) -> Self {
        if !self.allowed_formats.contains(&format) {
            self.allowed_formats.push(format);
        }
        self
    }

    /// Prefer pretty-printed JSON when negotiating the response format.
    ///
    /// Moves `ResponseFormat::JsonPretty` to the front of the transformer's allowed formats so
    /// it will be selected before other formats during content negotiation.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crate::functional::response_transformers::{ResponseTransformer};
    /// #[test]
    /// fn prefer_pretty_shifts_priority() {
    ///     let _ = ResponseTransformer::new(vec![1, 2, 3]).prefer_pretty_json();
    /// }
    /// ```
    pub fn prefer_pretty_json(mut self) -> Self {
        if let Some(pos) = self
            .allowed_formats
            .iter()
            .position(|format| *format == ResponseFormat::JsonPretty)
        {
            self.allowed_formats.remove(pos);
        }
        self.allowed_formats.insert(0, ResponseFormat::JsonPretty);
        self
    }

    /// Force the response format to a specific `ResponseFormat` and ensure that format is allowed.
    ///
    /// This sets the transformer's strategy to `Forced(format)` so negotiation is bypassed,
    /// and adds `format` to the allowed formats if it is not already present.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::response_transformers::{ResponseTransformer, ResponseFormat};
    ///
    /// let _t: ResponseTransformer<Vec<i32>> = ResponseTransformer::new(vec![1, 2])
    ///     .force_format(ResponseFormat::JsonPretty);
    /// ```
    pub fn force_format(mut self, format: ResponseFormat) -> Self {
        self.strategy = FormatStrategy::Forced(format);
        self.allow_format(format)
    }

    /// Transforms the transformer's payload data with the provided function, returning a new transformer with the resulting data type.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::borrow::Cow;
    /// # use actix_web::http::StatusCode;
    /// # use your_crate::functional::response_transformers::ResponseTransformer;
    /// let original = ResponseTransformer::new(5);
    /// let transformed = original.map_data(|n| n * 2);
    /// // transformed now carries payload `10`
    /// assert_eq!(transformed.data, 10);
    /// ```
    pub fn map_data<U, F>(self, transform: F) -> ResponseTransformer<U>
    where
        F: FnOnce(T) -> U,
    {
        let Self {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        } = self;

        ResponseTransformer {
            message,
            data: transform(data),
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        }
    }

    /// Create a new transformer with metadata transformed by a fallible function.
    ///
    /// The provided `transform` is called with the current `Option<serde_json::Value>`
    /// and may return `Ok(Some(u))`, `Ok(None)`, or an `Err(serde_json::Error)`.
    /// When `Ok(Some(u))` is returned, `u` is serialized to JSON and stored as the
    /// transformer's metadata; `Ok(None)` clears the metadata.
    ///
    /// # Parameters
    ///
    /// - `transform`: Function that receives the current metadata and returns an optional
    ///   new metadata value or a `serde_json::Error` on failure. The output type `U` must
    ///   implement `Serialize`.
    ///
    /// # Returns
    ///
    /// `Ok(ResponseTransformer<T>)` with the same message, data, status, headers,
    /// allowed formats, and strategy, but with metadata replaced by the transformed
    /// and serialized value; `Err(ResponseTransformError)` if the transform or
    /// serialization fails.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde::Serialize;
    /// use serde_json::json;
    ///
    /// #[derive(Serialize)]
    /// struct Payload { value: i32 }
    ///
    /// let t = crate::ResponseTransformer::new(Payload { value: 1 })
    ///     .try_with_metadata(json!({"a": 1})).unwrap()
    ///     .try_map_metadata(|meta| {
    ///         // append a field if metadata exists
    ///         let mut m = meta.unwrap_or_default();
    ///         if m.is_object() {
    ///             m.as_object_mut().unwrap().insert("b".to_string(), json!(2));
    ///             Ok(Some(m))
    ///         } else {
    ///             Ok(Some(json!({"b": 2})))
    ///         }
    ///     }).unwrap();
    ///
    /// // resulting transformer has metadata including both "a" and "b"
    /// let envelope_metadata = t.map_metadata(|m| m).metadata;
    /// assert!(envelope_metadata.is_some());
    /// ```
    pub fn try_map_metadata<U, F>(
        self,
        transform: F,
    ) -> Result<ResponseTransformer<T>, ResponseTransformError>
    where
        F: FnOnce(Option<JsonValue>) -> Result<Option<U>, serde_json::Error>,
        U: Serialize,
    {
        let Self {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        } = self;

        let metadata = transform(metadata)?.map(serde_json::to_value).transpose()?;

        Ok(ResponseTransformer {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        })
    }

    /// Applies a user-provided transformation to the current response envelope and returns a new transformer
    /// built from the transformed envelope.
    ///
    /// The provided closure receives a `ResponseEnvelope<T>` containing the current `message`, `data`,
    /// and `metadata`. The returned `ResponseTransformer<U>` uses the envelope returned by the closure
    /// for its `message`, `data`, and `metadata`, while preserving the original transformer's
    /// `status`, `headers`, `allowed_formats`, and formatting `strategy`.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::borrow::Cow;
    /// use serde::Serialize;
    ///
    /// #[derive(Serialize)]
    /// struct Payload { value: i32 }
    ///
    /// // Assume ResponseTransformer and ResponseEnvelope are in scope
    /// let original = ResponseTransformer::new(Payload { value: 1 })
    ///     .with_message("original");
    ///
    /// let composed = original.compose(|env| ResponseEnvelope {
    ///     message: format!("updated: {}", env.message),
    ///     data: Payload { value: env.data.value + 1 },
    ///     metadata: env.metadata,
    /// });
    ///
    /// // The composed transformer carries the transformed message and data.
    /// ```
    pub fn compose<U, F>(self, transform: F) -> ResponseTransformer<U>
    where
        F: FnOnce(ResponseEnvelope<T>) -> ResponseEnvelope<U>,
        U: Serialize,
        T: Serialize,
    {
        let Self {
            message,
            data,
            status,
            metadata,
            headers,
            allowed_formats,
            strategy,
        } = self;

        let envelope = ResponseEnvelope {
            message: message.into_owned(),
            data,
            metadata,
        };
        let next = transform(envelope);

        ResponseTransformer {
            message: Cow::Owned(next.message),
            data: next.data,
            status,
            metadata: next.metadata,
            headers,
            allowed_formats,
            strategy,
        }
    }

    /// Selects the response format to use based on the transformer's strategy, the request, and allowed formats.
    ///
    /// If the transformer's strategy is `Forced`, the forced format is returned. When the strategy is `Auto`,
    /// the function attempts content negotiation using the request's `Accept` header; if that yields no result,
    /// a query-string pretty-print override (e.g., `?pretty=1` or `?pretty=true`) will select `JsonPretty` when allowed;
    /// otherwise the first format in `allowed_formats` is returned, defaulting to `Json` when none are configured.
    ///
    /// # Examples
    ///
    /// ```
    /// use actix_web::test::TestRequest;
    /// use actix_web::http::header::CONTENT_TYPE;
    /// use your_crate::functional::response_transformers::{ResponseTransformer, ResponseFormat};
    ///
    /// let req = TestRequest::default().to_http_request();
    /// let tx = ResponseTransformer::new(vec![1, 2, 3]).force_format(ResponseFormat::Text);
    /// let resp = tx.respond_to(&req);
    /// assert_eq!(resp.status().as_u16(), 200);
    /// assert_eq!(resp.headers().get(CONTENT_TYPE).unwrap().to_str().unwrap(), "text/plain");
    /// ```
    fn resolve_format(&self, req: &HttpRequest) -> ResponseFormat {
        match self.strategy {
            FormatStrategy::Forced(format) => format,
            FormatStrategy::Auto => {
                if let Some(format) = negotiated_format(req, &self.allowed_formats) {
                    return format;
                }

                // Query parameter based overrides (e.g. ?pretty=1).
                if prefers_pretty_json(req)
                    && self.allowed_formats.contains(&ResponseFormat::JsonPretty)
                {
                    return ResponseFormat::JsonPretty;
                }

                self.allowed_formats
                    .first()
                    .copied()
                    .unwrap_or(ResponseFormat::Json)
            }
        }
    }
}

impl<T> Responder for ResponseTransformer<T>
where
    T: Serialize,
{
    type Body = BoxBody;

    /// Creates an `HttpResponse` from the transformer by resolving the response format,
    /// applying stored status and headers, and serializing the envelope (message, data, metadata).
    ///
    /// If serialization succeeds, returns the composed response with the negotiated or forced
    /// content type and body. If serialization fails, returns a 500 Internal Server Error
    /// response containing an error envelope describing the serialization failure.
    ///
    /// # Examples
    ///
    /// ```
    /// // Illustrative example — actual types live in the containing crate.
    /// use actix_web::HttpRequest;
    ///
    /// // let req = HttpRequest::default(); // obtain a request in real usage
    /// // let transformer = ResponseTransformer::new(vec![1, 2, 3]);
    /// // let resp = transformer.respond_to(&req);
    /// // assert_eq!(resp.status(), actix_web::http::StatusCode::OK);
    /// ```
    fn respond_to(self, req: &HttpRequest) -> HttpResponse<Self::Body> {
        let format = self.resolve_format(req);
        let mut builder = HttpResponse::build(self.status);

        for (name, value) in self.headers {
            builder.insert_header((name, value));
        }

        let envelope = ResponseEnvelope {
            message: self.message.into_owned(),
            data: self.data,
            metadata: self.metadata,
        };

        match render_response(builder, envelope, format) {
            Ok(response) => response,
            Err(err) => serialization_error(err),
        }
    }
}

/// Serialize a `ResponseEnvelope` and build an `HttpResponse` with the appropriate body and `Content-Type` according to `ResponseFormat`.
///
/// # Returns
///
/// An `HttpResponse` whose body contains the serialized envelope and whose `Content-Type` matches the chosen format, or a `serde_json::Error` if serialization fails.
///
/// # Examples
///
/// ```
/// use actix_web::http::StatusCode;
/// use actix_web::HttpResponse;
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct Payload { value: i32 }
///
/// let envelope = crate::functional::response_transformers::ResponseEnvelope {
///     message: "ok".to_string(),
///     data: Payload { value: 1 },
///     metadata: None,
/// };
///
/// let builder = HttpResponse::build(StatusCode::OK);
/// let resp = crate::functional::response_transformers::render_response(
///     builder,
///     envelope,
///     crate::functional::response_transformers::ResponseFormat::Json,
/// ).unwrap();
///
/// assert_eq!(resp.status(), StatusCode::OK);
/// ```
fn render_response<T>(
    mut builder: HttpResponseBuilder,
    envelope: ResponseEnvelope<T>,
    format: ResponseFormat,
) -> Result<HttpResponse, serde_json::Error>
where
    T: Serialize,
{
    match format {
        ResponseFormat::Json => {
            let payload = serde_json::to_vec(&envelope)?;
            builder.insert_header(header::ContentType::json());
            Ok(builder.body(payload))
        }
        ResponseFormat::JsonPretty => {
            let payload = serde_json::to_string_pretty(&envelope)?;
            builder.insert_header(header::ContentType::json());
            Ok(builder.body(payload))
        }
        ResponseFormat::Text => {
            let payload = serde_json::to_string_pretty(&envelope)?;
            builder.insert_header(header::ContentType::plaintext());
            Ok(builder.body(payload))
        }
    }
}

/// Constructs a 500 Internal Server Error response with a generic internal message and the given serialization error.
///
/// The response body is JSON containing the module's internal error message and an `"error"` field with `err.to_string()`.
///
/// # Parameters
///
/// - `err`: the serialization error to include in the response body.
///
/// # Returns
///
/// An `HttpResponse` with status 500 and a JSON body containing the internal message and the error string.
///
/// # Examples
///
/// ```no_run
/// let err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
/// let resp = serialization_error(err);
/// assert_eq!(resp.status(), actix_web::http::StatusCode::INTERNAL_SERVER_ERROR);
/// ```
fn serialization_error(err: serde_json::Error) -> HttpResponse {
    let body = ResponseBody::new(
        constants::MESSAGE_INTERNAL_SERVER_ERROR,
        json!({ "error": err.to_string() }),
    );
    HttpResponse::InternalServerError().json(body)
}

/// Determines the first response format from the request's Accept header that is allowed.
///
/// Checks each token in the `Accept` header in order and returns the first matching
/// `ResponseFormat` that appears in `allowed`. Recognizes wildcards `*/*` (selects the
/// first allowed format) and `application/*` (maps to `Json` if allowed).
///
/// # Returns
///
/// `Some(ResponseFormat)` if a compatible format is found, `None` otherwise.
///
/// # Examples
///
/// ```
/// use actix_web::http::header;
/// use actix_web::test::TestRequest;
/// // assume ResponseFormat is in scope
///
/// let req = TestRequest::default()
///     .insert_header((header::ACCEPT, "text/plain, application/json"))
///     .to_http_request();
///
/// let allowed = vec![ResponseFormat::Json, ResponseFormat::Text];
/// let found = negotiated_format(&req, &allowed);
/// assert_eq!(found, Some(ResponseFormat::Text));
/// ```
fn negotiated_format(req: &HttpRequest, allowed: &[ResponseFormat]) -> Option<ResponseFormat> {
    let accepts = req
        .headers()
        .get_all(header::ACCEPT)
        .into_iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|line| line.split(','))
        .map(|token| token.trim())
        .collect::<Vec<_>>();

    for token in accepts {
        let format = parse_accept_token(token);
        if let Some(format) = format {
            if allowed.contains(&format) {
                return Some(format);
            }
        } else if token == "*/*" {
            return allowed.first().copied();
        } else if token == "application/*" {
            if allowed.contains(&ResponseFormat::Json) {
                return Some(ResponseFormat::Json);
            }
        }
    }

    None
}

/// Parses a single Accept header token and maps it to a supported response format.
///
/// Recognizes tokens that indicate JSON (returns `Json`), pretty-printed JSON (returns `JsonPretty` when the token also indicates `pretty`), and `text/plain` (returns `Text`). Returns `None` for unrecognized tokens.
///
/// # Examples
///
/// ```
/// use crate::functional::response_transformers::ResponseFormat;
///
/// assert_eq!(crate::functional::response_transformers::parse_accept_token("application/json"), Some(ResponseFormat::Json));
/// assert_eq!(crate::functional::response_transformers::parse_accept_token("application/json; pretty"), Some(ResponseFormat::JsonPretty));
/// assert_eq!(crate::functional::response_transformers::parse_accept_token("text/plain"), Some(ResponseFormat::Text));
/// assert_eq!(crate::functional::response_transformers::parse_accept_token("application/xml"), None);
/// ```
fn parse_accept_token(token: &str) -> Option<ResponseFormat> {
    let token = token.to_ascii_lowercase();
    if token.contains("json") {
        if token.contains("pretty") {
            Some(ResponseFormat::JsonPretty)
        } else {
            Some(ResponseFormat::Json)
        }
    } else if token.contains("text/plain") {
        Some(ResponseFormat::Text)
    } else {
        None
    }
}

/// Determines whether the HTTP request's query string indicates a preference for pretty-printed JSON.
///
/// This checks for either `pretty=1` or `pretty=true`, or `format=pretty` (case-insensitive) in the request's query string.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
/// // ?pretty=true
/// let req = TestRequest::with_uri("/resource?pretty=true").to_http_request();
/// assert!(crate::functional::response_transformers::prefers_pretty_json(&req));
///
/// // ?format=pretty
/// let req = TestRequest::with_uri("/resource?format=pretty").to_http_request();
/// assert!(crate::functional::response_transformers::prefers_pretty_json(&req));
///
/// // unrelated or absent parameter
/// let req = TestRequest::with_uri("/resource?other=1").to_http_request();
/// assert!(!crate::functional::response_transformers::prefers_pretty_json(&req));
/// ```
fn prefers_pretty_json(req: &HttpRequest) -> bool {
    let query = req.query_string();
    query
        .split('&')
        .filter(|segment| !segment.is_empty())
        .any(|segment| match segment.split_once('=') {
            Some((name, value)) => {
                let name = name.to_ascii_lowercase();
                let value = value.to_ascii_lowercase();
                (name == "pretty" && (value == "1" || value == "true"))
                    || (name == "format" && value == "pretty")
            }
            None => false,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::header::{ACCEPT, CONTENT_TYPE};
    use actix_web::http::StatusCode;
    use actix_web::test::TestRequest;

    #[actix_rt::test]
    async fn default_response_serializes_to_json() {
        let request = TestRequest::default().insert_header((ACCEPT, "application/json"));
        let response = ResponseTransformer::new(vec![1, 2, 3])
            .with_message("numbers")
            .respond_to(&request.to_http_request());

        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert_eq!(
            content_type.to_str().unwrap(),
            header::ContentType::json().to_string()
        );

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq!(payload["message"], "numbers");
        assert_eq!(payload["data"], json!([1, 2, 3]));
    }

    #[actix_rt::test]
    async fn map_data_transforms_payload() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(vec![1, 2, 3])
            .map_data(|data| data.into_iter().map(|item| item * 10).collect::<Vec<_>>())
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["data"], json!([10, 20, 30]));
    }

    #[actix_rt::test]
    async fn negotiate_plain_text_format() {
        let request = TestRequest::default().insert_header((ACCEPT, "text/plain"));
        let response = ResponseTransformer::new(json!({ "value": 42 }))
            .allow_format(ResponseFormat::Text)
            .respond_to(&request.to_http_request());

        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert_eq!(
            content_type.to_str().unwrap(),
            header::ContentType::plaintext().to_string()
        );

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload = String::from_utf8(body.to_vec()).unwrap();
        assert!(payload.contains("\"value\": 42"));
    }

    /// Verifies that the `pretty=true` query parameter causes the transformer to produce pretty-printed JSON.
    ///
    /// This test constructs a request with `?pretty=true`, enables pretty JSON preference on the
    /// transformer, and asserts that the serialized response contains a newline (indicating pretty printing).
    ///
    /// # Examples
    ///
    /// ```
    /// use actix_web::test::TestRequest;
    /// use actix_web::body;
    /// use serde_json::json;
    /// // build a request that requests pretty output via query string
    /// let request = TestRequest::with_uri("/resource?pretty=true");
    /// let response = ResponseTransformer::new(json!({ "foo": "bar" }))
    ///     .prefer_pretty_json()
    ///     .respond_to(&request.to_http_request());
    ///
    /// let body = actix_web::body::to_bytes(response.into_body()).await.unwrap();
    /// let payload = String::from_utf8(body.to_vec()).unwrap();
    /// assert!(payload.contains("\n"));
    /// ```
    #[actix_rt::test]
    async fn query_string_pretty_print() {
        let request = TestRequest::with_uri("/resource?pretty=true");
        let response = ResponseTransformer::new(json!({ "foo": "bar" }))
            .prefer_pretty_json()
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload = String::from_utf8(body.to_vec()).unwrap();
        assert!(payload.contains("\n"));
    }
}