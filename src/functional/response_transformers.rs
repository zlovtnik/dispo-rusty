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
    /// Create a ResponseTransformer containing the given payload with sensible defaults:
    /// a 200 OK status, a default "OK" message, no metadata, no headers, JSON and pretty-JSON
    /// allowed formats, and automatic content-negotiation strategy.
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

    /// Sets the response envelope's human-readable message and returns the updated transformer.
    ///
    /// # Examples
    ///
    /// ```
    /// let tx = ResponseTransformer::new("payload").with_message("Created");
    /// // `tx` now carries "Created" as the envelope message and can be further configured or returned as a responder.
    /// ```
    pub fn with_message(mut self, message: impl Into<Cow<'static, str>>) -> Self {
        self.message = message.into();
        self
    }

    /// Transforms the transformer’s message using the provided closure.
    ///
    /// The `transform` closure is invoked with the current message and its returned
    /// value becomes the new message on the returned transformer.
    ///
    /// # Examples
    ///
    /// ```
    /// let original = ResponseTransformer::new("payload").with_message("hello");
    /// let updated = original.map_message(|m| {
    ///     let mut s = m.into_owned();
    ///     s.push_str(" world");
    ///     s.into()
    /// });
    /// assert_eq!(updated.message, "hello world");
    /// ```
    ///
    /// Returns the transformer with its message replaced by the transformation result.
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

    /// Set the HTTP status code for the response transformer.
    ///
    /// # Examples
    ///
    /// ```
    /// let transformer = ResponseTransformer::new("payload").with_status(StatusCode::CREATED);
    /// assert_eq!(transformer.status, StatusCode::CREATED);
    /// ```
    pub fn with_status(mut self, status: StatusCode) -> Self {
        self.status = status;
        self
    }

    /// Sets the transformer's metadata to the provided pre-serialized JSON value.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    ///
    /// let transformed = ResponseTransformer::new(42)
    ///     .with_metadata_value(json!({"source": "unit-test"}));
    ///
    /// // method is chainable; `transformed` now carries the given metadata
    /// ```
    pub fn with_metadata_value(mut self, metadata: JsonValue) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Attach serialized metadata to the transformer.
    ///
    /// Serializes `metadata` with Serde and stores the resulting JSON value in the transformer's
    /// metadata field.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde::Serialize;
    /// use functional::response_transformers::ResponseTransformer;
    ///
    /// #[derive(Serialize)]
    /// struct Meta { version: u8 }
    ///
    /// let t = ResponseTransformer::new("data")
    ///     .try_with_metadata(Meta { version: 1 })
    ///     .unwrap();
    /// ```
    ///
    /// # Returns
    ///
    /// `Ok(Self)` with the metadata set if serialization succeeds, `Err(ResponseTransformError::MetadataSerialization)` if serialization fails.
    pub fn try_with_metadata<M>(mut self, metadata: M) -> Result<Self, ResponseTransformError>
    where
        M: Serialize,
    {
        self.metadata = Some(serde_json::to_value(metadata)?);
        Ok(self)
    }

    /// Transforms the stored metadata using the provided function and returns an updated transformer.
    ///
    /// The provided closure receives the current `Option<JsonValue>` metadata and must return the new
    /// `Option<JsonValue>` to store; all other transformer fields are preserved.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    /// // assume ResponseTransformer::new exists and is in scope
    /// let t = ResponseTransformer::new("payload")
    ///     .map_metadata(|_meta| Some(json!({"count": 1})));
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

    /// Appends the given HTTP header to the transformer's header list and returns the updated transformer.
    ///
    /// The header is provided as a `(HeaderName, HeaderValue)` pair and will be included in the final `HttpResponse`
    /// produced by the transformer.
    ///
    /// # Examples
    ///
    /// ```
    /// use actix_web::http::{header::HeaderName, header::HeaderValue};
    /// // Assume `ResponseTransformer::new` is in scope and T = i32 for this example.
    /// let transformed = crate::functional::response_transformers::ResponseTransformer::new(42)
    ///     .insert_header((HeaderName::from_static("x-request-id"), HeaderValue::from_static("abc123")));
    /// ```
    pub fn insert_header(mut self, header: (HeaderName, HeaderValue)) -> Self {
        self.headers.push(header);
        self
    }

    /// Attempts to parse header name and value from strings and insert them into the transformer.
    ///
    /// The provided `name` and `value` are parsed into `HeaderName` and `HeaderValue`. On success
    /// the header pair is appended to the transformer's headers and the updated transformer is returned.
    ///
    /// # Errors
    ///
    /// Returns a `ResponseTransformError::InvalidHeaderName` if `name` is not a valid header name,
    /// or `ResponseTransformError::InvalidHeaderValue` if `value` is not a valid header value.
    ///
    /// # Examples
    ///
    /// ```
    /// # use http::header::{HeaderName, HeaderValue};
    /// # use crate::functional::response_transformers::{ResponseTransformer, ResponseTransformError};
    /// let t = ResponseTransformer::new("payload");
    /// let updated = t.try_insert_header("x-custom", "42").unwrap();
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

    /// Adds the given `ResponseFormat` to the transformer's list of allowed formats for content negotiation.
    ///
    /// If the format is already allowed, the transformer is returned unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// let tx = ResponseTransformer::new(42).allow_format(ResponseFormat::Text);
    /// let tx = tx.allow_format(ResponseFormat::JsonPretty); // chainable
    /// ```
    pub fn allow_format(mut self, format: ResponseFormat) -> Self {
        if !self.allowed_formats.contains(&format) {
            self.allowed_formats.push(format);
        }
        self
    }

    /// Prefer pretty-printed JSON when negotiating the response format.
    ///
    /// Moves `JsonPretty` to the front of the transformer's allowed formats so it will be selected first during content negotiation and returns the updated transformer.
    ///
    /// # Examples
    ///
    /// ```
    /// let transformer = ResponseTransformer::new(42).prefer_pretty_json();
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

    /// Force the response output to a specific format and ensure that format is allowed.
    ///
    /// This sets the transformer's format strategy to `Forced(format)` and adds `format` to the
    /// list of allowed formats if it is not already present.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::response_transformers::{ResponseTransformer, ResponseFormat};
    ///
    /// let transformer = ResponseTransformer::new("payload").force_format(ResponseFormat::Text);
    /// ```
    pub fn force_format(mut self, format: ResponseFormat) -> Self {
        self.strategy = FormatStrategy::Forced(format);
        self.allow_format(format)
    }

    /// Transforms the transformer's payload using the provided function.
    ///
    /// Consumes `self` and returns a new `ResponseTransformer` with the transformed
    /// payload; all other configuration (message, status, metadata, headers,
    /// allowed formats, and strategy) is preserved.
    ///
    /// # Examples
    ///
    /// ```
    /// let t = ResponseTransformer::new(1)
    ///     .with_message("one".into())
    ///     .with_status(actix_web::http::StatusCode::OK);
    ///
    /// let t2 = t.map_data(|n| n + 1);
    /// // payload was transformed from 1 to 2; other fields remain the same.
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

    /// Applies a fallible transformation to the transformer's metadata and, if the
    /// transformation yields a value, serializes and stores it as the new metadata.
    ///
    /// The provided `transform` receives the current metadata (as `Option<JsonValue>`)
    /// and returns `Ok(Some(u))` to replace metadata with `u`, `Ok(None)` to clear
    /// metadata, or an `Err(serde_json::Error)` to signal a serialization/transformation
    /// failure. Any returned `U` is serialized with `serde_json::to_value`.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde::Serialize;
    /// // assume ResponseTransformer::new is in scope
    ///
    /// let transformer = ResponseTransformer::new(42);
    /// let result = transformer.try_map_metadata(|_existing| Ok::<_, serde_json::Error>(Some("meta")));
    /// assert!(result.is_ok());
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

    /// Composes a new transformer by applying a user-provided transformation to the current response envelope.
    ///
    /// The provided function receives the current `ResponseEnvelope<T>` (containing `message`, `data`, and `metadata`)
    /// and must return a `ResponseEnvelope<U>`. The returned envelope's fields become the basis for the new
    /// `ResponseTransformer<U>`, while remaining transformer configuration (status, headers, allowed formats,
    /// and strategy) is preserved.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::borrow::Cow;
    /// # use serde::Serialize;
    /// # use crate::functional::response_transformers::{ResponseTransformer, ResponseEnvelope};
    /// // transform numeric data into a string and update the message
    /// let t = ResponseTransformer::new(42)
    ///     .compose(|env: ResponseEnvelope<i32>| ResponseEnvelope {
    ///         message: format!("value was {}", env.message),
    ///         data: env.data.to_string(),
    ///         metadata: env.metadata,
    ///     });
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

    /// Determine the response format to use for rendering.
    ///
    /// Chooses the format according to the transformer's strategy: if a format is forced it is
    /// returned; otherwise the function negotiates using the request's `Accept` header, then
    /// applies query-parameter pretty-print overrides (e.g., `?pretty=1` or `?format=pretty`),
    /// and finally falls back to the first allowed format or `Json` if none are configured.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Determine the format selected for a request
    /// let chosen = transformer.resolve_format(&req);
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

    /// Convert the configured `ResponseTransformer` into an Actix `HttpResponse`, selecting the output format by negotiating the request and applying any forced preferences.
    ///
    /// The response will use the transformer's configured status and headers, wrap the message, data, and optional metadata into a `ResponseEnvelope`, and serialize the envelope according to the resolved `ResponseFormat`. If serialization fails, an internal server error response containing error details will be returned.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use actix_web::test::TestRequest;
    /// // Create a transformer and produce an HttpResponse using a test request.
    /// let resp = crate::functional::response_transformers::ResponseTransformer::new("payload")
    ///     .respond_to(&TestRequest::default().to_http_request());
    /// assert!(resp.status().is_success());
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

/// Serialize a ResponseEnvelope into an HttpResponse using the specified format.
///
/// The response body is serialized from `envelope` according to `format`:
/// - `Json`: compact JSON bytes with `Content-Type: application/json`.
/// - `JsonPretty`: pretty-printed JSON string with `Content-Type: application/json`.
/// - `Text`: pretty-printed JSON string with `Content-Type: text/plain`.
///
/// # Errors
///
/// Returns a `serde_json::Error` if serializing the envelope fails.
///
/// # Examples
///
/// ```
/// use actix_web::http::StatusCode;
/// // Construct a builder and an example envelope (types from the surrounding module)
/// let builder = actix_web::HttpResponse::build(StatusCode::OK);
/// let envelope = ResponseEnvelope { message: "ok".into(), data: 42, metadata: None };
/// let resp = render_response(builder, envelope, ResponseFormat::Json).unwrap();
/// assert_eq!(resp.status(), StatusCode::OK);
/// assert_eq!(
///     resp.headers().get(actix_web::http::header::CONTENT_TYPE).unwrap().as_bytes(),
///     b"application/json"
/// );
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

/// Creates an HTTP 500 Internal Server Error response whose body is a standardized `ResponseBody` containing
/// the internal error message and a JSON object with the error's string under the `"error"` key.
///
/// # Examples
///
/// ```
/// use serde_json::from_str;
/// use actix_web::http::StatusCode;
///
/// let err = from_str::<serde_json::Value>("not json").unwrap_err();
/// let resp = crate::functional::response_transformers::serialization_error(err);
/// assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
/// ```
fn serialization_error(err: serde_json::Error) -> HttpResponse {
    let body = ResponseBody::new(
        constants::MESSAGE_INTERNAL_SERVER_ERROR,
        json!({ "error": err.to_string() }),
    );
    HttpResponse::InternalServerError().json(body)
}

/// Determines the best response format from the request's `Accept` header that is also allowed.
///
/// Considers `Accept` tokens in order and returns the first token that maps to a supported
/// `ResponseFormat` present in `allowed`. Recognizes the wildcards `*/*` (maps to the first
/// allowed format) and `application/*` (maps to `ResponseFormat::Json` if allowed).
///
/// # Parameters
///
/// - `req`: HTTP request whose `Accept` header is inspected.
/// - `allowed`: Slice of formats that are permitted for the response.
///
/// # Returns
///
/// `Some(ResponseFormat)` with the selected format if a compatible token is found, `None` otherwise.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
/// use crate::functional::response_transformers::{negotiated_format, ResponseFormat};
///
/// let req = TestRequest::default()
///     .insert_header(("Accept", "text/plain"))
///     .to_http_request();
///
/// let allowed = &[ResponseFormat::Json, ResponseFormat::Text];
/// assert_eq!(negotiated_format(&req, allowed), Some(ResponseFormat::Text));
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

/// Maps a single Accept header media-range token to a supported ResponseFormat.
///
/// Returns `Some(ResponseFormat::JsonPretty)` if the token contains both `json` and `pretty`,
/// `Some(ResponseFormat::Json)` if it contains `json` (but not `pretty`),
/// `Some(ResponseFormat::Text)` if it contains `text/plain`, and `None` if the token is unrecognized.
///
/// # Examples
///
/// ```
/// use crate::functional::response_transformers::ResponseFormat;
/// use crate::functional::response_transformers::parse_accept_token;
///
/// assert_eq!(parse_accept_token("application/json"), Some(ResponseFormat::Json));
/// assert_eq!(parse_accept_token("application/json; pretty=true"), Some(ResponseFormat::JsonPretty));
/// assert_eq!(parse_accept_token("text/plain; q=0.8"), Some(ResponseFormat::Text));
/// assert_eq!(parse_accept_token("application/xml"), None);
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

/// Detects whether the incoming request requests pretty-printed JSON via query parameters.
///
/// Checks the request query string for either `pretty=1`, `pretty=true`, or `format=pretty` (case-insensitive).
///
/// # Returns
///
/// `true` if any matching query parameter is present, `false` otherwise.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
/// let req = TestRequest::with_uri("/?pretty=true").to_http_request();
/// assert!(crate::functional::response_transformers::prefers_pretty_json(&req));
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