//! Pure functional operations for User model
//!
//! This module contains all database and business logic operations for Users,
//! implemented as pure functions with functional composition patterns.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use diesel::{prelude::*, result::DatabaseErrorKind, result::QueryResult};
use uuid::Uuid;

use crate::{
    config::db::Connection,
    constants,
    error::ServiceError,
    models::{
        login_history::LoginHistory,
        user::{LoginDTO, LoginInfoDTO, User, UserDTO},
        user_token::UserToken,
    },
    schema::users::{self, dsl::*},
};

/// Hash password using Argon2 algorithm - pure function
pub fn hash_password_argon2(plain_password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(plain_password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {}", e))
        .map(|hash| hash.to_string())
}

/// Verify password using hybrid approach: try Argon2 first, fallback to bcrypt
pub fn verify_password_hybrid(stored_hash: &str, provided_password: &str) -> bool {
    let is_bcrypt = stored_hash.starts_with("$2");

    if is_bcrypt {
        // Hash looks like bcrypt, use bcrypt verification
        bcrypt::verify(provided_password, stored_hash).unwrap_or(false)
    } else {
        // Default to Argon2 verification
        PasswordHash::new(stored_hash)
            .map(|parsed_hash| {
                let argon2 = Argon2::default();
                argon2
                    .verify_password(provided_password.as_bytes(), &parsed_hash)
                    .is_ok()
            })
            .unwrap_or(false)
    }
}

/// Generate a new login session UUID
pub fn generate_login_session() -> String {
    Uuid::new_v4().to_string()
}

/// Create and save login session for a user - functional composition
pub fn create_login_session(
    user_name: &str,
    tenant_id: String,
    conn: &mut Connection,
) -> Option<LoginInfoDTO> {
    // Create and save login history
    let login_history = LoginHistory::create(user_name, conn)?;
    if let Err(e) = LoginHistory::save_login_history(login_history, conn) {
        log::error!(
            "Failed to save login history for user '{}': {}",
            user_name,
            e
        );
        return None;
    }

    // Generate session and update database
    let login_session_str = generate_login_session();
    if update_login_session_to_db(user_name, &login_session_str, conn) {
        Some(LoginInfoDTO {
            username: user_name.to_string(),
            login_session: login_session_str,
            tenant_id,
        })
    } else {
        None
    }
}

/// Update login session in database - pure functional operation
pub fn update_login_session_to_db(
    username_str: &str,
    login_session_str: &str,
    conn: &mut Connection,
) -> bool {
    match find_user_by_username(username_str, conn) {
        Ok(user) => diesel::update(users.filter(id.eq(user.id)))
            .set(login_session.eq(login_session_str.to_string()))
            .execute(conn)
            .is_ok(),
        Err(_) => false,
    }
}

/// Signup user - functional composition with error handling
pub fn signup_user(user: UserDTO, conn: &mut Connection) -> Result<String, ServiceError> {
    // Hash password using functional composition
    let password_hash = hash_password_argon2(&user.password)
        .map_err(|_| ServiceError::internal_server_error("Failed to hash password".to_string()))?;

    let user_name = user.username.clone();
    let new_user = UserDTO {
        password: password_hash,
        ..user
    };

    // Insert with functional error handling
    diesel::insert_into(users)
        .values(new_user)
        .execute(conn)
        .map_err(|err| match err {
            diesel::result::Error::DatabaseError(DatabaseErrorKind::UniqueViolation, _) => {
                ServiceError::bad_request(format!("User '{}' is already registered", user_name))
            }
            _ => {
                log::error!("Signup failed: {}", err);
                ServiceError::internal_server_error("Internal server error".to_string())
            }
        })?;

    Ok(constants::MESSAGE_SIGNUP_SUCCESS.to_string())
}

/// Login user - functional composition pipeline
pub fn login_user(login: LoginDTO, conn: &mut Connection) -> Option<LoginInfoDTO> {
    // Functional composition: lookup -> validate -> verify -> create session
    find_user_by_credentials(&login.username_or_email, conn)
        .filter(|user| user.active && !user.password.is_empty())
        .filter(|user| verify_password_hybrid(&user.password, &login.password))
        .and_then(|user| create_login_session(&user.username, login.tenant_id, conn))
}

/// Find user by username or email - pure database query function
pub fn find_user_by_credentials(identifier: &str, conn: &mut Connection) -> Option<User> {
    users
        .filter(username.eq(identifier))
        .or_filter(email.eq(identifier))
        .get_result::<User>(conn)
        .ok()
}

/// Logout user - functional operation
pub fn logout_user(user_id: i32, conn: &mut Connection) {
    if let Ok(user) = find_user_by_id(user_id, conn) {
        let _ = update_login_session_to_db(&user.username, "", conn);
    }
}

/// Check if login session is valid - pure validation function
pub fn is_valid_login_session(user_token: &UserToken, conn: &mut Connection) -> bool {
    users
        .filter(username.eq(&user_token.user))
        .filter(login_session.eq(&user_token.login_session))
        .get_result::<User>(conn)
        .is_ok()
}

/// Find login info by token - functional composition
pub fn find_login_info_by_token(
    user_token: &UserToken,
    conn: &mut Connection,
) -> Result<LoginInfoDTO, ServiceError> {
    let user_result = users
        .filter(username.eq(&user_token.user))
        .filter(login_session.eq(&user_token.login_session))
        .get_result::<User>(conn);

    match user_result {
        Ok(user) => Ok(LoginInfoDTO {
            username: user.username,
            login_session: user.login_session,
            tenant_id: user_token.tenant_id.clone(),
        }),
        Err(diesel::result::Error::NotFound) => Err(ServiceError::not_found("User not found")),
        Err(e) => {
            log::error!("Failed to query user: {}", e);
            Err(ServiceError::internal_server_error(
                "Internal server error".to_string(),
            ))
        }
    }
}

/// Find user by username - pure database query
pub fn find_user_by_username(username_str: &str, conn: &mut Connection) -> QueryResult<User> {
    users
        .filter(username.eq(username_str))
        .get_result::<User>(conn)
}

/// Find user by email - pure database query
pub fn find_user_by_email(email_str: &str, conn: &mut Connection) -> QueryResult<User> {
    users.filter(email.eq(email_str)).get_result::<User>(conn)
}

/// Find user by ID - pure database query
pub fn find_user_by_id(user_id: i32, conn: &mut Connection) -> QueryResult<User> {
    users.filter(id.eq(user_id)).first::<User>(conn)
}

/// Count all users - pure aggregation query
pub fn count_all_users(conn: &mut Connection) -> QueryResult<i64> {
    users.count().get_result(conn)
}

/// Find all users with pagination - pure query with composition
pub fn find_all_users(limit: i64, offset: i64, conn: &mut Connection) -> QueryResult<Vec<User>> {
    users
        .order(id)
        .limit(limit)
        .offset(offset)
        .load::<User>(conn)
}

/// Update user - functional database operation
pub fn update_user(
    user_id: i32,
    updated_user: UserDTO,
    conn: &mut Connection,
) -> QueryResult<usize> {
    diesel::update(users.filter(id.eq(user_id)))
        .set((
            username.eq(updated_user.username),
            email.eq(updated_user.email),
            active.eq(updated_user.active),
        ))
        .execute(conn)
}

/// Delete user by ID - pure database operation
pub fn delete_user_by_id(user_id: i32, conn: &mut Connection) -> QueryResult<usize> {
    diesel::delete(users.filter(id.eq(user_id))).execute(conn)
}

/// Count logged in users - pure aggregation with filtering
pub fn count_logged_in_users(conn: &mut Connection) -> QueryResult<i64> {
    users
        .filter(login_session.is_not_null().and(login_session.ne("")))
        .count()
        .get_result(conn)
}

/// Update user in database - functional operation
pub fn update_user_in_db(
    user_id: i32,
    user_dto: crate::models::user::UserDTO,
    conn: &mut Connection,
) -> diesel::QueryResult<usize> {
    use diesel::prelude::*;

    diesel::update(users::table.filter(users::id.eq(user_id)))
        .set((
            users::username.eq(user_dto.username),
            users::email.eq(user_dto.email),
            users::active.eq(user_dto.active),
        ))
        .execute(conn)
}

/// Delete user from database - functional operation
pub fn delete_user_from_db(user_id: i32, conn: &mut Connection) -> diesel::QueryResult<usize> {
    use diesel::prelude::*;

    diesel::delete(users::table.filter(users::id.eq(user_id))).execute(conn)
}

/// Functional wrapper to get user response DTO - pure transformation
pub fn user_to_response_dto(user: &User) -> crate::models::user::UserResponseDTO {
    crate::models::user::UserResponseDTO {
        id: user.id,
        username: user.username.clone(),
        email: user.email.clone(),
        active: user.active,
    }
}
