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
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            User::signup(user, &mut conn)
                .map_err(|msg| ServiceError::BadRequest { error_message: msg })
        })
}

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
