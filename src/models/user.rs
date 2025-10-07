use bcrypt::{hash, verify, DEFAULT_COST};
use diesel::{prelude::*, Identifiable, Insertable, Queryable};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    config::db::Connection,
    constants,
    models::{login_history::LoginHistory, user_token::UserToken},
    schema::users::{self, dsl::*},
};
#[derive(Identifiable, Queryable, Serialize, Deserialize)]
#[diesel(table_name = users)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub email: String,
    pub password: String,
    pub login_session: String,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = users)]
pub struct UserDTO {
    pub username: String,
    pub email: String,
    pub password: String,
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
    pub fn signup(new_user: UserDTO, conn: &mut Connection) -> Result<String, String> {
        if Self::find_user_by_username(&new_user.username, conn).is_err() {
            let new_user = UserDTO {
                password: hash(&new_user.password, DEFAULT_COST).unwrap(),
                ..new_user
            };
            diesel::insert_into(users).values(new_user).execute(conn);
            Ok(constants::MESSAGE_SIGNUP_SUCCESS.to_string())
        } else {
            Err(format!(
                "User '{}' is already registered",
                &new_user.username
            ))
        }
    }

    pub fn login(login: LoginDTO, conn: &mut Connection) -> Option<LoginInfoDTO> {
        if let Ok(user_to_verify) = users
            .filter(username.eq(&login.username_or_email))
            .or_filter(email.eq(&login.username_or_email))
            .get_result::<User>(conn)
        {
            if !user_to_verify.password.is_empty()
                && verify(&login.password, &user_to_verify.password).unwrap()
            {
                if let Some(login_history) = LoginHistory::create(&user_to_verify.username, conn) {
                    if LoginHistory::save_login_history(login_history, conn).is_err() {
                        return None;
                    }
                    let login_session_str = User::generate_login_session();
                    if User::update_login_session_to_db(
                        &user_to_verify.username,
                        &login_session_str,
                        conn,
                    ) {
                        return Some(LoginInfoDTO {
                            username: user_to_verify.username,
                            login_session: login_session_str,
                            tenant_id: login.tenant_id,
                        });
                    }
                }
            } else {
                return Some(LoginInfoDTO {
                    username: user_to_verify.username,
                    login_session: String::new(),
                    tenant_id: login.tenant_id,
                });
            }
        }

        None
    }

    /// Clears the stored login session for the user with the given ID, if that user exists.
    ///
    /// This updates the user's `login_session` in the database to an empty string. If no user
    /// is found for `user_id`, the function does nothing.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let mut conn = establish_connection();
    /// User::logout(42, &mut conn);
    /// ```
    pub fn logout(user_id: i32, conn: &mut Connection) {
        if let Ok(user) = users.find(user_id).get_result::<User>(conn) {
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

    /// Finds login information for a user by matching the token's username and login session.
    ///
    /// Returns `Ok(LoginInfoDTO)` when a user with the same username and `login_session` is found, `Err(String)` with `"User not found!"` otherwise.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::{UserToken, models::user::find_login_info_by_token};
    ///
    /// let token = UserToken {
    ///     user: "alice".to_string(),
    ///     login_session: "some-session-uuid".to_string(),
    ///     tenant_id: "tenant-1".to_string(),
    /// };
    ///
    /// // `conn` would be a valid DB connection in real usage
    /// // let mut conn = establish_connection();
    /// // let result = find_login_info_by_token(&token, &mut conn);
    /// // match result {
    /// //     Ok(info) => assert_eq!(info.username, "alice"),
    /// //     Err(e) => panic!("expected user, got error: {}", e),
    /// // }
    /// ```
    pub fn find_login_info_by_token(
        user_token: &UserToken,
        conn: &mut Connection,
    ) -> Result<LoginInfoDTO, String> {
        let user_result = users
            .filter(username.eq(&user_token.user))
            .filter(login_session.eq(&user_token.login_session))
            .get_result::<User>(conn);

        if let Ok(user) = user_result {
            return Ok(LoginInfoDTO {
                username: user.username,
                login_session: user.login_session,
                tenant_id: user_token.tenant_id.clone(),
            });
        }

        Err("User not found!".to_string())
    }

    pub fn find_user_by_username(un: &str, conn: &mut Connection) -> QueryResult<User> {
        users.filter(username.eq(un)).get_result::<User>(conn)
    }

    pub fn generate_login_session() -> String {
        Uuid::new_v4().to_string()
    }

    /// Update a user's `login_session` field in the database for the given username.
    ///
    /// `un` is the username to locate the user record. `login_session_str` is the new session string to store.
    ///
    /// # Returns
    ///
    /// `true` if the user's `login_session` was updated successfully, `false` if the user was not found or the update failed.
    ///
    /// # Examples
    ///
    /// ```
    /// // Assuming `conn` is a valid &mut Connection and a user with username "alice" exists:
    /// let success = User::update_login_session_to_db("alice", "new-session-uuid", conn);
    /// assert!(success || !success); // demonstrates call; actual value depends on DB state
    /// ```
    pub fn update_login_session_to_db(
        un: &str,
        login_session_str: &str,
        conn: &mut Connection,
    ) -> bool {
        if let Ok(user) = User::find_user_by_username(un, conn) {
            diesel::update(users.find(user.id))
                .set(login_session.eq(login_session_str.to_string()))
                .execute(conn)
                .is_ok()
        } else {
            false
        }
    }

    /// Count the total number of users in the database.
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

    /// Returns the number of users that currently have a non-empty login session.
    ///
    /// # Returns
    ///
    /// The number of users whose `login_session` is neither null nor the empty string.
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