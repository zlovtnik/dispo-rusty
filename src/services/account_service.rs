//! Account Service - User Authentication and Management
//!
//! Provides comprehensive user account operations with advanced functional programming patterns.
//! All operations use iterator-based validation, functional composition, and pure function patterns
//! for enhanced testability, maintainability, and performance.
//!
//! ## Functional Programming Features
//!
//! - **Iterator-based validation**: All input validation uses composable validation chains
//! - **Monadic error handling**: Comprehensive Result/Option chaining for error propagation
//! - **Pure functional composition**: Business logic composed from pure, testable functions
//! - **Immutable data flow**: Token and session operations preserve immutability
//! - **Lazy evaluation**: Database queries defer execution until results are needed

use actix_web::http::header::HeaderValue;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::{
    config::db::Pool,
    constants,
    error::ServiceError,
    models::{
        refresh_token::RefreshToken,
        user::{LoginDTO, LoginInfoDTO, User, UserDTO},
        user_token::UserToken,
    },
    services::functional_patterns::Validator,
    services::functional_service_base::{FunctionalErrorHandling, FunctionalQueryService},
    utils::token_utils,
};

// Email validation regex - pragmatic pattern for production use
static EMAIL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[^@\s]+@[^@\s]+\.[^@\s]+$").expect("Invalid email regex"));

/// Iterator-based validation using functional combinator pattern for UserDTO
fn create_user_validator() -> Validator<UserDTO> {
    Validator::new()
        .rule(|dto: &UserDTO| {
            if dto.username.trim().is_empty() {
                Err(ServiceError::bad_request("Username cannot be empty"))
            } else if dto.username.len() < 3 {
                Err(ServiceError::bad_request(
                    "Username too short (min 3 characters)",
                ))
            } else if dto.username.len() > 50 {
                Err(ServiceError::bad_request(
                    "Username too long (max 50 characters)",
                ))
            } else {
                Ok(())
            }
        })
        .rule(|dto: &UserDTO| {
            let char_count = dto.password.chars().count();
            if char_count < 8 {
                Err(ServiceError::bad_request(
                    "Password too short (min 8 characters)",
                ))
            } else if char_count > 64 {
                Err(ServiceError::bad_request(
                    "Password too long (max 64 characters)",
                ))
            } else if !dto.password.chars().any(|c| c.is_uppercase()) {
                Err(ServiceError::bad_request(
                    "Password must contain at least one uppercase letter",
                ))
            } else if !dto.password.chars().any(|c| c.is_lowercase()) {
                Err(ServiceError::bad_request(
                    "Password must contain at least one lowercase letter",
                ))
            } else if !dto.password.chars().any(|c| c.is_numeric()) {
                Err(ServiceError::bad_request(
                    "Password must contain at least one number",
                ))
            } else {
                Ok(())
            }
        })
        .rule(|dto: &UserDTO| {
            if dto.email.trim().is_empty() {
                Err(ServiceError::bad_request("Email cannot be empty"))
            } else if !EMAIL_REGEX.is_match(&dto.email) {
                Err(ServiceError::bad_request("Invalid email format"))
            } else if dto.email.len() > 255 {
                Err(ServiceError::bad_request(
                    "Email too long (max 255 characters)",
                ))
            } else {
                Ok(())
            }
        })
}

/// Iterator-based validation using functional combinator pattern for LoginDTO
fn create_login_validator() -> Validator<LoginDTO> {
    Validator::new()
        .rule(|dto: &LoginDTO| {
            if dto.username_or_email.trim().is_empty() {
                Err(ServiceError::bad_request(
                    "Username or email cannot be empty",
                ))
            } else if dto.username_or_email.len() > 255 {
                Err(ServiceError::bad_request(
                    "Username or email too long (max 255 characters)",
                ))
            } else {
                Ok(())
            }
        })
        .rule(|dto: &LoginDTO| {
            if dto.password.is_empty() {
                Err(ServiceError::bad_request("Password cannot be empty"))
            } else if dto.password.len() > 128 {
                Err(ServiceError::bad_request(
                    "Password too long (max 128 characters)",
                ))
            } else {
                Ok(())
            }
        })
}

/// Legacy validation for backward compatibility - uses new functional validator
fn validate_user_dto(dto: &UserDTO) -> Result<(), ServiceError> {
    create_user_validator().validate(dto)
}

/// Legacy validation for backward compatibility - uses new functional validator
fn validate_login_dto(dto: &LoginDTO) -> Result<(), ServiceError> {
    create_login_validator().validate(dto)
}

#[derive(Serialize, Deserialize)]
pub struct TokenBodyResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
    pub tenant_id: String,
}

/// Creates a new user account using iterator-based validation and functional pipelines.
///
/// Uses iterator chains for validation and composes database operations through functional pipelines.
///
/// # Returns
/// `Ok(String)` with signup result message on success, `Err(ServiceError)` on failure.
pub fn signup(user: UserDTO, pool: &Pool) -> Result<String, ServiceError> {
    // Use iterator-based validation pipeline
    validate_user_dto(&user)?;

    // Use functional pipeline with validated data
    crate::services::functional_service_base::ServicePipeline::new(pool.clone())
        .with_data(user)
        .execute(|user, conn| {
            User::signup(user, conn).map_err(|msg| ServiceError::bad_request(msg))
        })
        .log_error("signup operation")
}

/// Authenticates credentials using functional composition.
///
/// Validates login credentials, checks session validity, and generates
/// token through chained functional operations.
///
/// # Returns
/// `Ok(TokenBodyResponse)` on successful login, `Err(ServiceError)` on authentication failure.
pub fn login(login: LoginDTO, pool: &Pool) -> Result<TokenBodyResponse, ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    query_service
        .query(|conn| {
            User::login(login, conn).ok_or_else(|| {
                ServiceError::unauthorized(constants::MESSAGE_USER_NOT_FOUND.to_string())
            })
        })
        .and_then(|logged_user| {
            if logged_user.login_session.is_empty() {
                Err(ServiceError::unauthorized(
                    constants::MESSAGE_LOGIN_FAILED.to_string(),
                ))
            } else {
                // Get user by username and create refresh token
                query_service
                    .query(|conn| {
                        User::find_user_by_username(&logged_user.username, conn)
                            .map_err(|_| {
                                ServiceError::internal_server_error(
                                    "Failed to find user".to_string(),
                                )
                            })
                            .and_then(|user| {
                                let access_token = UserToken::generate_token(&logged_user);
                                RefreshToken::create(user.id, conn)
                                    .map_err(|e| {
                                        ServiceError::internal_server_error(format!(
                                            "Failed to create refresh token: {}",
                                            e
                                        ))
                                    })
                                    .map(|refresh_token| (access_token, refresh_token))
                            })
                    })
                    .map(|(access_token, refresh_token)| TokenBodyResponse {
                        access_token,
                        refresh_token,
                        token_type: "bearer".to_string(),
                    })
            }
        })
        .log_error("login operation")
}

/// Invalidates user session using functional token validation pipeline.
///
/// Composes token extraction, validation, user lookup, and logout
/// through chained functional operations.
///
/// # Returns
/// `Ok(())` on successful logout, `Err(ServiceError)` on token or database errors.
pub fn logout(authen_header: &HeaderValue, pool: &Pool) -> Result<(), ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    authen_header
        .to_str()
        .map_err(|_| ServiceError::unauthorized(constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string()))
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                Err(ServiceError::unauthorized(
                    constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                ))
            } else {
                let token = authen_str[6..authen_str.len()].trim().to_string();
                Ok(token)
            }
        })
        .and_then(|token| {
            token_utils::decode_token(token).map_err(|_| {
                ServiceError::unauthorized(constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string())
            })
        })
        .and_then(|token_data| {
            token_utils::verify_token(&token_data, pool).map_err(|_| {
                ServiceError::unauthorized(constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string())
            })
        })
        .and_then(|username| {
            query_service
                .query(|conn| {
                    User::find_user_by_username(&username, conn).map_err(|_| {
                        ServiceError::internal_server_error("Database error".to_string())
                    })
                })
                .map(|user| (user, username))
        })
        .and_then(|(user, _)| {
            query_service.query(|conn| {
                User::logout(user.id, conn);
                Ok(())
            })
        })
        .log_error("logout operation")
}

/// Refreshes access token using functional composition.
///
/// Validates token, checks session validity, and generates new token
/// through chained database operations.
///
/// # Returns
/// `Ok(TokenBodyResponse)` with refreshed token, `Err(ServiceError)` on validation errors.
pub fn refresh(
    authen_header: &HeaderValue,
    pool: &Pool,
) -> Result<TokenBodyResponse, ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    authen_header
        .to_str()
        .map_err(|_| ServiceError::unauthorized(constants::MESSAGE_TOKEN_MISSING.to_string()))
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                Err(ServiceError::unauthorized(
                    constants::MESSAGE_TOKEN_MISSING.to_string(),
                ))
            } else {
                let token = authen_str[6..authen_str.len()].trim().to_string();
                Ok(token)
            }
        })
        .and_then(|token| {
            token_utils::decode_token(token).map_err(|_| {
                ServiceError::unauthorized(constants::MESSAGE_TOKEN_MISSING.to_string())
            })
        })
        .and_then(|token_data| {
            query_service.query(|conn| {
                if User::is_valid_login_session(&token_data.claims, conn) {
                    User::find_login_info_by_token(&token_data.claims, conn).map_err(|_| {
                        ServiceError::unauthorized(constants::MESSAGE_TOKEN_MISSING.to_string())
                    })
                } else {
                    Err(ServiceError::unauthorized(
                        constants::MESSAGE_TOKEN_MISSING.to_string(),
                    ))
                }
            })
        })
        .and_then(|login_info| {
            let access_token = UserToken::generate_token(&login_info);
            Ok(TokenBodyResponse {
                access_token,
                refresh_token: "".to_string(), // Access token refresh doesn't provide new refresh token
                token_type: "bearer".to_string(),
            })
        })
        .log_error("refresh operation")
}

/// Refreshes access token using refresh token.
///
/// Validates refresh token, checks expiry and revocation, then generates
/// new access token and refresh token pair through functional composition.
///
/// # Returns
/// `Ok(TokenBodyResponse)` with new token pair, `Err(ServiceError)` on validation errors.
pub fn refresh_with_token(
    refresh_token: &str,
    tenant_id: &str,
    pool: &Pool,
) -> Result<TokenBodyResponse, ServiceError> {
    println!("DEBUG: refresh_with_token called");
    let query_service = FunctionalQueryService::new(pool.clone());

    // Find and validate refresh token
    query_service
        .query(|conn| {
            RefreshToken::find_by_token(refresh_token, conn)
                .map_err(|_| ServiceError::unauthorized("Invalid refresh token".to_string()))
        })
        .and_then(|refresh_token_record| {
            println!(
                "DEBUG: Found refresh token record: {:?}",
                refresh_token_record
            );
            // Get user info for new token generation
            query_service
                .query(|conn| {
                    User::find_user_by_id(refresh_token_record.user_id, conn).map_err(|_| {
                        ServiceError::internal_server_error("Failed to find user".to_string())
                    })
                })
                .and_then(|user| {
                    // Generate new tokens
                    let access_token = UserToken::generate_token(&LoginInfoDTO {
                        username: user.username.clone(),
                        login_session: user.login_session.clone(),
                        tenant_id: tenant_id.to_string(),
                    });

                    // Revoke old refresh token and create new one
                    query_service
                        .query(|conn| {
                            // Revoke old token
                            RefreshToken::revoke(refresh_token, conn).map_err(|e| {
                                ServiceError::internal_server_error(format!(
                                    "Failed to revoke old token: {}",
                                    e
                                ))
                            })?;

                            // Create new refresh token
                            RefreshToken::create(user.id, conn).map_err(|e| {
                                ServiceError::internal_server_error(format!(
                                    "Failed to create refresh token: {}",
                                    e
                                ))
                            })
                        })
                        .map(|new_refresh_token| TokenBodyResponse {
                            access_token,
                            refresh_token: new_refresh_token,
                            token_type: "bearer".to_string(),
                        })
                })
        })
        .log_error("refresh_with_token operation")
}

/// Returns user info from token using functional pipeline.
///
/// Validates and decodes bearer token, then retrieves user information
/// through functional database query.
///
/// # Returns
/// `Ok(LoginInfoDTO)` on success, `Err(ServiceError)` on token or database errors.
pub fn me(authen_header: &HeaderValue, pool: &Pool) -> Result<LoginInfoDTO, ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    authen_header
        .to_str()
        .map_err(|_| ServiceError::unauthorized(constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string()))
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                Err(ServiceError::unauthorized(
                    constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                ))
            } else {
                let token = authen_str[6..authen_str.len()].trim().to_string();
                Ok(token)
            }
        })
        .and_then(|token| {
            token_utils::decode_token(token).map_err(|_| {
                ServiceError::unauthorized(constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string())
            })
        })
        .and_then(|token_data| {
            query_service.query(|conn| {
                User::find_login_info_by_token(&token_data.claims, conn)
                    .map_err(|_| ServiceError::internal_server_error("Database error".to_string()))
            })
        })
        .log_error("me operation")
}
