use actix_web::{web, HttpResponse};
use diesel::prelude::*;
use log::info;
use serde::Serialize;
use std::collections::HashMap;

use crate::{
    config::db::{Pool as DatabasePool, TenantPoolManager},
    constants,
    error::ServiceError,
    models::filters::TenantFilter,
    models::response::ResponseBody,
    models::tenant::{Tenant, TenantDTO, UpdateTenant},
    models::user::User,
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

#[derive(Serialize)]
struct PaginatedTenantResponse {
    data: Vec<Tenant>,
    total: i64,
    offset: i64,
    limit: i64,
    count: i64,
    next_cursor: Option<i64>,
}

/// Return system-wide metrics and each tenant's connection status.
///
/// Gathers totals for tenants and users and produces a `SystemStats` payload that includes per-tenant
/// status ("active" or "inactive") based on whether a tenant DB pool provides a usable connection.
///
/// Returns an HTTP 200 response containing the serialized `SystemStats`.
///
/// # Examples
///
/// ```no_run
/// use actix_web::{web, HttpResponse};
///
/// // `pool` and `manager` would be provided by application setup
/// // let resp: Result<HttpResponse, _> = get_system_stats(web::Data::new(pool), web::Data::new(manager)).await;
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
    let total_users =
        User::count_all(&mut conn).map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to count users: {}", e),
        })?;
    let logged_in_users =
        User::count_logged_in(&mut conn).map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to count logged in users: {}", e),
        })?;

    let mut tenant_stats = Vec::new();
    let mut active_count = 0;

    for tenant in &tenants {
        // Check tenant health (database connection)
        let status = match manager.get_tenant_pool(&tenant.id) {
            Some(pool) => match pool.get() {
                Ok(_) => {
                    active_count += 1;
                    true
                }
                Err(_) => false,
            },
            None => false,
        };

        // For per-tenant, since users don't have tenant_id, using global for simplicity
        tenant_stats.push(TenantStats {
            tenant_id: tenant.id.clone(),
            name: tenant.name.clone(),
            status: if status {
                "active".to_string()
            } else {
                "inactive".to_string()
            },
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

/// Return a map of tenant IDs to their connection status.
///
/// Fetches all tenants and reports, for each tenant ID, whether a tenant-specific
/// connection pool is currently available and able to produce a connection. On
/// success this handler returns an HTTP 200 response with a JSON object where
/// keys are tenant IDs and values are booleans (`true` = connected, `false` = not connected).
///
/// # Examples
///
/// ```no_run
/// use actix_web::web;
/// # async fn example() {
/// let db_pool = web::Data::new(/* DatabasePool */ unimplemented!());
/// let manager = web::Data::new(/* TenantPoolManager */ unimplemented!());
/// let _ = get_tenant_status(db_pool, manager).await;
/// # }
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

// CRUD operations for tenants

/// Returns a paginated list of tenants and pagination metadata.
///
/// The HTTP response body is a `ResponseBody` wrapping a `PaginatedTenantResponse` containing:
/// - `data`: tenants for the current page,
/// - `total`: total number of matching tenants,
/// - `offset` and `limit`: pagination parameters used,
/// - `count`: number of tenants in this page,
/// - `next_cursor`: optional next offset (`i64`) when more pages are available.
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
/// use actix_web::web;
///
/// // Build a query map with cursor and limit
/// let mut q = HashMap::new();
/// q.insert("cursor".to_string(), "0".to_string());
/// q.insert("limit".to_string(), "100".to_string());
/// let query = web::Query::from(q);
///
/// // Calling the handler requires an application DatabasePool; omitted here.
/// // The handler returns an `HttpResponse` containing a `PaginatedTenantResponse`.
/// ```
pub async fn find_all(
    query: web::Query<HashMap<String, String>>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    // Parse pagination parameters
    let offset = query
        .get("offset")
        .and_then(|s| s.parse::<i64>().ok())
        .or_else(|| query.get("cursor").and_then(|s| s.parse::<i64>().ok()))
        .unwrap_or(0);

    let limit = query
        .get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(50);
    let limit = limit.min(500); // Max limit

    info!(
        "Fetching tenants with pagination - offset: {}, limit: {}",
        offset, limit
    );

    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let (tenants, total) = Tenant::list_paginated(offset, limit, &mut conn).map_err(|e| {
        ServiceError::InternalServerError {
            error_message: format!("Failed to fetch tenants: {}", e),
        }
    })?;

    let count = tenants.len();

    let response = PaginatedTenantResponse {
        data: tenants,
        total,
        offset,
        limit,
        count: count as i64,
        next_cursor: if offset + limit < total {
            Some(offset + limit)
        } else {
            None
        },
    };

    info!("Returning {} tenants out of {} total", count, total);

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, response)))
}

/// Parses query-encoded field filters and optional pagination into a `TenantFilter` and returns matching tenants.
///
/// Accepts query keys `filters[N][field]`, `filters[N][operator]`, `filters[N][value]`, `cursor`, and `page_size`. Numeric parsing failures for `cursor` and `page_size` are ignored (treated as absent).
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
///
/// let mut q = HashMap::new();
/// q.insert("filters[0][field]".to_string(), "name".to_string());
/// q.insert("filters[0][operator]".to_string(), "eq".to_string());
/// q.insert("filters[0][value]".to_string(), "acme".to_string());
/// q.insert("page_size".to_string(), "25".to_string());
///
/// // When passed to the handler, these entries will be parsed into a TenantFilter
/// // with one FieldFilter: field = "name", operator = "eq", value = "acme", and page_size = Some(25).
/// ```
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
            if let Some(index_str) = key
                .strip_prefix("filters[")
                .and_then(|s| s.strip_suffix("][field]"))
            {
                if let Ok(index) = index_str.parse::<usize>() {
                    // Get corresponding operator and value
                    let operator_key = format!("filters[{}][operator]", index);
                    let value_key = format!("filters[{}][value]", index);
                    if let (Some(operator), Some(field_val)) =
                        (query.get(&operator_key), query.get(&value_key))
                    {
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

    let tenants =
        Tenant::filter(filter, &mut conn).map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to filter tenants: {}", e),
        })?;

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenants)))
}

/// Fetches a tenant by its ID and returns it in the standard `ResponseBody`.
///
/// # Returns
///
/// `HttpResponse` with a JSON `ResponseBody` containing the tenant on success; returns
/// `ServiceError::NotFound` if no tenant matches the provided ID, or
/// `ServiceError::InternalServerError` for other failures.
///
/// # Examples
///
/// ```
/// // Handler-level example (conceptual)
/// // let resp = find_by_id(web::Path::from("tenant-123".to_string()), pool).await;
/// // assert_eq!(resp.unwrap().status(), StatusCode::OK);
/// ```
pub async fn find_by_id(
    id: web::Path<String>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenant = match Tenant::find_by_id(&id, &mut conn) {
        Ok(t) => t,
        Err(diesel::result::Error::NotFound) => {
            return Err(ServiceError::NotFound {
                error_message: format!("Tenant not found: {}", id),
            })
        }
        Err(e) => {
            return Err(ServiceError::InternalServerError {
                error_message: format!("Failed to find tenant: {}", e),
            })
        }
    };

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Create a new tenant from the provided `TenantDTO`.
///
/// On success returns an HTTP 201 Created response containing the created `Tenant` wrapped in a `ResponseBody`.
///
/// # Errors
///
/// Returns `ServiceError::BadRequest` if input validation fails.
/// Returns `ServiceError::Conflict` if a tenant with the same id or name already exists.
/// Returns `ServiceError::InternalServerError` for database connection or creation failures.
///
/// # Examples
///
/// ```
/// // Construct a TenantDTO and call the handler (framework wiring and runtime omitted).
/// let dto = TenantDTO { id: "tenant1".into(), name: "Tenant One".into(), /* ... */ };
/// // let resp = create(web::Json(dto), pool).await.unwrap();
/// // assert_eq!(resp.status(), 201);
/// ```
pub async fn create(
    tenant_dto: web::Json<TenantDTO>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    // Validate input data format and required fields
    if let Err(validation_error) = Tenant::validate_tenant_dto(&tenant_dto.0) {
        return Err(ServiceError::BadRequest {
            error_message: validation_error.to_string(),
        });
    }

    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    // Check for duplicate ID
    if Tenant::find_by_id(&tenant_dto.id, &mut conn).is_ok() {
        return Err(ServiceError::Conflict {
            error_message: format!("Tenant with ID '{}' already exists", tenant_dto.id),
        });
    }

    // Check for duplicate name
    if Tenant::find_by_name(&tenant_dto.name, &mut conn).is_ok() {
        return Err(ServiceError::Conflict {
            error_message: format!("Tenant with name '{}' already exists", tenant_dto.name),
        });
    }

    // Create the tenant
    let tenant =
        Tenant::create(tenant_dto.0, &mut conn).map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to create tenant: {}", e),
        })?;

    Ok(HttpResponse::Created().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Update a tenant identified by `id` with the provided fields.
///
/// On success returns an HTTP 200 response containing the updated tenant wrapped in `ResponseBody`.
/// Returns `ServiceError::NotFound` if the tenant does not exist, or `ServiceError::InternalServerError`
/// for other failures.
///
/// # Examples
///
/// ```no_run
/// use actix_web::web;
///
/// // In an async context:
/// // let id = web::Path::from("tenant-id".to_string());
/// // let update = web::Json(UpdateTenant { /* fields */ });
/// // let pool = web::Data::new(database_pool);
/// // let resp = update(id, update, pool).await;
/// ```
pub async fn update(
    id: web::Path<String>,
    update_dto: web::Json<UpdateTenant>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    let tenant = match Tenant::update(&id, update_dto.0, &mut conn) {
        Ok(t) => t,
        Err(diesel::result::Error::NotFound) => {
            return Err(ServiceError::NotFound {
                error_message: format!("Tenant not found: {}", id),
            })
        }
        Err(e) => {
            return Err(ServiceError::InternalServerError {
                error_message: format!("Failed to update tenant: {}", e),
            })
        }
    };

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, tenant)))
}

/// Deletes the tenant identified by `id`.
///
/// On success returns an HTTP 200 response with a standardized empty payload and message.
/// Returns `ServiceError::NotFound` if the tenant does not exist.
/// Returns `ServiceError::InternalServerError` on database or connection errors.
///
/// # Examples
///
/// ```rust
/// // Called from an async context (e.g., an Actix handler or async test)
/// // let resp = delete(web::Path::from(String::from("tenant-id")), pool).await?;
/// // assert_eq!(resp.status(), http::StatusCode::OK);
/// ```
pub async fn delete(
    id: web::Path<String>,
    pool: web::Data<DatabasePool>,
) -> Result<HttpResponse, ServiceError> {
    let mut conn = pool.get().map_err(|e| ServiceError::InternalServerError {
        error_message: format!("Failed to get db connection: {}", e),
    })?;

    match Tenant::delete(&id, &mut conn) {
        Ok(_) => (),
        Err(diesel::result::Error::NotFound) => {
            return Err(ServiceError::NotFound {
                error_message: format!("Tenant not found: {}", id),
            })
        }
        Err(e) => {
            return Err(ServiceError::InternalServerError {
                error_message: format!("Failed to delete tenant: {}", e),
            })
        }
    };

    Ok(HttpResponse::Ok().json(ResponseBody::new(constants::MESSAGE_OK, constants::EMPTY)))
}