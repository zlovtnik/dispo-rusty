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

/// Logs out the user associated with the bearer token found in the Authorization header.
///
/// Attempts to validate, decode, and verify the bearer token from `authen_header`,
/// then locates the corresponding user and clears their login session in the database.
///
/// # Arguments
///
/// * `authen_header` - The Authorization header expected to contain a `Bearer <token>` value.
/// * `pool` - Database connection pool used to look up the user and perform the logout.
///
/// # Returns
///
/// `Ok(())` if the user's session was successfully cleared; `Err(ServiceError::Unauthorized)` if header parsing, token processing, user lookup, or database access fails.
///
/// # Examples
///
/// ```no_run
/// use actix_web::http::HeaderValue;
///
/// let header = HeaderValue::from_static("Bearer <token>");
/// let result = logout(&header, &pool);
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

    Err(ServiceError::Unauthorized {
        error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
    })
}

/// Refreshes an access token extracted from an Authorization header.
///
/// Validates the header and token, verifies the login session is still valid, looks up
/// the login information associated with the token, and returns a newly issued `TokenBodyResponse`.
///
/// Errors:
/// - Returns `ServiceError::Unauthorized` when the header or token is missing or invalid,
///   when the login session is no longer valid, or when login information cannot be found.
/// - Returns `ServiceError::InternalServerError` when a database connection cannot be acquired
///   or when generating/serializing the new token fails.
///
/// # Examples
///
/// ```no_run
/// use reqwest::header::HeaderValue;
/// // let header = HeaderValue::from_str("Bearer <token>").unwrap();
/// // let pool = /* obtain ::deadpool_postgres::Pool */ ;
/// // let token_res = refresh(&header, &pool);
/// ```
pub fn refresh(
    authen_header: &HeaderValue,
    pool: &Pool,
) -> Result<TokenBodyResponse, ServiceError> {
    if let Ok(authen_str) = authen_header.to_str() {
        if token_utils::is_auth_header_valid(authen_header) {
            let token = authen_str[6..authen_str.len()].trim();
            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                // Acquire a single database connection
                let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })?;

                // Validate the token and generate a new one
                if User::is_valid_login_session(&token_data.claims, &mut conn) {
                    // Get login info and generate new token
                    match User::find_login_info_by_token(&token_data.claims, &mut conn) {
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

/// Retrieves the login information associated with the bearer token in the `Authorization` header.
///
/// Attempts to parse and validate a bearer token from `authen_header`, decode its claims,
/// and look up the corresponding `LoginInfoDTO` in the database connection pool. On success,
/// returns the found `LoginInfoDTO`.
///
/// # Errors
///
/// Returns `ServiceError::Unauthorized` with a token-processing message if the header is
/// invalid, the token cannot be decoded, or the login information cannot be retrieved.
///
/// # Examples
///
/// ```
/// use http::HeaderValue;
/// // `pool` should be an initialized `Pool` connected to your database.
/// // let pool: Pool = ...;
/// let header = HeaderValue::from_static("Bearer example_token");
/// let _ = match me(&header, &pool) {
///     Ok(login_info) => { /* use login_info */ },
///     Err(_) => { /* handle error */ },
/// };
/// ```
pub fn me(authen_header: &HeaderValue, pool: &Pool) -> Result<LoginInfoDTO, ServiceError> {
    if let Ok(authen_str) = authen_header.to_str() {
        if token_utils::is_auth_header_valid(authen_header) {
            let token = authen_str[6..authen_str.len()].trim();
            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                // Acquire a single database connection
                let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })?;

                if let Ok(login_info) =
                    User::find_login_info_by_token(&token_data.claims, &mut conn)
                {
                    return Ok(login_info);
                }
            }
        }
    }

    Err(ServiceError::Unauthorized {
        error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
    })
}