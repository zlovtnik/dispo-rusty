use actix_web::{get, HttpResponse, web};
use redis::Client as RedisClient;
use serde::Serialize;

use crate::config::db::Pool;
use crate::config::cache::get_redis_connection;
use diesel::prelude::*;
use log::{error, info};
use actix_web::web::Bytes;
use std::io::Error as IoError;
use std::path::Path;
use notify::{RecommendedWatcher, Config, RecursiveMode, Watcher};
use tokio::sync::mpsc;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_stream::wrappers::ReceiverStream;

#[derive(Serialize)]
struct HealthStatus {
    database: String,
    application: String,
    cache: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    timestamp: String,
    components: HealthStatus,
}

#[get("/health")]
async fn health(pool: web::Data<Pool>, redis_client: web::Data<RedisClient>) -> HttpResponse {
    info!("Health check requested");
    let mut db_status = "healthy".to_string();
    let mut cache_status = "healthy".to_string();
    let application_status = "healthy".to_string();

    // Check database
    match check_database_health(pool) {
        Ok(_) => {},
        Err(_) => {
            error!("Database health check failed");
            db_status = "unhealthy".to_string();
        },
    }

    // Check cache
    match check_cache_health(&redis_client) {
        Ok(_) => {},
        Err(_) => {
            error!("Cache health check failed");
            cache_status = "unhealthy".to_string();
        },
    }

    let overall_status = if db_status == "healthy" && cache_status == "healthy" {
        "healthy"
    } else {
        "unhealthy"
    };

    let response = HealthResponse {
        status: overall_status.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        components: HealthStatus {
            database: db_status,
            application: application_status,
            cache: cache_status,
        },
    };

    HttpResponse::Ok().json(response)
}

fn check_database_health(pool: web::Data<Pool>) -> Result<(), diesel::result::Error> {
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

fn check_cache_health(redis_client: &RedisClient) -> Result<(), redis::RedisError> {
    let mut conn = get_redis_connection(redis_client)?;
    redis::cmd("PING").query::<()>(&mut conn)?;
    Ok(())
}

#[get("/logs")]
async fn logs() -> HttpResponse {
    // Check if log streaming is enabled
    if !matches!(std::env::var("ENABLE_LOG_STREAM"), Ok(val) if val == "true") {
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

        // Channel to receive watch events
        let (watch_tx, mut watch_rx) = mpsc::channel::<()>(1);

        // Create file watcher
        let watcher_result = RecommendedWatcher::new(
            move |_res: Result<notify::Event, notify::Error>| {
                // Send notification on any file change
                let _ = watch_tx.try_send(());
            },
            Config::default()
        );

        let mut watcher = match watcher_result {
            Ok(w) => w,
            Err(e) => {
                error!("Failed to create file watcher: {}", e);
                let _ = tx.send(Err(IoError::new(std::io::ErrorKind::Other, e.to_string()))).await;
                return;
            }
        };

        if let Err(e) = watcher.watch(path, RecursiveMode::NonRecursive) {
            error!("Failed to watch log file: {}", e);
            let _ = tx.send(Err(IoError::new(std::io::ErrorKind::Other, e.to_string()))).await;
            return;
        }

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
            let _ = tx.send(Err(IoError::new(std::io::ErrorKind::Other, e.to_string()))).await;
            return;
        }

        let mut buffer = [0u8; 2048];
        let mut pending_data = Vec::new();

        loop {
            tokio::select! {
                _ = watch_rx.recv() => {
                    // File changed, try to read new data
                    match file.read(&mut buffer).await {
                        Ok(0) => {
                            // EOF reached, possibly file was truncated or rotated
                            // Try to reopen file
                            if let Ok(new_file) = tokio::fs::File::open(&path).await {
                                file = new_file;
                                if file.seek(SeekFrom::End(0)).await.is_err() {
                                    break;
                                }
                            }
                            continue;
                        }
                        Ok(n) => {
                            pending_data.extend_from_slice(&buffer[..n]);
                            // Process complete lines
                            while let Some(pos) = pending_data.iter().position(|&b| b == b'\n') {
                                let line_bytes = pending_data.drain(..=pos).collect::<Vec<_>>();
                                if let Ok(line) = String::from_utf8(line_bytes) {
                                    let trimmed = line.trim_end_matches('\n').trim_end_matches('\r');
                                    if !trimmed.is_empty() {
                                        if tx.send(Ok(Bytes::from(format!("data: {}\n\n", trimmed)))).await.is_err() {
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            error!("Error reading log file: {}", e);
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(30)) => {
                    // Send keep-alive every 30 seconds
                    if tx.send(Ok(Bytes::from("data: \n\n"))).await.is_err() {
                        return;
                    }
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
    use actix_web::{test, http::StatusCode};
    use actix_web::web::Data;
    use actix_cors::Cors;
    use testcontainers::clients;
    use testcontainers::images::postgres::Postgres;
    use testcontainers::images::redis::Redis;

    use crate::config;
    use crate::App;

    #[actix_web::test]
    async fn test_health_ok() {
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let redis = docker.run(Redis::default());

        let pool = config::db::init_db_pool(
            format!(
                "postgres://postgres:postgres@127.0.0.1:{}/postgres",
                postgres.get_host_port_ipv4(5432)
            )
            .as_str(),
        );
        config::db::run_migration(&mut pool.get().unwrap());

        let redis_client = config::cache::init_redis_client(
            format!(
                "redis://127.0.0.1:{}",
                redis.get_host_port_ipv4(6379)
            )
            .as_str(),
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

    #[actix_web::test]
    async fn test_logs_ok() {
        // initialize testcontainers for Postgres and Redis
        let docker = clients::Cli::default();
        let postgres = docker.run(Postgres::default());
        let redis = docker.run(Redis::default());
        
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
            format!(
                "redis://127.0.0.1:{}",
                redis.get_host_port_ipv4(6379)
            )
            .as_str(),
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
    }
}
