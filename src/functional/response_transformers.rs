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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FormatStrategy {
    Auto,
    Forced(ResponseFormat),

/// Errors that can occur while composing responses.
#[derive(Debug, Error)]
pub enum ResponseTransformError {
    #[error("metadata serialization failed: {0}")]
    MetadataSerialization(#[from] serde_json::Error),
    #[error("invalid header name: {0}")]
    InvalidHeaderName(#[from] InvalidHeaderName),
    #[error("invalid header value: {0}")]
    InvalidHeaderValue(#[from] InvalidHeaderValue),

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

impl<T> ResponseTransformer<T> {
    /// Creates a new transformer with the provided payload and default
    /// configuration (HTTP 200 + JSON response).
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

    /// Sets the human-readable message for the response envelope.
    pub fn with_message(mut self, message: impl Into<Cow<'static, str>>) -> Self {
        self.message = message.into();
        self
    }

    /// Applies a transformation to the current message, enabling
    /// functional composition over textual descriptors.
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

    /// Changes the HTTP status for the generated response.
    pub fn with_status(mut self, status: StatusCode) -> Self {
        self.status = status;
        self
    }

    /// Adds or replaces metadata with a pre-serialized JSON value.
    pub fn with_metadata_value(mut self, metadata: JsonValue) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Serializes metadata using Serde and stores it in the response
    /// envelope.
    pub fn try_with_metadata<M>(mut self, metadata: M) -> Result<Self, ResponseTransformError>
    where
        M: Serialize,
    {
        self.metadata = Some(serde_json::to_value(metadata)?);
        Ok(self)
    }

    /// Applies a transformation over the metadata field.
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

    /// Adds an HTTP header to the response.
    pub fn insert_header(mut self, header: (HeaderName, HeaderValue)) -> Self {
        self.headers.push(header);
        self
    }

    /// Convenience helper for inserting headers from string values.
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

    /// Enables an additional response format for content negotiation.
    pub fn allow_format(mut self, format: ResponseFormat) -> Self {
        if !self.allowed_formats.contains(&format) {
            self.allowed_formats.push(format);
        }
        self
    }

    /// Prefers pretty JSON output during negotiation (or when the
    /// client requests it explicitly).
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

    /// Forces a specific format, bypassing negotiation.
    pub fn force_format(mut self, format: ResponseFormat) -> Self {
        self.strategy = FormatStrategy::Forced(format);
        self.allow_format(format)
    }

    /// Functional transformation over the underlying payload.
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

    /// Maps the metadata component using a fallible function that can
    /// produce serializable metadata.
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

    /// General-purpose composition hook that hands the current envelope
    /// to a user-defined transformation and returns a new transformer
    /// built from the output.
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

impl<T> Responder for ResponseTransformer<T>
where
    T: Serialize,
{
    type Body = BoxBody;

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

fn serialization_error(err: serde_json::Error) -> HttpResponse {
    let body = ResponseBody::new(
        constants::MESSAGE_INTERNAL_SERVER_ERROR,
        json!({ "error": err.to_string() }),
    );
    HttpResponse::InternalServerError().json(body)

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

    #[actix_rt::test]
    async fn response_with_custom_status() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new("data")
            .with_status(StatusCode::CREATED)
            .respond_to(&request.to_http_request());

        assert_eq\!(response.status(), StatusCode::CREATED);
    }

    #[actix_rt::test]
    async fn response_with_metadata() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(vec\![1, 2, 3])
            .try_with_metadata(json\!({"count": 3}))
            .unwrap()
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert\!(payload["metadata"].is_object());
        assert_eq\!(payload["metadata"]["count"], 3);
    }

    #[actix_rt::test]
    async fn response_with_metadata_value() {
        let request = TestRequest::default();
        let metadata = json\!({"version": "1.0", "source": "test"});
        let response = ResponseTransformer::new("ok")
            .with_metadata_value(metadata)
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["metadata"]["version"], "1.0");
        assert_eq\!(payload["metadata"]["source"], "test");
    }

    #[actix_rt::test]
    async fn response_map_message() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(42)
            .with_message("original")
            .map_message(|msg| format\!("{}\!", msg).into())
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["message"], "original\!");
    }

    #[actix_rt::test]
    async fn response_map_metadata() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(1)
            .with_metadata_value(json\!({"count": 5}))
            .map_metadata(|meta| {
                meta.map(|m| {
                    let mut obj = m.as_object().unwrap().clone();
                    obj.insert("doubled".to_string(), json\!(10));
                    json\!(obj)
                })
            })
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["metadata"]["count"], 5);
        assert_eq\!(payload["metadata"]["doubled"], 10);
    }

    #[actix_rt::test]
    async fn response_insert_custom_header() {
        let request = TestRequest::default();
        let header_name = HeaderName::from_static("x-custom");
        let header_value = HeaderValue::from_static("test-value");
        
        let response = ResponseTransformer::new("data")
            .insert_header((header_name.clone(), header_value))
            .respond_to(&request.to_http_request());

        assert\!(response.headers().contains_key(&header_name));
        assert_eq\!(
            response.headers().get(&header_name).unwrap().to_str().unwrap(),
            "test-value"
        );
    }

    #[actix_rt::test]
    async fn response_try_insert_header_valid() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new("data")
            .try_insert_header("x-request-id", "12345")
            .unwrap()
            .respond_to(&request.to_http_request());

        let header = response.headers().get("x-request-id");
        assert\!(header.is_some());
        assert_eq\!(header.unwrap().to_str().unwrap(), "12345");
    }

    #[test]
    fn response_try_insert_header_invalid_name() {
        let result = ResponseTransformer::new("data")
            .try_insert_header("invalid header\!", "value");

        assert\!(result.is_err());
    }

    #[actix_rt::test]
    async fn response_force_format_json_pretty() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "text/plain"));
        
        let response = ResponseTransformer::new(vec\![1, 2, 3])
            .force_format(ResponseFormat::JsonPretty)
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        
        // Pretty JSON should contain newlines
        assert\!(body_str.contains('\n'));
    }

    #[actix_rt::test]
    async fn response_force_format_text() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "application/json"));
        
        let response = ResponseTransformer::new(json\!({"key": "value"}))
            .force_format(ResponseFormat::Text)
            .respond_to(&request.to_http_request());

        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert_eq\!(
            content_type.to_str().unwrap(),
            header::ContentType::plaintext().to_string()
        );
    }

    #[actix_rt::test]
    async fn response_prefer_pretty_json() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(vec\![1, 2])
            .prefer_pretty_json()
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        
        assert\!(body_str.contains('\n'));
    }

    #[actix_rt::test]
    async fn response_compose_transformation() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(vec\![1, 2, 3])
            .with_message("numbers")
            .compose(|envelope| {
                let sum: i32 = envelope.data.iter().sum();
                ResponseEnvelope {
                    message: format\!("{} (sum={})", envelope.message, sum),
                    data: sum,
                    metadata: envelope.metadata,
                }
            })
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["message"], "numbers (sum=6)");
        assert_eq\!(payload["data"], 6);
    }

    #[actix_rt::test]
    async fn response_chained_transformations() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(10)
            .with_message("start")
            .map_data(|x| x * 2)
            .map_data(|x| x + 5)
            .map_message(|msg| format\!("{}\!", msg).into())
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["data"], 25); // (10 * 2) + 5
        assert_eq\!(payload["message"], "start\!");
    }

    #[actix_rt::test]
    async fn negotiate_format_with_wildcard() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "*/*"));
        
        let response = ResponseTransformer::new("data")
            .respond_to(&request.to_http_request());

        assert_eq\!(response.status(), StatusCode::OK);
    }

    #[actix_rt::test]
    async fn negotiate_format_with_application_wildcard() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "application/*"));
        
        let response = ResponseTransformer::new("data")
            .respond_to(&request.to_http_request());

        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert\!(content_type.to_str().unwrap().contains("json"));
    }

    #[actix_rt::test]
    async fn negotiate_format_multiple_accepts() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "text/html, application/json, */*"));
        
        let response = ResponseTransformer::new("data")
            .respond_to(&request.to_http_request());

        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert\!(content_type.to_str().unwrap().contains("json"));
    }

    #[actix_rt::test]
    async fn query_string_format_parameter() {
        let request = TestRequest::with_uri("/api/data?format=pretty");
        let response = ResponseTransformer::new(json\!({"test": "value"}))
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        
        assert\!(body_str.contains('\n'));
    }

    #[actix_rt::test]
    async fn response_with_error_status() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new("error details")
            .with_status(StatusCode::BAD_REQUEST)
            .with_message("Validation failed")
            .respond_to(&request.to_http_request());

        assert_eq\!(response.status(), StatusCode::BAD_REQUEST);

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["message"], "Validation failed");
    }

    #[actix_rt::test]
    async fn response_empty_data() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(())
            .with_message("empty response")
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["message"], "empty response");
        assert_eq\!(payload["data"], json\!(null));
    }

    #[test]
    fn response_format_enum_equality() {
        assert_eq\!(ResponseFormat::Json, ResponseFormat::Json);
        assert_ne\!(ResponseFormat::Json, ResponseFormat::JsonPretty);
        assert_ne\!(ResponseFormat::Json, ResponseFormat::Text);
    }

    #[actix_rt::test]
    async fn allow_format_adds_capability() {
        let request = TestRequest::default()
            .insert_header((ACCEPT, "text/plain"));
        
        let response = ResponseTransformer::new("test")
            .allow_format(ResponseFormat::Text)
            .respond_to(&request.to_http_request());

        let content_type = response.headers().get(CONTENT_TYPE).unwrap();
        assert_eq\!(
            content_type.to_str().unwrap(),
            header::ContentType::plaintext().to_string()
        );
    }

    #[actix_rt::test]
    async fn try_map_metadata_success() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(1)
            .with_metadata_value(json\!({"value": 10}))
            .try_map_metadata(|meta| {
                Ok(meta.map(|m| {
                    json\!({"transformed": true, "original": m})
                }))
            })
            .unwrap()
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["metadata"]["transformed"], true);
        assert\!(payload["metadata"]["original"].is_object());
    }

    #[test]
    fn try_map_metadata_error() {
        let result = ResponseTransformer::new(1)
            .with_metadata_value(json\!({"value": 10}))
            .try_map_metadata(|_| {
                Err(serde_json::Error::custom("transformation failed"))
            });

        assert\!(result.is_err());
    }

    #[actix_rt::test]
    async fn complex_transformation_pipeline() {
        let request = TestRequest::default();
        let response = ResponseTransformer::new(vec\![1, 2, 3, 4, 5])
            .with_message("numbers")
            .with_status(StatusCode::OK)
            .map_data(|nums| nums.into_iter().filter(|&x| x % 2 == 0).collect::<Vec<_>>())
            .map_data(|nums: Vec<i32>| nums.into_iter().map(|x| x * 10).collect::<Vec<_>>())
            .try_with_metadata(json\!({"filtered": true, "multiplied": 10}))
            .unwrap()
            .map_message(|msg| format\!("{} - processed", msg).into())
            .respond_to(&request.to_http_request());

        let body = body::to_bytes(response.into_body()).await.unwrap();
        let payload: JsonValue = serde_json::from_slice(&body).unwrap();

        assert_eq\!(payload["data"], json\!([20, 40]));
        assert_eq\!(payload["message"], "numbers - processed");
        assert_eq\!(payload["metadata"]["filtered"], true);
    }
}