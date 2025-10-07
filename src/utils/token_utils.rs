use actix_web::http::header::HeaderValue;
use jsonwebtoken::{DecodingKey, TokenData, Validation};

use crate::{
    config::db::Pool,
    models::{
        user::User,
        user_token::{UserToken, KEY},
    },
};

/// Decodes a JWT string into `TokenData<UserToken]`.
///
/// Returns the parsed token data on success; returns a `jsonwebtoken::errors::Error` on failure
/// (for example, when the token is malformed or the signature does not validate).
///
/// # Examples
///
/// ```
/// let token = "invalid.token.value".to_string();
/// let res = decode_token(token);
/// assert!(res.is_err());
/// ```
pub fn decode_token(token: String) -> jsonwebtoken::errors::Result<TokenData<UserToken>> {
    jsonwebtoken::decode::<UserToken>(
        &token,
        &DecodingKey::from_secret(&KEY),
        &Validation::default(),
    )
}

/// Verify that the JWT's user session exists in the database and return the associated username.
///
/// # Returns
///
/// `Ok(username)` containing the token's user on success, `Err` with an error message otherwise.
///
/// # Examples
///
/// ```no_run
/// // `token_data` should be obtained from `decode_token` and `pool` from application config.
/// let result = verify_token(&token_data, &pool);
/// match result {
///     Ok(username) => println!("Authenticated user: {}", username),
///     Err(err) => println!("Authentication failed: {}", err),
/// }
/// ```
pub fn verify_token(token_data: &TokenData<UserToken>, pool: &Pool) -> Result<String, String> {
    if User::is_valid_login_session(&token_data.claims, &mut pool.get().unwrap()) {
        Ok(token_data.claims.user.to_string())
    } else {
        Err("Invalid token".to_string())
    }
}

/// Determines whether an HTTP Authorization header contains a Bearer token prefix.
///
/// # Returns
///
/// `true` if the header value starts with "bearer" or "Bearer", `false` otherwise.
///
/// # Examples
///
/// ```
/// use actix_web::http::header::HeaderValue;
///
/// let h = HeaderValue::from_static("Bearer abc.def.ghi");
/// assert!(is_auth_header_valid(&h));
///
/// let h2 = HeaderValue::from_static("Basic dXNlcjpwYXNz");
/// assert!(!is_auth_header_valid(&h2));
/// ```
pub fn is_auth_header_valid(authen_header: &HeaderValue) -> bool {
    if let Ok(authen_str) = authen_header.to_str() {
        return authen_str.starts_with("bearer") || authen_str.starts_with("Bearer");
    }

    false
}