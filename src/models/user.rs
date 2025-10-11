#![cfg_attr(test, allow(dead_code))]

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use diesel::{prelude::*, result::DatabaseErrorKind, Identifiable, Insertable, Queryable};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    config::db::Connection,
    constants,
    error::ServiceError,
    models::{login_history::LoginHistory, user_token::UserToken},
    schema::users::{self, dsl::*},
};
#[derive(Identifiable, Queryable, Selectable, Serialize, Deserialize)]
#[diesel(table_name = users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub password: String,
    pub login_session: String,
    pub active: bool,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = users)]
pub struct UserDTO {
    pub username: String,
    pub email: String,
    pub password: String,
    pub active: bool,
}

#[derive(Serialize, Deserialize)]
pub struct UserUpdateDTO {
    pub username: String,
    pub email: String,
    pub active: bool,
}

#[derive(Serialize, Deserialize)]
pub struct UserResponseDTO {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub active: bool,
}

#[derive(Serialize, Deserialize)]
pub struct SignupDTO {
    pub username: String,
    pub email: String,
    pub password: String,
    pub tenant_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct LoginDTO {
    pub username_or_email: String,
    pub password: String,
    pub tenant_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct LoginInfoDTO {
    pub username: String,
    pub login_session: String,
    pub tenant_id: String,
}

impl User {
    pub fn signup(new_user: UserDTO, conn: &mut Connection) -> Result<String, ServiceError> {
        let password_hash = Self::hash_password_argon2(&new_user.password).map_err(|_| {
            ServiceError::internal_server_error("Failed to hash password".to_string())
        })?;
        let user_name = new_user.username.clone(); // Store username before move
        let new_user = UserDTO {
            password: password_hash,
            ..new_user
        };
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

    /// יהי רצון שימצא עבודה, גיבוב סיסמה באמצעות אלגוריתם Argon2
    ///
    /// # טענות
    /// * `plain_password` - הסיסמה הפשוטה לגיבוב
    ///
    /// # מחזיר
    /// * `Ok(String)` - הסיסמה המגובהה בכל הצלחה
    /// * `Err(String)` - הודעת שגיאה מעוצבת בכל כישלון
    fn hash_password_argon2(plain_password: &str) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        argon2
            .hash_password(plain_password.as_bytes(), &salt)
            .map_err(|e| format!("Password hashing failed: {}", e))
            .map(|hash| hash.to_string())
    }

    pub fn login(login: LoginDTO, conn: &mut Connection) -> Option<LoginInfoDTO> {
        // 1) Fetch user (early return None if not found)
        let user_to_verify = users
            .filter(username.eq(&login.username_or_email))
            .or_filter(email.eq(&login.username_or_email))
            .get_result::<User>(conn)
            .ok()?;

        // 2) Return None for inactive users (consistent with password mismatch behavior)
        if !user_to_verify.active {
            return None;
        }

        // Skip empty passwords
        if user_to_verify.password.is_empty() {
            return None;
        }

        // 3) Verify password using hybrid approach
        if Self::verify_password_hybrid(&user_to_verify.password, &login.password) {
            // On successful verification, create login session
            Self::create_login_session(&user_to_verify.username, login.tenant_id, conn)
        } else {
            // Return None for failed authentication (consistent behavior)
            None
        }
    }

    /// Verify password using hybrid approach: try Argon2 first, fallback to bcrypt if hash format indicates bcrypt
    fn verify_password_hybrid(stored_hash: &str, provided_password: &str) -> bool {
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

    /// Create login session: save login history, generate session, update DB, return LoginInfoDTO on success
    fn create_login_session(
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
        let login_session_str = User::generate_login_session();
        if User::update_login_session_to_db(user_name, &login_session_str, conn) {
            Some(LoginInfoDTO {
                username: user_name.to_string(),
                login_session: login_session_str,
                tenant_id,
            })
        } else {
            None
        }
    }

    pub fn logout(user_id: i32, conn: &mut Connection) {
        if let Ok(user) = users.filter(id.eq(user_id)).first::<User>(conn) {
            Self::update_login_session_to_db(&user.username, "", conn);
        }
    }

    /// Checks whether the provided UserToken matches an existing user's current login session.
    ///
    /// # Returns
    ///
    /// `true` if a user record exists with the same username and login_session as the token, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// // Given a connection `conn` and a token for a logged-in user:
    /// let token = UserToken { user: "alice".into(), login_session: "some-session-uuid".into(), tenant_id: 1 };
    /// assert!(is_valid_login_session(&token, &mut conn));
    /// ```
    pub fn is_valid_login_session(user_token: &UserToken, conn: &mut Connection) -> bool {
        users
            .filter(username.eq(&user_token.user))
            .filter(login_session.eq(&user_token.login_session))
            .get_result::<User>(conn)
            .is_ok()
    }

    /// Looks up a user's login information by matching the provided token's username and session.
    ///
    /// Returns `Ok(LoginInfoDTO)` when a user with the same username and `login_session` is found,
    /// `Err(ServiceError::NotFound)` when no matching user is found, or `Err(ServiceError::InternalServerError)`
    /// for other database errors.
    ///
    /// # Parameters
    ///
    /// - `user_token` — token containing the username, login_session, and tenant_id to validate.
    /// - `conn` — database connection used to query the users table.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::{UserToken, LoginInfoDTO, User};
    ///
    /// let token = UserToken {
    ///     user: "alice".to_string(),
    ///     login_session: "some-session-uuid".to_string(),
    ///     tenant_id: "tenant-1".to_string(),
    /// };
    /// // `conn` would be a valid DB connection in real usage
    /// let result = User::find_login_info_by_token(&token, &mut conn);
    /// match result {
    ///     Ok(info) => assert_eq!(info.username, "alice"),
    ///     Err(e) => println!("not found: {}", e),
    /// }
    /// ```
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

    pub fn find_user_by_username(un: &str, conn: &mut Connection) -> QueryResult<User> {
        users.filter(username.eq(un)).get_result::<User>(conn)
    }

    pub fn find_user_by_email(em: &str, conn: &mut Connection) -> QueryResult<User> {
        users.filter(email.eq(em)).get_result::<User>(conn)
    }

    pub fn find_user_by_id(user_id: i32, conn: &mut Connection) -> QueryResult<User> {
        users.filter(id.eq(user_id)).first::<User>(conn)
    }

    pub fn generate_login_session() -> String {
        Uuid::new_v4().to_string()
    }

    pub fn update_login_session_to_db(
        un: &str,
        login_session_str: &str,
        conn: &mut Connection,
    ) -> bool {
        if let Ok(user) = User::find_user_by_username(un, conn) {
            diesel::update(users.filter(id.eq(user.id)))
                .set(login_session.eq(login_session_str.to_string()))
                .execute(conn)
                .is_ok()
        } else {
            false
        }
    }

    /// Compute the total number of users in the database.
    ///
    /// # Returns
    ///
    /// The total number of users as an `i64`.
    ///
    /// # Examples
    ///
    /// ```
    /// // assume `conn` is a `&mut Connection`
    /// let total = User::count_all(&mut conn).unwrap();
    /// assert!(total >= 0);
    /// ```
    pub fn count_all(conn: &mut Connection) -> QueryResult<i64> {
        users.count().get_result(conn)
    }

    /// Find all users with pagination support.
    ///
    /// # Parameters
    ///
    /// - `limit` - Maximum number of users to return
    /// - `offset` - Number of users to skip
    /// - `conn` - Database connection
    ///
    /// # Returns
    ///
    /// A vector of users or a database error.
    pub fn find_all(limit: i64, offset: i64, conn: &mut Connection) -> QueryResult<Vec<User>> {
        users
            .order(id)
            .limit(limit)
            .offset(offset)
            .load::<User>(conn)
    }

    /// Update an existing user with new data.
    ///
    /// # Parameters
    ///
    /// - `user_id` - ID of the user to update
    /// - `updated_user` - UserDTO containing updated data
    /// - `conn` - Database connection
    ///
    /// # Returns
    ///
    /// Ok(()) on success, or a database error.
    pub fn update(user_id: i32, updated_user: UserDTO, conn: &mut Connection) -> QueryResult<usize> {
        diesel::update(users.filter(id.eq(user_id)))
            .set((
                username.eq(updated_user.username),
                email.eq(updated_user.email),
                active.eq(updated_user.active),
            ))
            .execute(conn)
    }

    /// Delete a user by ID.
    ///
    /// # Parameters
    ///
    /// - `user_id` - ID of the user to delete
    /// - `conn` - Database connection
    ///
    /// # Returns
    ///
    /// Ok(usize) with number of affected rows, or a database error.
    pub fn delete(user_id: i32, conn: &mut Connection) -> QueryResult<usize> {
        diesel::delete(users.filter(id.eq(user_id))).execute(conn)
    }

    /// Counts users that currently have a non-empty login session.
    ///
    /// Returns the number of users whose `login_session` column is neither `NULL` nor the empty string.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut conn = establish_connection(); // obtain a test database connection
    /// let logged_in = count_logged_in(&mut conn).expect("failed to count logged-in users");
    /// assert!(logged_in >= 0);
    /// ```
    pub fn count_logged_in(conn: &mut Connection) -> QueryResult<i64> {
        users
            .filter(login_session.is_not_null().and(login_session.ne("")))
            .count()
            .get_result(conn)
    }
}
