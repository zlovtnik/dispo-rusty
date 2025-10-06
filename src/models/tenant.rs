use chrono::NaiveDateTime;
use diesel::{prelude::*, Identifiable, Insertable, Queryable, AsChangeset, result};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{
    schema::tenants::{self, dsl::*},
    models::filters::TenantFilter,
};

#[derive(Clone, Identifiable, Queryable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub db_url: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct TenantDTO {
    pub id: String,
    pub name: String,
    pub db_url: String,
}

#[derive(AsChangeset, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct UpdateTenant {
    pub name: Option<String>,
    pub db_url: Option<String>,
}

impl Tenant {
    pub fn validate_db_url(url: &str) -> QueryResult<()> {
        // Validate URL format
        Url::parse(url).map_err(|_| result::Error::DatabaseError(
            result::DatabaseErrorKind::Unknown,
            Box::new("Invalid database URL format".to_string()),
        ))?;

        Ok(())
    }

    pub fn create(dto: TenantDTO, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        Self::validate_db_url(&dto.db_url)?;
        diesel::insert_into(tenants).values(&dto).get_result(conn)
    }

    pub fn update(id_: &str, dto: UpdateTenant, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        if let Some(ref url) = dto.db_url {
            Self::validate_db_url(url)?;
        }
        diesel::update(tenants.find(id_)).set(&dto).get_result(conn)
    }

    pub fn delete(id_: &str, conn: &mut crate::config::db::Connection) -> QueryResult<usize> {
        diesel::delete(tenants.find(id_)).execute(conn)
    }

    pub fn find_by_id(t_id: &str, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        tenants.filter(id.eq(t_id)).get_result::<Tenant>(conn)
    }

    /// Loads tenant records from the database with optional limit to prevent OOM.
    ///
    /// # Parameters
    ///
    /// - `limit`: Optional maximum number of records to return (defaults to 1000).
    ///
    /// # Returns
    ///
    /// A `Vec<Tenant>` containing up to the limit of records from the `tenants` table.
    ///
    /// # Examples
    ///
    /// ```
    /// let all = Tenant::list_all(&mut conn).unwrap();
    /// assert!(all.len() >= 0);
    ///
    /// // Limit to 100 records
    /// let limited = Tenant::list_all_with_limit(Some(100), &mut conn).unwrap();
    /// ```
    ///
    /// # Warning
    ///
    /// This method loads unlimited records by default for backwards compatibility,
    /// but a hard maximum of 10000 records is enforced to prevent OOM. Consider
    /// using paginated methods for better performance.
    pub fn list_all(conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        const MAX_LIMIT: i64 = 10000;
        tenants.limit(MAX_LIMIT).load::<Tenant>(conn)
    }

    /// Loads tenant records from the database with a configurable limit.
    ///
    /// # Parameters
    ///
    /// - `limit`: Optional maximum number of records to return (defaults to 1000, max 10000).
    ///
    /// # Returns
    ///
    /// A `Vec<Tenant>` containing up to the limit of records from the `tenants` table.
    pub fn list_all_with_limit(limit: Option<i64>, conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        let limit = limit.unwrap_or(1000).min(10000);
        tenants.limit(limit).load::<Tenant>(conn)
    }

    /// Fetches a page of tenants and the total number of tenant records.
    ///
    /// The `offset` and `limit` parameters control the page window applied at the database level:
    /// `offset` is the number of records to skip and `limit` is the maximum number of records to return.
    ///
    /// # Returns
    ///
    /// A tuple where the first element is a vector of `Tenant` records for the requested page and the second
    /// element is the total count of tenants across the table.
    ///
    /// # Examples
    ///
    /// ```
    /// // assume `conn` is a mutable database connection: &mut crate::config::db::Connection
    /// let (page, total) = Tenant::list_paginated(0, 10, &mut conn).expect("query failed");
    /// assert!(total >= page.len() as i64);
    /// ```
    pub fn list_paginated(offset: i64, limit: i64, conn: &mut crate::config::db::Connection) -> QueryResult<(Vec<Tenant>, i64)> {
        let total = tenants.count().get_result::<i64>(conn)?;
        let results = tenants.offset(offset).limit(limit).load::<Tenant>(conn)?;
        Ok((results, total))
    }

    /// Finds a tenant by its exact name.
    ///
    /// # Returns
    ///
    /// The matching `Tenant`, if one exists.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// let mut conn = crate::config::db::establish_connection();
    /// let tenant = Tenant::find_by_name("acme", &mut conn).unwrap();
    /// assert_eq!(tenant.name, "acme");
    /// ```
    pub fn find_by_name(name_: &str, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        tenants.filter(name.eq(name_)).first::<Tenant>(conn)
    }

    /// Validates a TenantDTO's `id` and `name` according to application rules.
    ///
    /// Checks that `id` is not empty and contains only alphanumeric characters, dashes, or underscores,
    /// and that `name` is not empty.
    ///
    /// # Parameters
    ///
    /// - `dto`: The `TenantDTO` to validate.
    ///
    /// # Returns
    ///
    /// `Ok(())` if validation passes, `Err(diesel::result::Error)` with a human-readable message describing the first
    /// validation failure otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let dto = TenantDTO { id: "tenant_1".into(), name: "Tenant One".into(), db_url: "postgres://user:pass@localhost/db".into() };
    /// assert!(Tenant::validate_tenant_dto(&dto).is_ok());
    /// ```
    pub fn validate_tenant_dto(dto: &TenantDTO) -> QueryResult<()> {
        // Validate ID: non-empty, alphanumeric + dashes/underscores
        if dto.id.trim().is_empty() {
            return Err(result::Error::DatabaseError(
                result::DatabaseErrorKind::Unknown,
                Box::new("Tenant ID cannot be empty".to_string()),
            ));
        }

        if !dto.id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err(result::Error::DatabaseError(
                result::DatabaseErrorKind::Unknown,
                Box::new("Tenant ID must contain only alphanumeric characters, dashes, and underscores".to_string()),
            ));
        }

        // Validate name: non-empty
        if dto.name.trim().is_empty() {
            return Err(result::Error::DatabaseError(
                result::DatabaseErrorKind::Unknown,
                Box::new("Tenant name cannot be empty".to_string()),
            ));
        }

        Ok(())
    }

    /// Inserts multiple tenants in a single database transaction after validating each DTO's `db_url`.
    ///
    /// Each `TenantDTO`'s `db_url` is validated before insertion. If any validation or insertion fails, the entire transaction is rolled back.
    ///
    /// # Returns
    ///
    /// `usize` number of rows inserted.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::models::tenant::{Tenant, TenantDTO};
    ///
    /// let dtos = vec![TenantDTO { id: "t1".into(), name: "Tenant 1".into(), db_url: "postgres://user:pass@localhost/db".into() }];
    /// let mut conn = crate::config::db::establish_connection();
    /// let inserted = Tenant::batch_create(dtos, &mut conn).unwrap();
    /// assert_eq!(inserted, 1);
    /// ```
    pub fn batch_create(dtos: Vec<TenantDTO>, conn: &mut crate::config::db::Connection) -> QueryResult<usize> {
        conn.transaction(|tx_conn| {
            for dto in &dtos {
                Self::validate_tenant_dto(dto)?;
                Self::validate_db_url(&dto.db_url)?;
            }
            diesel::insert_into(tenants).values(&dtos).execute(tx_conn)
        })
    }

    /// Filters tenants using a set of field-based conditions and optional DB-level pagination.
    ///
    /// Supported filter fields:
    /// - `id`, `name`, `db_url` with operators `contains` and `equals`.
    /// - `created_at`, `updated_at` with operators `gt`, `gte`, `lt`, `lte`, and `equals`. Date/time values must use ISO-like format `YYYY-MM-DDTHH:MM:SS.sssZ` (e.g. `2023-12-25T10:00:00.000Z`).
    /// Unknown fields or unsupported operators are ignored.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use crate::models::tenant::Tenant;
    /// use crate::models::tenant::TenantFilter;
    /// // let mut conn = ...; // obtain a mutable DB connection
    /// // let filter = TenantFilter { /* filters and optional pagination */ };
    /// // let tenants = Tenant::filter(filter, &mut conn).expect("query failed");
    /// ```
    pub fn filter(filter: TenantFilter, conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        let mut query = tenants::table.into_boxed();

        for field_filter in &filter.filters {
            match field_filter.field.as_str() {
                "id" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(id.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(id.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for id
                    }
                }
                "name" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(name.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(name.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for name
                    }
                }
                "db_url" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(db_url.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(db_url.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for db_url
                    }
                }
                "created_at" => {
                    // Parse the value as datetime
                    let dt = NaiveDateTime::parse_from_str(&field_filter.value, "%Y-%m-%dT%H:%M:%S%.fZ")
                        .map_err(|_| result::Error::DatabaseError(
                            result::DatabaseErrorKind::Unknown,
                            Box::new(format!("Invalid datetime format for field '{}': '{}'. Expected ISO format like '2023-12-25T10:00:00.000Z'", field_filter.field, field_filter.value)),
                        ))?;
                    match field_filter.operator.as_str() {
                        "gt" => {
                            query = query.filter(created_at.gt(dt));
                        }
                        "gte" => {
                            query = query.filter(created_at.ge(dt));
                        }
                        "lt" => {
                            query = query.filter(created_at.lt(dt));
                        }
                        "lte" => {
                            query = query.filter(created_at.le(dt));
                        }
                        "equals" => {
                            query = query.filter(created_at.eq(dt));
                        }
                        _ => {} // Ignore unsupported operators for dates
                    }
                }
                "updated_at" => {
                    // Parse the value as datetime
                    let dt = NaiveDateTime::parse_from_str(&field_filter.value, "%Y-%m-%dT%H:%M:%S%.fZ")
                        .map_err(|_| result::Error::DatabaseError(
                            result::DatabaseErrorKind::Unknown,
                            Box::new(format!("Invalid datetime format for field '{}': '{}'. Expected ISO format like '2023-12-25T10:00:00.000Z'", field_filter.field, field_filter.value)),
                        ))?;
                    match field_filter.operator.as_str() {
                        "gt" => {
                            query = query.filter(updated_at.gt(dt));
                        }
                        "gte" => {
                            query = query.filter(updated_at.ge(dt));
                        }
                        "lt" => {
                            query = query.filter(updated_at.lt(dt));
                        }
                        "lte" => {
                            query = query.filter(updated_at.le(dt));
                        }
                        "equals" => {
                            query = query.filter(updated_at.eq(dt));
                        }
                        _ => {} // Ignore unsupported operators for dates
                    }
                }
                _ => {} // Ignore unknown fields
            }
        }

        // Apply pagination at DB level if specified
        if let Some(page_size) = &filter.page_size {
            const MAX_PAGE_SIZE: i64 = 10000;
            const MAX_CURSOR: i64 = i64::MAX / MAX_PAGE_SIZE;

            let cursor = filter.cursor.unwrap_or(0) as i64;
            let page_size = (*page_size as i64).min(MAX_PAGE_SIZE);

            if cursor < 0 {
                return Err(result::Error::DatabaseError(
                    result::DatabaseErrorKind::Unknown,
                    Box::new("Cursor cannot be negative".to_string()),
                ));
            }

            if cursor > MAX_CURSOR {
                return Err(result::Error::DatabaseError(
                    result::DatabaseErrorKind::Unknown,
                    Box::new(format!("Cursor too large, maximum allowed: {}", MAX_CURSOR)),
                ));
            }

            let offset = cursor.checked_mul(page_size).ok_or_else(|| {
                result::Error::DatabaseError(
                    result::DatabaseErrorKind::Unknown,
                    Box::new("Offset calculation would overflow".to_string()),
                )
            })?.min(i64::MAX - page_size); // Ensure offset doesn't cause issues with limit

            if page_size == 0 {
                return Err(result::Error::DatabaseError(
                    result::DatabaseErrorKind::Unknown,
                    Box::new("Page size cannot be zero".to_string()),
                ));
            }

            query = query.limit(page_size as i64).offset(offset);
        }

        let results = query.load::<Tenant>(conn)?;

        Ok(results)
    }
}
