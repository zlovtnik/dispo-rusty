use chrono::NaiveDateTime;
use diesel::{prelude::*, result, AsChangeset, Identifiable, Insertable, Queryable};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{
    models::filters::TenantFilter,
    schema::tenants::{self, dsl::*},
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
    /// Validates that the provided string is a well-formed URL suitable for a database connection.
    ///
    /// # Examples
    ///
    /// ```
    /// // Check a valid URL
    /// assert!(Tenant::validate_db_url("postgres://user:pass@localhost/db").is_ok());
    ///
    /// // Check an invalid URL
    /// assert!(Tenant::validate_db_url("not-a-valid-url").is_err());
    /// ```
    pub fn validate_db_url(url: &str) -> QueryResult<()> {
        // Validate URL format
        Url::parse(url).map_err(|_| {
            result::Error::DatabaseError(
                result::DatabaseErrorKind::Unknown,
                Box::new("Invalid database URL format".to_string()),
            )
        })?;

        Ok(())
    }

    /// Creates a new tenant from the provided DTO after validating its database URL.
    ///
    /// Returns the inserted `Tenant` as stored in the database.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use crate::models::TenantDTO;
    /// # use crate::models::Tenant;
    /// let dto = TenantDTO {
    ///     id: "tenant_1".into(),
    ///     name: "Tenant One".into(),
    ///     db_url: "postgres://user:pass@localhost/tenant_db".into(),
    /// };
    /// let mut conn = crate::config::db::establish_connection();
    /// let tenant = Tenant::create(dto, &mut conn).unwrap();
    /// assert_eq!(tenant.id, "tenant_1");
    /// ```
    pub fn create(dto: TenantDTO, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        Self::validate_db_url(&dto.db_url)?;
        diesel::insert_into(tenants).values(&dto).get_result(conn)
    }

    /// Updates the tenant identified by `id_` with the provided fields.
    ///
    /// If `dto.db_url` is `Some`, the URL is validated before applying the update.
    /// `dto`'s `None` fields are left unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// let dto = UpdateTenant { name: Some("New Name".into()), db_url: None };
    /// let updated = Tenant::update("tenant-123", dto, &mut conn).unwrap();
    /// assert_eq!(updated.id, "tenant-123");
    /// ```
    ///
    /// Returns the updated `Tenant` on success.
    pub fn update(
        id_: &str,
        dto: UpdateTenant,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<Tenant> {
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

    /// Loads tenants up to an enforced maximum; errors if the total tenant count exceeds 10,000.
    ///
    /// This function first counts tenants and returns an error if the total exceeds the hard limit
    /// of 10,000. If the total is within the limit, it loads and returns up to 10,000 tenant records.
    ///
    /// # Errors
    ///
    /// Returns a `DatabaseError` when the total tenant count is greater than 10,000 and suggests
    /// using paginated methods instead.
    ///
    /// # Examples
    ///
    /// ```
    /// let all = Tenant::list_all(&mut conn).unwrap();
    /// assert!(all.len() <= 10_000);
    /// ```
    pub fn list_all(conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        const MAX_LIMIT: i64 = 10000;

        // Check total count first
        let total_count: i64 = tenants.count().get_result(conn)?;

        if total_count > MAX_LIMIT {
            return Err(diesel::result::Error::DatabaseError(
                diesel::result::DatabaseErrorKind::Unknown,
                Box::new(format!(
                    "Tenant count ({}) exceeds maximum limit ({}). Use paginated methods instead.",
                    total_count, MAX_LIMIT
                )),
            ));
        }

        tenants.limit(MAX_LIMIT).load::<Tenant>(conn)
    }

    /// Loads tenant records with an optional limit; defaults to 1,000 and is capped at 10,000.
    ///
    /// The `limit` value, if provided, will be clamped to a maximum of 10,000. If `None` is
    /// supplied, a default limit of 1,000 is used.
    ///
    /// # Examples
    ///
    /// ```
    /// // `conn` should be a mutable database connection from your application's DB layer.
    /// let tenants = crate::models::tenant::Tenant::list_all_with_limit(Some(50), &mut conn)?;
    /// assert!(tenants.len() <= 50);
    /// ```
    pub fn list_all_with_limit(
        limit: Option<i64>,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<Vec<Tenant>> {
        let limit = limit.unwrap_or(1000).min(10000);
        tenants.limit(limit).load::<Tenant>(conn)
    }

    /// Fetches a page of tenants and the total tenant count.
    ///
    /// The `offset` and `limit` parameters control the page window applied at the database level:
    /// `offset` is the number of records to skip and `limit` is the maximum number of records to return.
    ///
    /// # Returns
    ///
    /// A tuple where the first element is a `Vec<Tenant>` for the requested page and the second element is the total count of tenants.
    ///
    /// # Examples
    ///
    /// ```rust
    /// // assume `conn` is a mutable database connection: &mut crate::config::db::Connection
    /// let (page, total) = Tenant::list_paginated(0, 10, &mut conn).expect("query failed");
    /// assert!(total >= page.len() as i64);
    /// ```
    pub fn list_paginated(
        offset: i64,
        limit: i64,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<(Vec<Tenant>, i64)> {
        let total = tenants.count().get_result::<i64>(conn)?;
        let results = tenants.offset(offset).limit(limit).load::<Tenant>(conn)?;
        Ok((results, total))
    }

    /// Retrieves the tenant that exactly matches the provided name.
    ///
    /// # Returns
    ///
    /// `Tenant` matching the provided name.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut conn = crate::config::db::establish_connection();
    /// let tenant = Tenant::find_by_name("acme", &mut conn).unwrap();
    /// assert_eq!(tenant.name, "acme");
    /// ```
    pub fn find_by_name(
        name_: &str,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<Tenant> {
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

        if !dto
            .id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            return Err(result::Error::DatabaseError(
                result::DatabaseErrorKind::Unknown,
                Box::new(
                    "Tenant ID must contain only alphanumeric characters, dashes, and underscores"
                        .to_string(),
                ),
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

    /// Inserts multiple tenants in a single database transaction after validating each DTO.
    ///
    /// Each `TenantDTO` is validated (ID and name) and its `db_url` is validated; if any validation or insertion fails, the entire transaction is rolled back.
    ///
    /// # Returns
    ///
    /// Number of rows inserted.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::models::tenant::{Tenant, TenantDTO};
    /// let dtos = vec![TenantDTO {
    ///     id: "t1".into(),
    ///     name: "Tenant 1".into(),
    ///     db_url: "postgres://user:pass@localhost/db".into(),
    /// }];
    /// let mut conn = crate::config::db::establish_connection();
    /// let inserted = Tenant::batch_create(dtos, &mut conn).unwrap();
    /// assert_eq!(inserted, 1);
    /// ```
    pub fn batch_create(
        dtos: Vec<TenantDTO>,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<usize> {
        conn.transaction(|tx_conn| {
            for dto in &dtos {
                Self::validate_tenant_dto(dto)?;
                Self::validate_db_url(&dto.db_url)?;
            }
            diesel::insert_into(tenants).values(&dtos).execute(tx_conn)
        })
    }

    /// Filters tenants using field-based conditions and optional database-level pagination.
    ///
    /// Supported fields:
    /// - `id`, `name`, `db_url`: operators `contains` and `equals`.
    /// - `created_at`, `updated_at`: operators `gt`, `gte`, `lt`, `lte`, and `equals`. Date/time values must use ISO-like format `YYYY-MM-DDTHH:MM:SS.sssZ` (for example `2023-12-25T10:00:00.000Z`).
    ///
    /// Unknown fields or unsupported operators are ignored. When `filter.page_size` is provided, the function applies a database `LIMIT`/`OFFSET` using the provided `cursor` and enforces limits: maximum page size 10,000, non-negative cursor, and overflow-safe offset calculation. The function returns a Diesel `DatabaseError` if a date value cannot be parsed or if pagination parameters violate the constraints (e.g., negative cursor, cursor too large, page size zero, or offset overflow).
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// use crate::models::tenant::{Tenant, TenantFilter, FieldFilter};
    ///
    /// // let mut conn = /* obtain a mutable DB connection */;
    /// // let filter = TenantFilter {
    /// //     filters: vec![FieldFilter { field: "name".into(), operator: "contains".into(), value: "acme".into() }],
    /// //     page_size: Some(100),
    /// //     cursor: Some(0),
    /// // };
    /// // let tenants = Tenant::filter(filter, &mut conn).expect("query failed");
    /// ```
    pub fn filter(
        filter: TenantFilter,
        conn: &mut crate::config::db::Connection,
    ) -> QueryResult<Vec<Tenant>> {
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

            let offset = cursor
                .checked_mul(page_size)
                .ok_or_else(|| {
                    result::Error::DatabaseError(
                        result::DatabaseErrorKind::Unknown,
                        Box::new("Offset calculation would overflow".to_string()),
                    )
                })?
                .min(i64::MAX - page_size); // Ensure offset doesn't cause issues with limit

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