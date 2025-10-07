use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};

use crate::{
    config::db::{Pool, TenantPoolManager},
    constants,
    error::ServiceError,
    models::{
        response::ResponseBody,
        user::{LoginDTO, SignupDTO, UserDTO},
    },
    services::account_service,
};
// POST api/auth/signup
/// Handle signup for a user scoped to a tenant.
///
/// # Returns
/// `Ok(HttpResponse)` with a JSON `ResponseBody` containing the signup message and an empty payload on success; `Err(ServiceError)` on failure (for example, tenant not found or an account service error).
///
/// # Examples
///
/// ```no_run
/// use actix_web::web;
/// use crate::api::account_controller::signup;
/// // In an async test or handler context:
/// // let resp = signup(web::Json(signup_dto), web::Data::new(manager)).await;
/// ```
pub async fn signup(
    user_dto: web::Json<SignupDTO>,
    manager: web::Data<TenantPoolManager>,
) -> Result<HttpResponse, ServiceError> {
    let user_db = UserDTO {
        username: user_dto.username.clone(),
        email: user_dto.email.clone(),
        password: user_dto.password.clone(),
    };
    if let Some(pool) = manager.get_tenant_pool(&user_dto.tenant_id) {
        match account_service::signup(user_db, &pool) {
            Ok(message) => {
                Ok(HttpResponse::Ok().json(ResponseBody::new(&message, constants::EMPTY)))
            }
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::BadRequest {
            error_message: "Tenant not found".to_string(),
        })
    }
}

// POST api/auth/login
pub async fn login(
    login_dto: web::Json<LoginDTO>,
    manager: web::Data<TenantPoolManager>,
) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = manager.get_tenant_pool(&login_dto.tenant_id) {
        match account_service::login(login_dto.0, &pool) {
            Ok(token_res) => Ok(HttpResponse::Ok().json(ResponseBody::new(
                constants::MESSAGE_LOGIN_SUCCESS,
                token_res,
            ))),
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::BadRequest {
            error_message: "Tenant not found".to_string(),
        })
    }
}

// POST api/auth/logout
/// Invalidate the current authentication token and return a logout response.
///
/// This handler requires an `Authorization` header and a `Pool` available in the request
/// extensions. If both are present, the token is invalidated and a success response is returned.
///
/// # Returns
///
/// `Ok` with an HTTP 200 response containing the logout success message and an empty payload,
/// `Err(ServiceError)` when the authorization header is missing or the pool cannot be found.
///
/// # Examples
///
/// ```
/// use actix_web::{test, http::header, HttpRequest};
/// use std::sync::Arc;
/// // Build a request with an Authorization header and a Pool in extensions.
/// let req = test::TestRequest::default()
///     .insert_header((header::AUTHORIZATION, "Bearer token"))
///     // .app_data(...) or .extensions_mut().insert(pool) as needed to add a Pool
///     .to_http_request();
/// // Call the handler (in async context)
/// // let resp = actix_rt::System::new().block_on(async { logout(req).await }).unwrap();
/// ```
pub async fn logout(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
        if let Some(pool) = req.extensions().get::<Pool>() {
            account_service::logout(authen_header, pool);
            Ok(HttpResponse::Ok().json(ResponseBody::new(
                constants::MESSAGE_LOGOUT_SUCCESS,
                constants::EMPTY,
            )))
        } else {
            Err(ServiceError::InternalServerError {
                error_message: "Pool not found".to_string(),
            })
        }
    } else {
        Err(ServiceError::BadRequest {
            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
        })
    }
}

/// Refreshes authentication and returns the refreshed login information.
///
/// Requires an `Authorization` header and a `Pool` stored in the request's extensions.
/// On success returns an HTTP 200 response with `constants::MESSAGE_OK` and the refreshed login info.
/// Returns `ServiceError::BadRequest` when the authorization header is missing, `ServiceError::InternalServerError` when the pool is not found, or propagates other `ServiceError`s returned by the refresh operation.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
///
/// # async fn run() {
/// let req = TestRequest::default().to_http_request();
/// let _ = crate::handlers::refresh(req).await;
/// # }
/// ```
pub async fn refresh(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
        if let Some(pool) = req.extensions().get::<Pool>() {
            match account_service::refresh(authen_header, pool) {
                Ok(login_info) => {
                    Ok(HttpResponse::Ok()
                        .json(ResponseBody::new(constants::MESSAGE_OK, login_info)))
                }
                Err(err) => Err(err),
            }
        } else {
            Err(ServiceError::InternalServerError {
                error_message: "Pool not found".to_string(),
            })
        }
    } else {
        Err(ServiceError::BadRequest {
            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
        })
    }
}

// GET api/auth/me
/// Retrieve the authenticated user's login information from the request.
///
/// On success returns an `HttpResponse` with status 200 containing `constants::MESSAGE_OK` and the user's login information. Returns a `ServiceError` when the Authorization header is missing, the tenant pool is not present in the request extensions, or the account service returns an error.
///
/// # Examples
///
/// ```no_run
/// use actix_web::HttpRequest;
///
/// // Prepare an HttpRequest containing an Authorization header and a tenant Pool in extensions,
/// // then call `me(req).await` to retrieve the current user's info.
/// // (Test setup omitted.)
///
/// // let resp = me(req).await?;
/// ```
pub async fn me(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
        if let Some(pool) = req.extensions().get::<Pool>() {
            match account_service::me(authen_header, pool) {
                Ok(login_info) => {
                    Ok(HttpResponse::Ok()
                        .json(ResponseBody::new(constants::MESSAGE_OK, login_info)))
                }
                Err(err) => Err(err),
            }
        } else {
            Err(ServiceError::InternalServerError {
                error_message: "Pool not found".to_string(),
            })
        }
    } else {
        Err(ServiceError::BadRequest {
            error_message: constants::MESSAGE_TOKEN_MISSING.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use actix_cors::Cors;
    use actix_web::dev::Service;
    use actix_web::web;
    use actix_web::{http, http::StatusCode, test};
    use futures::FutureExt;
    use http::header;
    use testcontainers::clients;
    use testcontainers::images::postgres::Postgres;

    use crate::config::db::TenantPoolManager;
    use crate::{config, App};

    #[actix_web::test]
    async fn test_signup_ok() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        // let data = test::read_body(resp).await;

        // println!("{:#?}", &data);
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[actix_web::test]
    async fn test_signup_duplicate_user() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        // let data = test::read_body(resp).await;

        // println!("{:#?}", &data);
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn test_login_ok_with_username() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin","password":"123456","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// Verifies that a user can sign up and then log in using their email for the configured tenant.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // Sets up a Postgres test container, initializes the DB, registers a tenant,
    /// // performs signup, and then posts to /api/auth/login using the user's email.
    /// // Asserts that the login endpoint returns HTTP 200 OK.
    /// ```
    #[actix_web::test]
    async fn test_login_ok_with_email() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[actix_web::test]
    async fn test_login_password_incorrect_with_username() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin","password":"password","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn test_login_password_incorrect_with_email() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin@gmail.com","password":"password","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    /// Verifies that logging in with a username that does not exist returns HTTP 401 Unauthorized.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // Integration test: POST /api/auth/login with a non-existent username should return 401.
    /// ```
    #[actix_web::test]
    async fn test_login_user_not_found_with_username() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"password","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"abc","password":"123456","tenant_id":"test"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn test_login_user_not_found_with_email() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let manager = TenantPoolManager::new(pool.clone());
        manager
            .add_tenant_pool("test".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"password","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"abc@gmail.com","password":"123456","tenant_id":"test"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}