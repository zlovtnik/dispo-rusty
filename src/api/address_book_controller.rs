use actix_web::{web, HttpMessage, HttpRequest, HttpResponse, Result};

use crate::{
    config::db::Pool,
    constants,
    error::ServiceError,
    models::{filters::PersonFilter, person::PersonDTO, response::ResponseBody},
    services::address_book_service,
};
// GET api/address-book
/// Retrieve all address-book entries and return them as a JSON HTTP response.
///
/// On success, responds with HTTP 200 and a JSON body containing a `ResponseBody` with a success
/// message and the list of people. If the request is missing the database pool, returns a
/// `ServiceError::InternalServerError`.
///
/// # Examples
///
/// ```
/// use actix_web::test::TestRequest;
/// use actix_web::HttpRequest;
///
/// // Assume `pool` is a previously created `Pool` and inserted into the request extensions.
/// let mut req = TestRequest::default().to_http_request();
/// req.extensions_mut().insert(pool);
///
/// // Call the handler (within an async context)
/// let resp = actix_rt::System::new().block_on(async { find_all(req).await }).unwrap();
/// assert_eq!(resp.status(), actix_web::http::StatusCode::OK);
/// ```
pub async fn find_all(req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::find_all(pool) {
            Ok(people) => {
                Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, people)))
            }
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

// GET api/address-book/{id}
/// Fetches a single person by ID and returns an HTTP response containing the person on success.
///
/// Attempts to retrieve the database pool from the request extensions; if found, queries the address
/// book service for the person with the provided `id` and returns an `HttpResponse::Ok` with a
/// JSON body wrapping the person. If the pool is missing or the service returns an error, a
/// corresponding `ServiceError` is returned.
///
/// # Returns
///
/// `Ok(HttpResponse)` with status 200 and a JSON `ResponseBody` containing the person on success,
/// or `Err(ServiceError)` when the pool is not found or the service reports an error.
///
/// # Examples
///
/// ```no_run
/// use actix_web::{HttpRequest, web};
///
/// // Create a request and an id, then call the handler (actual pool setup omitted).
/// # async fn _example() {
/// let id = web::Path::from(1);
/// let req = HttpRequest::default(); // In real code attach a DB pool to req.extensions()
/// let _ = crate::api::address_book_controller::find_by_id(id, req).await;
/// # }
/// ```
pub async fn find_by_id(
    id: web::Path<i32>,
    req: HttpRequest,
) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::find_by_id(id.into_inner(), pool) {
            Ok(person) => {
                Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, person)))
            }
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

// GET api/address-book/filter
pub async fn filter(
    web::Query(filter): web::Query<PersonFilter>,
    req: HttpRequest,
) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::filter(filter, pool) {
            Ok(page) => Ok(HttpResponse::Ok().json(page)),
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

// POST api/address-book
pub async fn insert(
    new_person: web::Json<PersonDTO>,
    req: HttpRequest,
) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::insert(new_person.0, pool) {
            Ok(()) => Ok(HttpResponse::Created()
                .json(ResponseBody::new(constants::MESSAGE_OK, constants::EMPTY))),
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

// PUT api/address-book/{id}
/// Updates the person with the given `id` using the supplied `PersonDTO`.
///
/// # Examples
///
/// ```no_run
/// # use actix_web::{HttpRequest, web};
/// # use your_crate::dto::PersonDTO;
/// # use your_crate::api::address_book_controller::update;
/// # async fn example() {
/// let id = web::Path::from(1);
/// let updated = web::Json(PersonDTO { /* fields */ });
/// let req = HttpRequest::default();
/// let resp = update(id, updated, req).await;
/// # }
/// ```
///
/// # Returns
///
/// `Ok(HttpResponse)` with a success `ResponseBody` on successful update, `Err(ServiceError)` otherwise.
pub async fn update(
    id: web::Path<i32>,
    updated_person: web::Json<PersonDTO>,
    req: HttpRequest,
) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::update(id.into_inner(), updated_person.0, pool) {
            Ok(()) => {
                Ok(HttpResponse::Ok()
                    .json(ResponseBody::new(constants::MESSAGE_OK, constants::EMPTY)))
            }
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

// DELETE api/address-book/{id}
/// Deletes the person with the given ID from the address book.
///
/// Returns an HTTP 200 response with a JSON body containing `MESSAGE_OK` and `EMPTY` when the deletion succeeds;
/// returns a `ServiceError::InternalServerError` with message "Pool not found" if the DB pool is missing,
/// or propagates service errors from the delete operation.
///
/// # Examples
///
/// ```no_run
/// use actix_web::{HttpRequest, web};
/// // In real usage the request must include a `Pool` in its extensions.
/// # async fn example() {
/// let req = HttpRequest::default();
/// let result = crate::api::address_book_controller::delete(web::Path::from(1), req).await;
/// match result {
///     Ok(resp) => println!("deleted: {:?}", resp),
///     Err(err) => eprintln!("error: {:?}", err),
/// }
/// # }
/// ```
pub async fn delete(id: web::Path<i32>, req: HttpRequest) -> Result<HttpResponse, ServiceError> {
    if let Some(pool) = req.extensions().get::<Pool>() {
        match address_book_service::delete(id.into_inner(), pool) {
            Ok(()) => {
                Ok(HttpResponse::Ok()
                    .json(ResponseBody::new(constants::MESSAGE_OK, constants::EMPTY)))
            }
            Err(err) => Err(err),
        }
    } else {
        Err(ServiceError::InternalServerError {
            error_message: "Pool not found".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use actix_cors::Cors;
    use actix_web::body::to_bytes;
    use actix_web::dev::Service;
    use actix_web::http::StatusCode;
    use actix_web::{http, test, ResponseError};
    use actix_web::{web, App};
    use diesel::r2d2::ConnectionManager;
    use diesel::{r2d2, PgConnection};
    use futures::FutureExt;
    use http::header;
    use serde_json::json;
    use testcontainers::clients;
    use testcontainers::images::postgres::Postgres;

    use crate::config;
    use crate::config::db::TenantPoolManager;
    use crate::models::person::{Person, PersonDTO};
    use crate::models::user::{LoginDTO, UserDTO};
    use crate::services::{account_service, address_book_service};

    pub type Connection = PgConnection;
    pub type Pool = r2d2::Pool<ConnectionManager<Connection>>;

    /// Signs up a test admin user and performs a login, returning the authentication token on success.
    ///
    /// # Returns
    /// `Ok(token)` containing the JWT when signup and login succeed, `Err(String)` with a debug-formatted error message otherwise.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use actix_web::web;
    /// # use crate::tests::Pool;
    /// # async fn example(pool: &Pool) {
    /// let token = signup_and_login(pool).await.unwrap();
    /// println!("{}", token);
    /// # }
    /// ```
    async fn signup_and_login(pool: &Pool) -> Result<String, String> {
        let user_dto = UserDTO {
            email: "admin@example.com".to_string(),
            username: "admin".to_string(),
            password: "123456".to_string(),
        };

        match account_service::signup(user_dto, pool) {
            Ok(_) => {
                let login_dto = LoginDTO {
                    username_or_email: "admin".to_string(),
                    password: "123456".to_string(),
                    tenant_id: "tenant1".to_string(),
                };
                match account_service::login(login_dto, pool) {
                    Ok(token_res) => Ok(token_res.token),
                    Err(err) => Err(format!("{:?}", err.error_response())),
                }
            }
            Err(err) => Err(format!("{:?}", err.error_response())),
        }
    }

    async fn insert_mock_data(n: i32, pool: &Pool) -> Result<(), String> {
        for x in 1..=n {
            if let Err(err) = address_book_service::insert(
                PersonDTO {
                    email: format!("user{}@example.com", x),
                    name: format!("user{}", x),
                    gender: x % 2 == 0,
                    age: x * 10,
                    address: "US".to_string(),
                    phone: format!("012345678{}", x),
                },
                pool,
            ) {
                return Err(format!("{:?}", err.error_response()));
            }
        }

        Ok(())
    }

    async fn get_people_in_db(pool: &Pool) -> Result<Vec<Person>, String> {
        match address_book_service::find_all(pool) {
            Ok(data) => Ok(data),
            Err(err) => Err(format!("{:?}", err.error_response())),
        }
    }

    #[actix_web::test]
    async fn test_mock_work() {
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

        let _app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(pool.clone()))
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        assert!(insert_mock_data(1, &pool).await.is_ok());
        assert_eq!(get_people_in_db(&pool).await.unwrap().len(), 1);
    }

    #[actix_web::test]
    async fn test_insert_ok() {
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
            .add_tenant_pool("tenant1".to_string(), pool.clone())
            .unwrap();

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        let payload = json!({
            "name": "test",
            "gender": true,
            "age": 20_i32,
            "address": "US",
            "phone": "0123456789",
            "email": "test@example.com"
        });

        match signup_and_login(&pool).await {
            Ok(token_res) => {
                let resp = test::TestRequest::post()
                    .uri("/api/address-book")
                    .insert_header(header::ContentType::json())
                    .insert_header((header::AUTHORIZATION, format!("bearer {}", token_res)))
                    .set_payload(payload.to_string())
                    .send_request(&app)
                    .await;

                assert_eq!(resp.status(), StatusCode::CREATED);
                assert_eq!(get_people_in_db(&pool).await.unwrap().len(), 1);
            }
            Err(err) => {
                unreachable!("{}", err);
            }
        };
    }

    #[actix_web::test]
    async fn test_insert_failed() {
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
            .add_tenant_pool("tenant1".to_string(), pool.clone())
            .unwrap();

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
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        let req_missing_email = json!({
            "name": "test",
            "gender": true,
            "age": 20_i32,
            "address": "US",
            "phone": "0123456789"
        });

        let req_empty = json!({});

        let req_trash_value = json!({
            "this": "is",
            "not": ["a"],
            "valid": false,
            "request": 2022
        });

        match signup_and_login(&pool).await {
            Ok(token_res) => {
                let resp_missing_email = test::TestRequest::post()
                    .uri("/api/address-book")
                    .insert_header(header::ContentType::json())
                    .insert_header((header::AUTHORIZATION, format!("bearer {}", token_res)))
                    .set_payload(req_missing_email.to_string())
                    .send_request(&app)
                    .await;

                let resp_empty = test::TestRequest::post()
                    .uri("/api/address-book")
                    .insert_header(header::ContentType::json())
                    .insert_header((header::AUTHORIZATION, format!("bearer {}", token_res)))
                    .set_payload(req_empty.to_string())
                    .send_request(&app)
                    .await;

                let resp_trash_value = test::TestRequest::post()
                    .uri("/api/address-book")
                    .insert_header(header::ContentType::json())
                    .insert_header((header::AUTHORIZATION, format!("bearer {}", token_res)))
                    .set_payload(req_trash_value.to_string())
                    .send_request(&app)
                    .await;

                assert_eq!(resp_missing_email.status(), StatusCode::BAD_REQUEST);
                assert_eq!(resp_empty.status(), StatusCode::BAD_REQUEST);
                assert_eq!(resp_trash_value.status(), StatusCode::BAD_REQUEST);
                assert_eq!(get_people_in_db(&pool).await.unwrap().len(), 0);
            }
            Err(err) => {
                unreachable!("{}", err);
            }
        };
    }

    #[actix_web::test]
    async fn test_update_ok() {
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
            .add_tenant_pool("tenant1".to_string(), pool.clone())
            .unwrap();

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
                .app_data(web::Data::new(manager))
                .wrap(actix_web::middleware::Logger::default())
                .wrap(crate::middleware::auth_middleware::Authentication)
                .wrap_fn(|req, srv| srv.call(req).map(|res| res))
                .configure(crate::config::app::config_services),
        )
        .await;

        insert_mock_data(1, &pool).await;

        let update_request = json!({
            "email": "email1@example.com",
            "name": "Nguyen Van Teo",
            "gender": false,
            "age": 10_i32,
            "address": "US",
            "phone": "0123456781"
        });

        match signup_and_login(&pool).await {
            Ok(token_res) => {
                let resp = test::TestRequest::put()
                    .uri("/api/address-book/1")
                    .insert_header(header::ContentType::json())
                    .insert_header((header::AUTHORIZATION, format!("bearer {}", token_res)))
                    .set_payload(update_request.to_string())
                    .send_request(&app)
                    .await;

                assert_eq!(
                    resp.status(),
                    StatusCode::OK,
                    "Err: {:?}",
                    to_bytes(resp.into_body()).await.unwrap()
                );

                let data_in_db = get_people_in_db(&pool).await.unwrap();
                assert_eq!(data_in_db.len(), 1);
                assert_eq!(data_in_db[0].name, "Nguyen Van Teo");
            }
            Err(err) => {
                unreachable!("{}", err);
            }
        };
    }
}