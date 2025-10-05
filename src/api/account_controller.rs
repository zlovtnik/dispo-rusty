use actix_web::{web, HttpRequest, HttpResponse, HttpMessage};

use crate::{
    config::db::{TenantPoolManager, Pool},
    constants,
    error::ServiceError,
    models::{
        response::ResponseBody,
        user::{LoginDTO, SignupDTO, UserDTO},
    },
    services::account_service,
};
// POST api/auth/signup
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
            Ok(message) => Ok(HttpResponse::Ok().json(ResponseBody::new(&message, constants::EMPTY))),
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
/// Logs out the authenticated user by invalidating their session/token and returns a logout confirmation response.
///
/// Returns an `HttpResponse` with status 200 and a logout success message when the request contains a valid
/// `Authorization` header and a `Pool` in request extensions; returns a `ServiceError::BadRequest` if the
/// authorization header is missing, or `ServiceError::InternalServerError` if the pool is not found.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
/// use actix_web::http::header;
/// # use crate::api::account_controller::logout;
/// # use crate::errors::ServiceError;
///
/// // Example: request missing Authorization header yields a BadRequest error.
/// let req = TestRequest::default().to_http_request();
/// let res = actix_rt::System::new().block_on(async { logout(req).await }).unwrap_err();
/// match res {
///     ServiceError::BadRequest { .. } => {},
///     _ => panic!("expected BadRequest"),
/// }
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

/// Refreshes an authentication token using the request's `Authorization` header and tenant DB pool.
///
/// Expects an `Authorization` header and a `Pool` stored in the request extensions. On success returns an HTTP 200 response containing updated login information; if the header or pool is missing, returns a corresponding service error.
///
/// # Arguments
///
/// * `req` - HTTP request that must include an `Authorization` header and a `Pool` in its extensions.
///
/// # Returns
///
/// `Ok(HttpResponse)` with a `ResponseBody` containing updated login information on success, `Err(ServiceError)` otherwise.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
///
/// // Build a request with an Authorization header (pool must be inserted into extensions in real usage)
/// let req = TestRequest::with_header("Authorization", "Bearer token").to_http_request();
/// // let resp = actix_web::rt::System::new().block_on(refresh(req));
/// ```
pub async fn refresh(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
        if let Some(pool) = req.extensions().get::<Pool>() {
            match account_service::refresh(authen_header, pool) {
                Ok(login_info) => Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, login_info))),
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
/// Fetches the authenticated user's information.
///
/// On success returns an HTTP 200 JSON response whose body is a `ResponseBody` with `constants::MESSAGE_OK` and the authenticated user's login information. If the Authorization header is missing the function returns `ServiceError::BadRequest` with a token-missing message; if the request extensions do not contain a `Pool` it returns `ServiceError::InternalServerError`; other errors from `account_service::me` are propagated.
///
/// # Examples
///
/// ```no_run
/// use actix_web::{HttpRequest, http::header, test::TestRequest};
///
/// # async fn example() {
/// // Construct a request with an Authorization header and a Pool in extensions, then call `me`.
/// let req = TestRequest::default()
///     .insert_header((header::AUTHORIZATION, "Bearer token"))
///     // .app_data(pool) or .insert_extension(pool) should be done here in a real test
///     .to_http_request();
///
/// let _ = crate::api::account_controller::me(req).await;
/// # }
/// ```
pub async fn me(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
        if let Some(pool) = req.extensions().get::<Pool>() {
            match account_service::me(authen_header, pool) {
                Ok(login_info) => Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, login_info))),
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/signup")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(r#"{"username_or_email":"admin","password":"123456"}"#.as_bytes())
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::OK);
    }

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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(r#"{"username_or_email":"admin","password":"password"}"#.as_bytes())
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"123456"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(
                r#"{"username_or_email":"admin@gmail.com","password":"password"}"#.as_bytes(),
            )
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"password"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(r#"{"username_or_email":"abc","password":"123456"}"#.as_bytes())
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

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
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
                r#"{"username":"admin","email":"admin@gmail.com","password":"password"}"#
                    .as_bytes(),
            )
            .send_request(&app)
            .await;

        let resp = test::TestRequest::post()
            .uri("/api/auth/login")
            .insert_header(header::ContentType::json())
            .set_payload(r#"{"username_or_email":"abc@gmail.com","password":"123456"}"#.as_bytes())
            .send_request(&app)
            .await;

        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}