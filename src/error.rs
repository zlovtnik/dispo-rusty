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
    ///
    /// ```
    /// use actix_web::http::StatusCode;
    /// use crate::error::ServiceError;
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
    /// Builds an HTTP response for this error with a JSON body describing the error.
    ///
    /// The response uses the HTTP status mapped from the error variant and a JSON body produced
    /// by `ResponseBody::new` containing the error's string representation and an empty detail string.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::error::ServiceError;
    /// use actix_web::http::StatusCode;
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