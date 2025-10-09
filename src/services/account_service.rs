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

/// Creates a new user account and returns a string describing the signup result.
///
/// # Returns
///
/// `Ok` with a string describing the signup result, `Err(ServiceError)` on failure.
///
/// # Examples
///
/// ```
/// // Construct a UserDTO and a database pool in your test setup.
/// let user = UserDTO { /* fill required fields */ };
/// let pool = get_test_pool();
///
/// let result = signup(user, &pool);
/// assert!(result.is_ok());
/// ```
pub fn signup(user: UserDTO, pool: &Pool) -> Result<String, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            User::signup(user, &mut conn)
                .map_err(|msg| ServiceError::BadRequest { error_message: msg })
        })
}

/// Authenticates the provided credentials and returns a bearer token response.
///
/// On success, returns a `TokenBodyResponse` containing a generated JWT-like token and the
/// token type `"bearer"`. Returns `ServiceError::Unauthorized` when the user is not found
/// or the user's login session is invalid/empty. Returns `ServiceError::InternalServerError`
/// when a database connection cannot be obtained or when token construction fails.
///
/// # Examples
///
/// ```
/// // Construct credentials and obtain a DB pool appropriate for your application.
/// // let login = LoginDTO { username: "alice".into(), password: "s3cr3t".into() };
/// // let pool = get_db_pool();
/// // let resp = login(login, &pool);
/// // assert!(resp.is_ok());
/// ```
pub fn login(login: LoginDTO, pool: &Pool) -> Result<TokenBodyResponse, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            match User::login(login, &mut conn) {
                Some(login_info) => {
                    Ok(login_info)
                }
                None => {
                    Err(ServiceError::Unauthorized {
                        error_message: constants::MESSAGE_USER_NOT_FOUND.to_string(),
                    })
                }
            }
        })
        .and_then(|logged_user| {
            serde_json::from_value(json!({
                "token": UserToken::generate_token(&logged_user),
                "token_type": "bearer"
            })).map_err(|_| ServiceError::InternalServerError {
                error_message: constants::MESSAGE_INTERNAL_SERVER_ERROR.to_string(),
            }).and_then(|token_res: TokenBodyResponse| {
                if logged_user.login_session.is_empty() {
                    Err(ServiceError::Unauthorized {
                        error_message: constants::MESSAGE_LOGIN_FAILED.to_string(),
                    })
                } else {
                    Ok(token_res)
                }
            })
        })
}

/// Invalidates the session associated with the bearer token provided in the Authorization header.
///
/// Extracts and validates a "Bearer" token from `authen_header`, decodes and verifies it against
/// the database, locates the corresponding user, and clears that user's login session.
///
/// # Examples
///
/// ```
/// use actix_web::http::header::HeaderValue;
/// // `pool` must be a valid database Pool connected to your application's DB.
/// let header = HeaderValue::from_static("Bearer invalid.token.here");
/// let result = logout(&header, &pool);
/// assert!(result.is_err());
/// ```
pub fn logout(authen_header: &HeaderValue, pool: &Pool) -> Result<(), ServiceError> {
    authen_header.to_str()
        .map_err(|_| ServiceError::Unauthorized {
            error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
        })
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                return Err(ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                });
            }

            let token = authen_str[6..authen_str.len()].trim().to_string();
            token_utils::decode_token(token)
                .map_err(|_| ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                })
        })
        .and_then(|token_data| {
            token_utils::verify_token(&token_data, pool)
                .map_err(|_| ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                })
        })
        .and_then(|username| {
            pool.get()
                .map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })
                .and_then(|mut conn| {
                    User::find_user_by_username(&username, &mut conn)
                        .map_err(|_| ServiceError::Unauthorized {
                            error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                        })
                        .map(|user| (user, conn))
                })
        })
        .and_then(|(user, mut conn)| {
            User::logout(user.id, &mut conn);
            Ok(())
        })
}

/// Refreshes an access token using the provided Authorization header.
///
/// Attempts to validate and decode the bearer token from `authen_header`, verifies the associated
/// login session in the database, locates the corresponding login info, and returns a new token
/// packaged as a `TokenBodyResponse`.
///
/// # Returns
///
/// A `TokenBodyResponse` containing a newly generated JWT in `token` and the token type set to
/// `"bearer"`.
///
/// # Examples
///
/// ```no_run
/// use actix_web::http::header::HeaderValue;
/// // let pool: Pool = ...; // obtain your DB pool
/// // let auth_header = HeaderValue::from_str("Bearer <existing_token>").unwrap();
/// // let resp = refresh(&auth_header, &pool).unwrap();
/// // assert_eq!(resp.token_type, "bearer");
/// ```
pub fn refresh(
    authen_header: &HeaderValue,
    pool: &Pool,
) -> Result<TokenBodyResponse, ServiceError> {
    authen_header.to_str()
        .map_err(|_| ServiceError::Unauthorized {
            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
        })
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                return Err(ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                });
            }

            let token = authen_str[6..authen_str.len()].trim().to_string();
            token_utils::decode_token(token)
                .map_err(|_| ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                })
        })
        .and_then(|token_data| {
            pool.get()
                .map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })
                .and_then(|mut conn| {
                    if User::is_valid_login_session(&token_data.claims, &mut conn) {
                        Ok(token_data)
                    } else {
                        Err(ServiceError::Unauthorized {
                            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                        })
                    }
                })
        })
        .and_then(|token_data| {
            pool.get()
                .map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })
                .and_then(|mut conn| {
                    User::find_login_info_by_token(&token_data.claims, &mut conn)
                        .map_err(|_| ServiceError::Unauthorized {
                            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
                        })
                })
        })
        .and_then(|login_info| {
            serde_json::from_value(json!({
                "token": UserToken::generate_token(&login_info),
                "token_type": "bearer"
            })).map_err(|_| ServiceError::InternalServerError {
                error_message: constants::MESSAGE_INTERNAL_SERVER_ERROR.to_string(),
            })
        })
}

/// Returns the LoginInfoDTO associated with the bearer token in the Authorization header.
///
/// Extracts and validates the bearer token from `authen_header`, decodes it, and looks up
/// the corresponding login information in the database using `pool`. On success returns the
/// found `LoginInfoDTO`; on failure returns an appropriate `ServiceError` (for example,
/// `Unauthorized` when the header or token are invalid, or `InternalServerError` when a
/// database connection cannot be obtained).
///
/// # Examples
///
/// ```no_run
/// use actix_web::http::header::HeaderValue;
/// // assume `pool` is a configured database pool and `me` is in scope
/// let auth = HeaderValue::from_static("Bearer <token>");
/// let result = my_module::me(&auth, &pool);
/// match result {
///     Ok(login_info) => println!("username: {}", login_info.username),
///     Err(err) => eprintln!("error: {:?}", err),
/// }
/// ```
pub fn me(authen_header: &HeaderValue, pool: &Pool) -> Result<LoginInfoDTO, ServiceError> {
    authen_header.to_str()
        .map_err(|_| ServiceError::Unauthorized {
            error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
        })
        .and_then(|authen_str| {
            if !token_utils::is_auth_header_valid(authen_header) {
                return Err(ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                });
            }

            let token = authen_str[6..authen_str.len()].trim().to_string();
            token_utils::decode_token(token)
                .map_err(|_| ServiceError::Unauthorized {
                    error_message: constants::MESSAGE_PROCESS_TOKEN_ERROR.to_string(),
                })
        })
        .and_then(|token_data| {
            pool.get()
                .map_err(|e| ServiceError::InternalServerError {
                    error_message: format!("Failed to get database connection: {}", e),
                })
                .and_then(|mut conn| {
                    User::find_login_info_by_token(&token_data.claims, &mut conn)
                })
        })
}