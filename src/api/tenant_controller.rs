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

/// Collects system-wide metrics and per-tenant connection status for the admin dashboard.
///
/// The response includes total tenant and user counts, the number of tenants with a healthy
/// database connection, and a list of per-tenant status entries containing tenant id, name,
/// and `"active"` or `"inactive"` status. Database or pool acquisition failures are reported
/// as `ServiceError::InternalServerError`.
///
/// # Returns
///
/// An `HttpResponse` with a JSON-encoded `SystemStats` payload on success.
///
/// # Examples
///
/// ```
/// # use actix_web::HttpResponse;
/// # async fn example_call(pool: actix_web::web::Data<crate::DatabasePool>, manager: actix_web::web::Data<crate::TenantPoolManager>) -> Result<(), crate::ServiceError> {
/// let resp: HttpResponse = crate::api::tenant_controller::get_system_stats(pool, manager).await?;
/// // `resp` contains a JSON body matching `SystemStats`
/// # Ok(())
/// # }
/// ```
pub async fn get_system_stats(
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

/// Retrieve per-tenant health checks including each tenant's id, name, boolean status, and optional error message.
///
/// Each entry represents the result of a health probe against a tenant's database pool: `status` is `true` when a simple `SELECT 1` succeeds using the tenant's connection pool, otherwise `false` and `error_message` contains the observed failure reason.
///
/// # Examples
///
/// ```
/// use serde_json::json;
/// use crate::api::tenant_controller::TenantHealth;
///
/// let th = TenantHealth {
///     tenant_id: "tenant_123".to_string(),
///     name: "Tenant A".to_string(),
///     status: false,
///     error_message: Some("No connection pool configured".to_string()),
/// };
///
/// let serialized = serde_json::to_value(&th).unwrap();
/// assert_eq!(serialized, json!({
///     "tenant_id": "tenant_123",
///     "name": "Tenant A",
///     "status": false,
///     "error_message": "No connection pool configured"
/// }));
/// ```
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

/// Provides a mapping of tenant IDs to whether each tenant currently has an active database connection.
///
/// # Returns
///
/// A JSON object where keys are tenant IDs and values are `true` if a connection to that tenant's pool could be acquired, `false` otherwise.
///
/// # Examples
///
/// ```
/// // Example response body:
/// // {"tenant_1": true, "tenant_2": false}
/// let json = r#"{"tenant_1": true, "tenant_2": false}"#;
/// let map: std::collections::HashMap<String, bool> = serde_json::from_str(json).unwrap();
/// assert_eq!(map.get("tenant_1"), Some(&true));
/// assert_eq!(map.get("tenant_2"), Some(&false));
/// ```
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
        status_map.insert(tenant.id.clone(), connected);
    }

    Ok(HttpResponse::Ok().json(status_map))
}

// Implement User model extensions needed for stats
impl User {
    /// Count all users in the database.
    ///
    /// Performs a SQL `COUNT(*)` on the `users` table and returns the total number of user records.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::models::User;
    /// use diesel::pg::PgConnection;
    ///
    /// // `conn` is a mutable Postgres connection
    /// let mut conn: PgConnection = /* obtain connection */;
    /// let total = User::count_all(&mut conn).expect("failed to count users");
    /// assert!(total >= 0);
    /// ```
    pub fn count_all(conn: &mut PgConnection) -> QueryResult<i64> {
        use crate::schema::users::dsl::*;
        users.count().get_result(conn)
    }

    /// Counts users who currently have a non-empty login session.
    ///
    /// Counts rows in the `users` table where `login_session` is neither `NULL` nor an empty string.
    ///
    /// # Parameters
    ///
    /// - `conn`: a Postgres connection used to execute the query.
    ///
    /// # Returns
    ///
    /// `QueryResult<i64>` containing the number of users whose `login_session` is neither `NULL` nor empty.
    ///
    /// # Examples
    ///
    /// ```
    /// // Obtain a PgConnection (helper not shown).
    /// let mut conn = establish_test_connection();
    /// let count = crate::models::user::User::count_logged_in(&mut conn).unwrap();
    /// assert!(count >= 0);
    /// ```
    pub fn count_logged_in(conn: &mut PgConnection) -> QueryResult<i64> {
        use crate::schema::users::dsl::*;
        users.filter(login_session.is_not_null().and(login_session.ne(""))).count().get_result(conn)
    }
}