use actix_web::http::header::HeaderValue;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    config::db::Pool,
    constants,
    error::ServiceError,
    models::{
        user::{LoginDTO, LoginInfoDTO, User, UserDTO},
        user_token::UserToken,
    },
    utils::token_utils,
};
#[derive(Serialize, Deserialize)]
pub struct TokenBodyResponse {
    pub token: String,
    pub token_type: String,
}

pub fn signup(user: UserDTO, pool: &Pool) -> Result<String, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get database connection: {}", e),
    })?;
    match User::signup(user, &mut conn) {
        Ok(message) => Ok(message),
        Err(message) => Err(ServiceError::BadRequest {
            error_message: message,
        }),
    }
}

pub fn login(login: LoginDTO, pool: &Pool) -> Result<TokenBodyResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get database connection: {}", e),
    })?;
    match User::login(login, &mut conn) {
        Some(logged_user) => {
            match serde_json::from_value(
                json!({ "token": UserToken::generate_token(&logged_user), "token_type": "bearer" }),
            ) {
                Ok(token_res) => {
                    if logged_user.login_session.is_empty() {
                        Err(ServiceError::Unauthorized {
                            error_message: constants::MESSAGE_LOGIN_FAILED.to_string(),
                        })
                    } else {
                        Ok(token_res)
                    }
                }
                Err(_) => Err(ServiceError::InternalServerError {
                    error_message: constants::MESSAGE_INTERNAL_SERVER_ERROR.to_string(),
                }),
            }
        }
        None => Err(ServiceError::Unauthorized {
            error_message: constants::MESSAGE_USER_NOT_FOUND.to_string(),
        }),
    }
}

/// Invalidates the login session associated with the bearer token in the Authorization header.
///
/// Parses and validates a `Bearer` token from `authen_header`, verifies the token against the
/// database via `pool`, and clears the corresponding user's login session on success.
///
/// # Arguments
///
/// * `authen_header` - An HTTP `Authorization` header expected to contain a `Bearer <token>`.
/// * `pool` - Database connection pool used to verify the token and update the user's session.
///
/// # Returns
///
/// `Ok(())` if the user's login session was successfully invalidated; `Err(ServiceError::InternalServerError)`
/// if token parsing/validation, user lookup, or database access fails.
///
/// # Examples
///
/// ```no_run
/// use actix_web::http::header::HeaderValue;
/// // let pool = /* obtain Pool instance */;
/// let header = HeaderValue::from_str("Bearer example.token.value").unwrap();
/// // let result = logout(&header, &pool);
/// ```
pub fn logout(authen_header: &HeaderValue, pool: &Pool) -> Result<(), ServiceError> {
    if let Ok(authen_str) = authen_header.to_str() {
        if token_utils::is_auth_header_valid(authen_header) {
            let token = authen_str[6..authen_str.len()].trim();
            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                if let Ok(username) = token_utils::verify_token(&token_data, pool) {
                    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
                        error_message: format!("Failed to get database connection: {}", e),
                    })?;
                    if let Ok(user) = User::find_user_by_username(&username, &mut conn) {
                        User::logout(user.id, &mut conn);
                        return Ok(());
                    }
                }
            }
        }
    }

    Err(ServiceError::InternalServerError {
        error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
    })
}

/// Refreshes an authentication token found in the provided `Authorization` header and returns a new token response.
///
/// Validates the header and token, confirms the login session is still valid, retrieves the associated login info,
/// and generates a new bearer token. Returns a `ServiceError::Unauthorized` when the header or token is missing/invalid
/// or when the session is not valid; returns `ServiceError::InternalServerError` if token generation cannot be serialized.
///
/// # Examples
///
/// ```no_run
/// use actix_web::http::HeaderValue;
///
/// // `pool` must be an initialized database pool from your application.
/// let header = HeaderValue::from_static("Bearer <existing_token>");
/// let result = crate::services::account_service::refresh(&header, &pool);
/// match result {
///     Ok(token_res) => println!("new token: {}", token_res.token),
///     Err(err) => eprintln!("refresh failed: {:?}", err),
/// }
/// ```
pub fn refresh(
    authen_header: &HeaderValue,
    pool: &Pool,
) -> Result<TokenBodyResponse, ServiceError> {
    if let Ok(authen_str) = authen_header.to_str() {
        if token_utils::is_auth_header_valid(authen_header) {
            let token = authen_str[6..authen_str.len()].trim();
            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                // Validate the token and generate a new one
                if User::is_valid_login_session(&token_data.claims, &mut pool.get().unwrap()) {
                    // Get login info and generate new token
                    match User::find_login_info_by_token(
                        &token_data.claims,
                        &mut pool.get().unwrap(),
                    ) {
                        Ok(login_info) => {
                            match serde_json::from_value(
                                json!({ "token": UserToken::generate_token(&login_info), "token_type": "bearer" }),
                            ) {
                                Ok(token_res) => return Ok(token_res),
                                Err(_) => {
                                    return Err(ServiceError::InternalServerError {
                                        error_message: constants::MESSAGE_INTERNAL_SERVER_ERROR
                                            .to_string(),
                                    })
                                }
                            }
                        }
                        Err(_) => {
                            return Err(ServiceError::Unauthorized {
                                error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                            })
                        }
                    }
                } else {
                    return Err(ServiceError::Unauthorized {
                        error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                    });
                }
            }
        }
    }

    Err(ServiceError::Unauthorized {
        error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
    })
}

/// Retrieves the login information associated with the bearer token from the Authorization header.
///
/// Attempts to validate and decode the bearer token found in `authen_header` and returns the corresponding
/// `LoginInfoDTO` looked up from the provided database pool.
///
/// # Returns
///
/// `Ok(LoginInfoDTO)` when the token is valid and the login record is found, `Err(ServiceError::InternalServerError)` otherwise.
///
/// # Examples
///
/// ```
/// // Example usage (pseudocode):
/// // let header = HeaderValue::from_str("Bearer <token>").unwrap();
/// // let result = me(&header, &pool);
/// ```
pub fn me(authen_header: &HeaderValue, pool: &Pool) -> Result<LoginInfoDTO, ServiceError> {
    if let Ok(authen_str) = authen_header.to_str() {
        if token_utils::is_auth_header_valid(authen_header) {
            let token = authen_str[6..authen_str.len()].trim();
            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                if let Ok(login_info) =
                    User::find_login_info_by_token(&token_data.claims, &mut pool.get().unwrap())
                {
                    return Ok(login_info);
                }
            }
        }
    }

    Err(ServiceError::InternalServerError {
        error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
    })
}