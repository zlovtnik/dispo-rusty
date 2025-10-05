use actix_web::{web, HttpResponse};
use serde::Serialize;
use log::info;
use std::collections::HashMap;
use diesel::prelude::*;


use crate::{
    config::db::{Pool as DatabasePool, TenantPoolManager},
    models::tenant::{Tenant, TenantDTO, UpdateTenant},
    models::filters::TenantFilter,
    models::user::User,
    constants,
    models::response::ResponseBody,
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

/// Get system-wide statistics and tenant status (admin only)
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
        status_map.insert(tenant.id.clone(), connected);
    }

    Ok(HttpResponse::Ok().json(status_map))
}

// CRUD operations for tenants

/// Get all tenants
pub async fn find_all(
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenants = Tenant::list_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to fetch tenants: {}", e),
    })?;

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenants)))
}

/// Get tenants with filters
pub async fn filter(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    // Parse filters from query parameters
    let mut filters = Vec::new();
    let mut cursor = None;
    let mut page_size = None;

    for (key, value) in query.iter() {
        if key.starts_with("filters[") && key.ends_with("][field]") {
            // Extract index from filters[index][field]
            if let Some(index_str) = key.strip_prefix("filters[").and_then(|s| s.strip_suffix("][field]")) {
                if let Ok(index) = index_str.parse::<usize>() {
                    // Get corresponding operator and value
                    let operator_key = format!("filters[{}][operator]", index);
                    let value_key = format!("filters[{}][value]", index);
                    if let (Some(operator), Some(field_val)) = (query.get(&operator_key), query.get(&value_key)) {
                        filters.push(crate::models::filters::FieldFilter {
                            field: value.clone(),
                            operator: operator.clone(),
                            value: field_val.clone(),
                        });
                    }
                }
            }
        } else if key == "cursor" {
            cursor = value.parse().ok();
        } else if key == "page_size" {
            page_size = value.parse().ok();
        }
    }

    let filter = TenantFilter {
        filters,
        cursor,
        page_size,
    };

    let tenants = Tenant::filter(filter, &mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to filter tenants: {}", e),
    })?;

    Ok(HttpResponse::Ok().json(tenants))
}

/// Get tenant by ID
pub async fn find_by_id(
    id: web::Path<String>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenant = Tenant::find_by_id(&id, &mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to find tenant: {}", e),
    })?;

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Create new tenant
pub async fn create(
    tenant_dto: web::Json<TenantDTO>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenant = Tenant::create(tenant_dto.0, &mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to create tenant: {}", e),
    })?;

    Ok(HttpResponse::Created().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Update tenant
pub async fn update(
    id: web::Path<String>,
    update_dto: web::Json<UpdateTenant>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenant = Tenant::update(&id, update_dto.0, &mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to update tenant: {}", e),
    })?;

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Delete tenant
pub async fn delete(
    id: web::Path<String>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    Tenant::delete(&id, &mut conn).map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to delete tenant: {}", e),
    })?;

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, constants::EMPTY)))
}
