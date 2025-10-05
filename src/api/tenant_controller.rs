use actix_web::{web, HttpResponse};
use serde::Serialize;
use log::info;
use std::collections::HashMap;
use diesel::prelude::*;
use diesel::pg::PgConnection;

use crate::{
    config::db::{Pool as DatabasePool, TenantPoolManager},
    models::tenant::Tenant,
    models::user::User,
    error::ServiceError,
};

#[derive(Serialize)]
struct TenantStats {
    tenant_id: String,
    name: String,
    status: String,
}

#[derive(Serialize)]
struct SystemStats {
    total_tenants: i64,
    active_tenants: i32,
    total_users: i64,
    logged_in_users: i64,
    tenant_stats: Vec<TenantStats>,
}

#[derive(Serialize)]
struct TenantHealth {
    tenant_id: String,
    name: String,
    status: bool,
    error_message: Option<String>,
}

/// Get system-wide tenant status and statistics (admin only)
pub async fn get_tenant_stats(
    pool: web::Data<DatabasePool>,
    manager: web::Data<TenantPoolManager>,
) -> Result<HttpResponse, ServiceError> {
    info!("Fetching tenant statistics");

    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    // Get all tenants
    let tenants = Tenant::list_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to fetch tenants: {}", e),
    })?;

    // Get total users and logged in count (global, since no tenant_id in users)
    let total_users = User::count_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to count users: {}", e),
    })?;
    let logged_in_users = User::count_logged_in(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to count logged in users: {}", e),
    })?;

    let mut tenant_stats = Vec::new();
    let mut active_count = 0;

    for tenant in &tenants {
        // Check tenant health (database connection)
        let status = match manager.get_tenant_pool(&tenant.id) {
            Some(pool) => {
                match pool.get() {
                    Ok(_) => {
                        active_count += 1;
                        true
                    }
                    Err(_) => false,
                }
            }
            None => false,
        };

        // For per-tenant, since users don't have tenant_id, using global for simplicity
        tenant_stats.push(TenantStats {
            tenant_id: tenant.id.clone(),
            name: tenant.name.clone(),
            status: if status { "active".to_string() } else { "inactive".to_string() },
        });
    }

    let stats = SystemStats {
        total_tenants: tenants.len() as i64,
        active_tenants: active_count,
        total_users,
        logged_in_users,
        tenant_stats,
    };

    Ok(HttpResponse::Ok().json(stats))
}

/// Get detailed health status of all tenants (admin only)
pub async fn get_tenant_health(
    pool: web::Data<DatabasePool>,
    manager: web::Data<TenantPoolManager>,
) -> Result<HttpResponse, ServiceError> {
    info!("Fetching tenant health status");

    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenants = Tenant::list_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to fetch tenants: {}", e),
    })?;
    let mut tenant_health_status = Vec::new();

    for tenant in tenants {
        let (status, error_msg) = match manager.get_tenant_pool(&tenant.id) {
            Some(pool) => {
                match pool.get() {
                    Ok(mut conn) => {
                        // Simple health check: SELECT 1
                        match diesel::sql_query("SELECT 1").execute(&mut conn) {
                            Ok(_) => (true, None),
                            Err(e) => (false, Some(format!("DB query failed: {}", e))),
                        }
                    }
                    Err(e) => (false, Some(format!("Pool connection failed: {}", e))),
                }
            }
            None => (false, Some("No connection pool configured".to_string())),
        };

        tenant_health_status.push(TenantHealth {
            tenant_id: tenant.id,
            name: tenant.name,
            status,
            error_message: error_msg,
        });
    }

    Ok(HttpResponse::Ok().json(tenant_health_status))
}

/// Get overview of tenant connections (active/inactive) (admin only)
pub async fn get_tenant_status(
    pool: web::Data<DatabasePool>,
    manager: web::Data<TenantPoolManager>,
) -> Result<HttpResponse, ServiceError> {
    info!("Fetching tenant connection status");

    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenants = Tenant::list_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to fetch tenants: {}", e),
    })?;
    let mut status_map = HashMap::new();

    for tenant in tenants {
        let connected = match manager.get_tenant_pool(&tenant.id) {
            Some(pool) => pool.get().is_ok(),
            None => false,
        };
        status_map.insert(tenant.name, connected);
    }

    Ok(HttpResponse::Ok().json(status_map))
}

// Implement User model extensions needed for stats
impl User {
    pub fn count_all(conn: &mut PgConnection) -> QueryResult<i64> {
        use crate::schema::users::dsl::*;
        users.count().get_result(conn)
    }

    pub fn count_logged_in(conn: &mut PgConnection) -> QueryResult<i64> {
        use crate::schema::users::dsl::*;
        users.filter(login_session.is_not_null().and(login_session.ne(""))).count().get_result(conn)
    }
}
