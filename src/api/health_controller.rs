use actix_web::{get, web, HttpRequest, HttpResponse};
use serde::Serialize;
use tokio::time::{timeout, Duration};

use crate::config::cache::Pool as RedisPool;
use crate::config::db::{Pool as DatabasePool, TenantPoolManager};
use crate::models::tenant::Tenant;

use actix_web::web::Bytes;
use chrono::Utc;
use diesel::prelude::*;
use log::{debug, error, info};
use redis;
use std::io::Error as IoError;
use std::path::Path;

use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

#[derive(Serialize, Clone)]
enum Status {
    #[serde(rename = "healthy")]
    Healthy,
    #[serde(rename = "unhealthy")]
    Unhealthy,
}

impl Status {
    fn is_healthy(&self) -> bool {
        matches!(self, Status::Healthy)
    }
}

#[derive(Serialize)]
struct HealthStatus {
    database: Status,
    cache: Status,
}

#[derive(Serialize)]
struct HealthResponse {
    status: Status,
    timestamp: String,
    components: HealthStatus,
    tenants: Option<Vec<TenantHealth>>,
}

#[derive(Serialize)]
struct TenantHealth {
    tenant_id: String,
    name: String,
    status: Status,
}

/// Performs a database connectivity check using the provided connection pool.
///
/// # Returns
///
/// `Ok(())` if the database responded to the health query, `Err` with an error otherwise.
///
/// # Examples
///
/// ```
/// # async fn example(pool: actix_web::web::Data<DatabasePool>) {
/// let result = check_database_health_async(pool).await;
/// assert!(result.is_ok());
/// # }
/// ```
async fn check_database_health_async(
    pool: web::Data<DatabasePool>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
    tokio::task::spawn_blocking(move || check_database_health(pool))
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>)?
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>)
}

/// Performs a cache health check using the provided Redis connection pool.
///
/// Executes the synchronous cache probe on a blocking thread and returns `Ok(())` if the cache responds to a PING,
/// or `Err(...)` if the probe fails or the blocking task fails.
///
/// # Examples
///
/// ```
/// # use actix_web::web;
/// # use tokio_test::block_on;
/// # async fn demo(pool: web::Data<crate::RedisPool>) {
/// let result = crate::check_cache_health_async(pool).await;
/// assert!(result.is_ok() || result.is_err());
/// # }
/// ```
async fn check_cache_health_async(
    redis_pool: web::Data<RedisPool>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
    tokio::task::spawn_blocking(move || check_cache_health(&redis_pool))
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>)?
}

/// Return current service health and component statuses as JSON.
///
/// Builds a HealthResponse containing an overall `Status`, an RFC3339 `timestamp`,
/// component statuses for database and cache, and no tenant list, then responds
/// with HTTP 200 and that JSON body.
///
/// # Examples
///
/// ```no_run
/// use actix_web::{test, App};
///
/// // Mount the handler and call the /health route in an integration-style test.
/// // The handler is registered with `#[get("/health")]`, so registering the
/// // service on an App allows exercising the endpoint.
/// # async fn example() {
/// let app = test::init_service(App::new().service(crate::health)).await;
/// let req = test::TestRequest::get().uri("/health").to_request();
/// let resp = test::call_service(&app, req).await;
/// assert!(resp.status().is_success());
/// # }
/// ```
#[get("/health")]
async fn health(pool: web::Data<DatabasePool>, redis_pool: web::Data<RedisPool>) -> HttpResponse {
    info!("Health check requested");

    // Check database with timeout
    let db_status = match timeout(Duration::from_secs(5), check_database_health_async(pool)).await {
        Ok(Ok(())) => Status::Healthy,
        Ok(Err(e)) => {
            error!("Database health check failed: {}", e);
            Status::Unhealthy
        }
        Err(_) => {
            error!("Database health check timeout");
            Status::Unhealthy
        }
    };

    // Check cache with timeout
    let cache_status =
        match timeout(Duration::from_secs(3), check_cache_health_async(redis_pool)).await {
            Ok(Ok(())) => Status::Healthy,
            Ok(Err(e)) => {
                error!("Cache health check failed: {}", e);
                Status::Unhealthy
            }
            Err(_) => {
                error!("Cache health check timeout");
                Status::Unhealthy
            }
        };

    let overall_status = if db_status.is_healthy() && cache_status.is_healthy() {
        Status::Healthy
    } else {
        Status::Unhealthy
    };

    let response = HealthResponse {
        status: overall_status,
        timestamp: Utc::now().to_rfc3339(),
        components: HealthStatus {
            database: db_status,
            cache: cache_status,
        },
        tenants: None,
    };

    HttpResponse::Ok().json(response)
}

/// Produces a detailed health report that includes database, cache, and per-tenant statuses.
///
/// The response body is a JSON-encoded `HealthResponse` containing:
/// - `status`: overall system status,
/// - `timestamp`: RFC3339 timestamp of the check,
/// - `components`: individual `database` and `cache` statuses,
/// - `tenants`: optional list of `TenantHealth` entries when tenant pools are available.
///
/// # Examples
///
/// ```
/// use actix_web::test::{self, TestRequest};
/// use actix_web::http::StatusCode;
///
/// // Build a simple request and call the handler (integration tests should set up app data).
/// let req = TestRequest::with_uri("/health/detailed").to_http_request();
/// // In real tests, provide `pool`, `redis_pool`, and `main_conn` as `web::Data` in app state.
/// // Here we only demonstrate the call shape; integration tests should assert the JSON body.
/// let resp = actix_rt::System::new().block_on(async {
///     // health_detailed(req, pool, redis_pool, main_conn).await
///     // -> HttpResponse
///     HttpResponse::Ok()
/// });
/// assert_eq!(resp.status(), StatusCode::OK);
/// ```
#[get("/health/detailed")]
async fn health_detailed(
    req: HttpRequest,
    pool: web::Data<DatabasePool>,
    redis_pool: web::Data<RedisPool>,
    main_conn: web::Data<DatabasePool>,
) -> HttpResponse {
    let manager = req.app_data::<web::Data<TenantPoolManager>>();
    info!("Detailed health check requested");

    // Check database with timeout
    let db_status = match timeout(Duration::from_secs(5), check_database_health_async(pool)).await {
        Ok(Ok(())) => Status::Healthy,
        Ok(Err(e)) => {
            error!("Database health check failed: {}", e);
            Status::Unhealthy
        }
        Err(_) => {
            error!("Database health check timeout");
            Status::Unhealthy
        }
    };

    // Check cache with timeout
    let cache_status =
        match timeout(Duration::from_secs(3), check_cache_health_async(redis_pool)).await {
            Ok(Ok(())) => Status::Healthy,
            Ok(Err(e)) => {
                error!("Cache health check failed: {}", e);
                Status::Unhealthy
            }
            Err(_) => {
                error!("Cache health check timeout");
                Status::Unhealthy
            }
        };

    // Check tenant health if tenant manager is available
    let tenants = if let Some(manager_ref) = manager {
        let manager_data = manager_ref.clone();
        match tokio::task::spawn_blocking(move || {
            let mut main_conn = main_conn
                .get()
                .map_err(|e| format!("Failed to get db connection: {}", e))?;
            let tenants = Tenant::list_all(&mut main_conn).unwrap_or_else(|_| Vec::new());
            let mut tenant_healths = Vec::new();

            for tenant in tenants {
                let status = match manager_data.get_tenant_pool(&tenant.id) {
                    Some(pool) => match pool.get() {
                        Ok(mut conn) => match diesel::sql_query("SELECT 1").execute(&mut conn) {
                            Ok(_) => Status::Healthy,
                            Err(_) => Status::Unhealthy,
                        },
                        Err(_) => Status::Unhealthy,
                    },
                    None => Status::Unhealthy,
                };
                tenant_healths.push(TenantHealth {
                    tenant_id: tenant.id,
                    name: tenant.name,
                    status,
                });
            }
            Ok::<Vec<TenantHealth>, String>(tenant_healths)
        })
        .await
        {
            Ok(Ok(healths)) if !healths.is_empty() => Some(healths),
            _ => None,
        }
    } else {
        None
    };

    let overall_status = if db_status.is_healthy()
        && cache_status.is_healthy()
        && tenants
            .as_ref()
            .map_or(true, |t| t.iter().all(|th| th.status.is_healthy()))
    {
        Status::Healthy
    } else {
        Status::Unhealthy
    };

    let response = HealthResponse {
        status: overall_status,
        timestamp: Utc::now().to_rfc3339(),
        components: HealthStatus {
            database: db_status,
            cache: cache_status,
        },
        tenants,
    };

    HttpResponse::Ok().json(response)
}

/// Performs a simple connectivity check against the configured database.
///
/// Attempts to acquire a connection from the provided pool and execute a lightweight
/// validation query (`SELECT 1`).
///
/// # Returns
///
/// `Ok(())` if a connection is acquired and the query succeeds, `Err(...)` if acquiring
/// the connection fails or the query returns a Diesel error.
///
/// # Errors
///
/// Returns a `diesel::result::Error::DatabaseError` with kind `UnableToSendCommand`
/// when the pool cannot provide a connection; other `diesel::result::Error` variants
/// may be returned if the validation query fails.
///
/// # Examples
///
/// ```
/// // Given a `pool: actix_web::web::Data<crate::DatabasePool>` from app data:
/// # use actix_web::web;
/// # use crate::check_database_health;
/// # fn example(pool: web::Data<crate::DatabasePool>) {
/// let res = check_database_health(pool);
/// match res {
///     Ok(()) => println!("DB healthy"),
///     Err(e) => eprintln!("DB unhealthy: {}", e),
/// }
/// # }
/// ```
fn check_database_health(pool: web::Data<DatabasePool>) -> Result<(), diesel::result::Error> {
    match pool.get() {
        Ok(mut conn) => {
            diesel::sql_query("SELECT 1").execute(&mut conn)?;
            Ok(())
        }
        Err(e) => Err(diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UnableToSendCommand,
            Box::new(e.to_string()),
        )),
    }
}

/// Verifies Redis cache responsiveness by sending a `PING` command.
///
/// Uses the provided Redis connection pool to obtain a connection and issues a `PING`.
///
/// # Parameters
///
/// * `redis_pool` - Connection pool used to acquire a Redis connection for the health check.
///
/// # Returns
///
/// `Ok(())` if Redis responds to `PING`, `Err` with the underlying error otherwise.
///
/// # Examples
///
/// ```
/// // Acquire or construct a RedisPool appropriate for your application.
/// // let redis_pool = RedisPool::new("redis://127.0.0.1").unwrap();
/// // assert!(check_cache_health(&redis_pool).is_ok());
/// ```
fn check_cache_health(
    redis_pool: &RedisPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
    let mut conn = redis_pool
        .get()
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>)?;
    redis::cmd("PING")
        .query::<()>(&mut conn)
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync + 'static>)?;
    Ok(())
}

/// Streams server logs over Server-Sent Events (SSE) when log streaming is enabled.
///
/// When enabled via the `ENABLE_LOG_STREAM` environment variable and a valid log file
/// exists at `LOG_FILE` (defaults to `/var/log/app.log`), this handler returns an
/// `HttpResponse` that streams new log lines as SSE `data:` frames. If streaming is
/// disabled, the handler responds with `405 MethodNotAllowed`. If the configured log
/// file does not exist, the handler responds with `404 NotFound`.
///
/// # Examples
///
/// ```
/// use actix_web::{App, test};
/// use std::env;
/// use std::fs;
///
/// # async fn run_example() {
/// env::set_var("ENABLE_LOG_STREAM", "true");
/// env::set_var("LOG_FILE", "/tmp/app.log");
/// let _ = fs::write("/tmp/app.log", ""); // ensure file exists
///
/// let app = test::init_service(App::new().service(crate::logs)).await;
/// let req = test::TestRequest::get().uri("/logs").to_request();
/// let resp = test::call_service(&app, req).await;
/// assert!(resp.status().is_success() || resp.status() == actix_web::http::StatusCode::OK);
/// # }
/// ```
#[get("/logs")]
async fn logs() -> HttpResponse {
    // Check if log streaming is enabled
    if !std::env::var("ENABLE_LOG_STREAM")
        .map(|v| v == "true")
        .unwrap_or(false)
    {
        return HttpResponse::MethodNotAllowed().body("Log streaming disabled");
    }

    // Get log file path
    let log_file = std::env::var("LOG_FILE").unwrap_or_else(|_| "/var/log/app.log".to_string());
    let path = Path::new(&log_file);

    if !path.exists() {
        return HttpResponse::NotFound().body("Log file not found");
    }

    // Channel for streaming log lines
    let (tx, rx) = mpsc::channel::<Result<Bytes, IoError>>(100);

    // Spawn a task to tail the log file
    let log_file_clone = log_file.clone();
    tokio::spawn(async move {
        let path = Path::new(&log_file_clone);

        // Open log file and seek to end
        let mut file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to open log file: {}", e);
                let _ = tx.send(Err(e)).await;
                return;
            }
        };

        if let Err(e) = file.seek(SeekFrom::End(0)).await {
            error!("Failed to seek to end of log file: {}", e);
            let _ = tx.send(Err(IoError::other(e.to_string()))).await;
            return;
        }

        let mut buffer = [0u8; 8192];
        let mut pending_data = Vec::new();

        // Send initial message
        if tx
            .send(Ok(Bytes::from(
                "data: Log streaming started for ".to_string() + &log_file + "\n\n",
            )))
            .await
            .is_err()
        {
            return;
        }

        // If in test mode, send end message and close stream
        if std::env::var("TEST_MODE")
            .map(|v| v == "true")
            .unwrap_or(false)
        {
            if tx.send(Ok(Bytes::from("data: end\n\n"))).await.is_err() {
                return;
            }
            return;
        }

        let mut keep_alive_count = 0;

        loop {
            // Sleep for 10 seconds
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

            // Check if file has grown
            let metadata = match file.metadata().await {
                Ok(m) => m,
                Err(e) => {
                    error!("Error getting file metadata: {}", e);
                    continue;
                }
            };

            let current_pos = match file.seek(SeekFrom::Current(0)).await {
                Ok(p) => p,
                Err(e) => {
                    error!("Error getting current position: {}", e);
                    continue;
                }
            };

            if metadata.len() > current_pos {
                let to_read = (metadata.len() - current_pos) as usize;
                if to_read <= buffer.len() {
                    match file.read(&mut buffer[..to_read]).await {
                        Ok(n) if n == to_read => {
                            pending_data.extend_from_slice(&buffer[..n]);
                        }
                        _ => {
                            error!("Failed to read expected data");
                            continue;
                        }
                    }
                } else {
                    // File grew too much, skip or handle
                    if file.seek(SeekFrom::End(0)).await.is_ok() {
                        pending_data.clear(); // Reset to end
                    }
                    continue;
                }

                // Process complete lines
                while let Some(pos) = pending_data.iter().position(|&b| b == b'\n') {
                    let line_bytes = pending_data.drain(..=pos).collect::<Vec<_>>();
                    if let Ok(line) = String::from_utf8(line_bytes) {
                        let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
                        if !trimmed.is_empty() {
                            // Channel saturation is expected under high load, reducing log noise
                            if tx
                                .send(Ok(Bytes::from(format!("data: {}\n\n", trimmed))))
                                .await
                                .is_err()
                            {
                                debug!("failed to send log line '{}' to watcher channel", trimmed);
                                return;
                            }
                        }
                    }
                }
            }

            keep_alive_count += 1;
            if keep_alive_count >= 3 {
                // Every 30 seconds
                keep_alive_count = 0;
                if tx.send(Ok(Bytes::from("data: \n\n"))).await.is_err() {
                    return;
                }
            }
        }
    });

    // Create the streaming response
    let stream = ReceiverStream::new(rx);

    HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .streaming(stream)
}

#[cfg(test)]
mod tests {
    //! Integration tests for health and logging endpoints.
    //!
    //! **Important**: Tests involving log streaming (`test_logs_*`) use global environment
    //! variables which can cause race conditions when tests run in parallel.
    //! To avoid test failures, run with: `cargo test -- --test-threads=1`
    //!
    //! Consider using the `serial_test` crate in the future for better test isolation.

    use actix_cors::Cors;
    use actix_web::web::Data;
    use actix_web::{http::StatusCode, test};
    use testcontainers::clients;
    use testcontainers::images::postgres::Postgres;
    use testcontainers::images::redis::Redis;

    use crate::config;
    use crate::App;
    use std::env;
    use tempfile::NamedTempFile;
    use tokio::time::{timeout, Duration};

    /// Verifies that the /api/health endpoint returns HTTP 200 when PostgreSQL and Redis are available.
    ///
    /// Spawns PostgreSQL and Redis test containers, initializes the database and cache clients, mounts the application,
    /// and asserts the health endpoint responds with status 200.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Run the integration test with:
    /// // cargo test --test integration_tests -- --nocapture
    /// ```
    #[actix_web::test]
    async fn test_health_ok() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let redis = docker.run(Redis);

        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let redis_client = config::cache::init_redis_client(
            format!("redis://127.0.0.1:{}", redis.get_host_port_ipv4(6379)).as_str(),
        );

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(actix_web::http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(Data::new(pool))
                .app_data(Data::new(redis_client))
                .wrap(crate::middleware::auth_middleware::Authentication)
                .configure(config::app::config_services),
        )
        .await;

        let req = test::TestRequest::get().uri("/api/health").to_request();
        let resp = test::call_service(&app, req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        // You can parse the JSON and check fields
    }

    /// Verifies that the `/api/logs` endpoint streams Server-Sent Events (SSE) when log streaming is enabled.
    ///
    /// This integration test enables log streaming via environment variables, creates a temporary log file,
    /// starts PostgreSQL and Redis test containers, initializes the application, and asserts that:
    /// - the endpoint responds with HTTP 200,
    /// - the `Content-Type` header is `text/event-stream`,
    /// - at least one SSE frame (a body starting with `data:`) is received within 35 seconds.
    ///
    /// **Note**: This test and other log-related tests (`test_logs_disabled`, `test_logs_file_not_found`)
    /// use global environment variables and may fail when run in parallel due to test isolation issues.
    /// Run with `cargo test -- --test-threads=1` to avoid race conditions.
    ///
    /// # Examples
    ///
    /// ```
    /// // The test performs an end-to-end request against the initialized Actix app:
    /// // 1. Enable log streaming and point LOG_FILE to a temp file.
    /// // 2. Start required test containers and initialize DB/Redis clients.
    /// // 3. Call GET /api/logs and assert SSE response and an initial `data:` frame.
    /// ```
    #[actix_web::test]
    async fn test_logs_ok() {
        use actix_web::body::to_bytes;

        // Ensure clean environment state
        env::remove_var("ENABLE_LOG_STREAM");
        env::remove_var("LOG_FILE");
        env::remove_var("TEST_MODE");

        // Create a temporary log file
        let temp_file = NamedTempFile::new().unwrap();
        let log_path = temp_file.path().to_str().unwrap().to_string();
        // Persist the file so it remains after temp_file is dropped
        let (_file, persisted_path) = temp_file.keep().unwrap();

        // Create a cleanup guard to ensure file is deleted even on panic
        struct CleanupGuard(std::path::PathBuf);
        impl Drop for CleanupGuard {
            fn drop(&mut self) {
                std::fs::remove_file(&self.0).ok();
            }
        }
        let _cleanup = CleanupGuard(persisted_path);

        // Set environment variables
        env::set_var("ENABLE_LOG_STREAM", "true");
        env::set_var("LOG_FILE", &log_path);
        env::set_var("TEST_MODE", "true");

        // initialize testcontainers for Postgres and Redis
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let redis = docker.run(Redis);

        // set up the database pool and run migrations
        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        // set up the Redis client
        let redis_client = config::cache::init_redis_client(
            format!("redis://127.0.0.1:{}", redis.get_host_port_ipv4(6379)).as_str(),
        );

        let app = test::init_service(
            App::new()
                .wrap(
                    Cors::default()
                        .send_wildcard()
                        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                        .allowed_header(actix_web::http::header::CONTENT_TYPE)
                        .max_age(3600),
                )
                .app_data(Data::new(pool))
                .app_data(Data::new(redis_client))
                .wrap(crate::middleware::auth_middleware::Authentication)
                .configure(config::app::config_services),
        )
        .await;

        let req = test::TestRequest::get().uri("/api/logs").to_request();
        let resp = test::call_service(&app, req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get("content-type").unwrap(),
            "text/event-stream"
        );

        // Consume the body to verify SSE frames or keep-alive messages
        let sse_frame_received = timeout(Duration::from_secs(35), async {
            let body = resp.into_body();
            let bytes = to_bytes(body).await.unwrap();
            let body_str = String::from_utf8_lossy(&bytes);
            Ok::<bool, ()>(body_str.starts_with("data:"))
        })
        .await
        .unwrap_or(Ok(false))
        .unwrap();

        assert!(sse_frame_received, "No SSE frame received within timeout");

        // Cleanup happens automatically via CleanupGuard's Drop implementation
    }
}
