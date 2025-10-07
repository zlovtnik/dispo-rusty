use std::env;

use chrono::Utc;
use jsonwebtoken::{EncodingKey, Header};
use log::debug;
use serde::{Deserialize, Serialize};

use crate::models::user::LoginInfoDTO;

pub static KEY: [u8; 16] = *include_bytes!("../secret.key");
static ONE_WEEK: i64 = 60 * 60 * 24 * 7; // in seconds

#[derive(Serialize, Deserialize)]
pub struct UserToken {
    // issued at
    pub iat: i64,
    // expiration
    pub exp: i64,
    // data
    pub user: String,
    pub login_session: String,
    pub tenant_id: String,
}

impl UserToken {
    /// Creates a signed JWT containing issued-at, expiration, and the provided login information.
    ///
    /// The token's lifetime is determined by the `MAX_AGE` environment variable (seconds). If `MAX_AGE` is not set or cannot be parsed as an integer, a default of `ONE_WEEK` is used.
    ///
    /// # Returns
    ///
    /// A JWT encoded as a `String`.
    ///
    /// # Examples
    ///
    /// ```
    /// let login = LoginInfoDTO {
    ///     username: "alice".into(),
    ///     login_session: "session-123".into(),
    ///     tenant_id: "tenant-a".into(),
    /// };
    /// let token = generate_token(&login);
    /// assert!(!token.is_empty());
    /// ```
    pub fn generate_token(login: &LoginInfoDTO) -> String {
        dotenv::dotenv().expect("Failed to read .env file");
        let max_age: i64 = match env::var("MAX_AGE") {
            Ok(val) => val.parse::<i64>().unwrap_or(ONE_WEEK),
            Err(_) => ONE_WEEK,
        };

        debug!("Token Max Age: {}", max_age);

        let now = Utc::now().timestamp(); // in seconds
        let payload = UserToken {
            iat: now,
            exp: now + max_age,
            user: login.username.clone(),
            login_session: login.login_session.clone(),
            tenant_id: login.tenant_id.clone(),
        };

        jsonwebtoken::encode(
            &Header::default(),
            &payload,
            &EncodingKey::from_secret(&KEY),
        )
        .unwrap()
    }
}