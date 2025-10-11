use crate::error::ServiceError;
use crate::services::functional_patterns::Either;
use crate::config::functional_config::EitherConvert;
#[allow(unused_imports)]
use diesel::{
    pg::PgConnection,
    r2d2::{self, ConnectionManager},
    sql_query,
};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type Connection = PgConnection;

pub type Pool = r2d2::Pool<ConnectionManager<Connection>>;

/// Creates a database connection pool using functional composition patterns.
///
/// Uses functional error handling and composition to create pools safely.
///
/// # Examples
///
/// ```no_run
/// let pool = init_db_pool("postgres://user:password@localhost/mydb");
/// // Acquire a connection:
/// let conn = pool.get().unwrap();
/// ```
///
/// # Returns
///
/// An `r2d2` connection pool connected to the specified database URL.
pub fn init_db_pool(url: &str) -> Pool {
    use log::info;

    info!("Migrating and configuring database with functional patterns...");
    
    // Use functional composition for pool creation
    create_pool_functional(url)
        .unwrap_or_else(|error| {
            panic!("Failed to create database pool: {}", error);
        })
}

/// Functional database pool creation
fn create_pool_functional(url: &str) -> Result<Pool, String> {
    let manager = ConnectionManager::<Connection>::new(url);
    
    r2d2::Pool::builder()
        .build(manager)
        .map_err(|e| format!("Pool creation failed: {}", e))
}

/// Creates a database connection pool using functional composition with Either pattern.
///
/// This version uses Either for better error composition and handling. Returns an
/// Either type that can be composed with other functional operations.
///
/// # Arguments
///
/// * `url` - The database connection URL (e.g., `postgres://user:pass@host/db`).
///
/// # Return
///
/// Either::Right(Pool) on success, or Either::Left(String) describing the failure.
///
/// # Examples
///
/// ```no_run
/// # use crate::db::try_init_db_pool_functional;
/// let result = try_init_db_pool_functional("postgres://user:pass@localhost/db");
/// match result {
///     Either::Right(pool) => println!("Created pool successfully"),
///     Either::Left(err) => eprintln!("Failed to create pool: {}", err),
/// }
/// ```
pub fn try_init_db_pool_functional(url: &str) -> Either<String, Pool> {
    use log::info;
    info!("Attempting to create database pool with functional patterns...");
    
    match create_pool_functional(url) {
        Ok(pool) => Either::Right(pool),
        Err(err) => Either::Left(err),
    }
}

/// Creates a database connection pool for the given database URL without panicking on failure.
///
/// The function attempts to build an r2d2 connection pool for the provided PostgreSQL URL. On
/// success it returns the configured pool; on failure it returns `ServiceError::InternalServerError`
/// with a descriptie message.
///
/// # Arguments
///
/// * `url` - The database connection URL (e.g., `postgres://user:pass@host/db`).
///
/// # Return
//
/// The configured `Pool` on success, or `ServiceError::InternalServerError` describing the failure.
///
/// # Examples
///
/// ```no_run
/// # use crate::db::try_init_db_pool;
/// let result = try_init_db_pool("postgres://user:pass@localhost/db");
/// match result {
///     Ok(pool) => println!("Created pool with max size: {}", pool.state().connections()),
///     Err(err) => eprintln!("Failed to create pool: {:?}", err),
/// }

/// ```
pub fn try_init_db_pool(url: &str) -> Result<Pool, ServiceError> {
    use log::info;
    info!("Migrating and configuring database...");
    let manager = ConnectionManager::<Connection>::new(url);
    r2d2::Pool::builder()
        .build(manager)
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to create pool: {e}")))
}

/// Applies all embedded, pending database migrations to the provided PostgreSQL connection.
///
/// On success the database schema is advanced to the latest embedded migrations.
///
/// # Errors
///
/// Returns `Err(ServiceError::InternalServerError)` if applying migrations fails.
///
/// # Examples
///
/// ```
/// # use crate::run_migration;
/// # use diesel::PgConnection;
/// # fn get_conn() -> PgConnection { unimplemented!() }
/// let mut conn = get_conn();
/// run_migration(&mut conn).unwrap();
/// ```
pub fn run_migration(conn: &mut PgConnection) -> Result<(), ServiceError> {
    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|e| ServiceError::internal_server_error(format!("Migration failed: {e}")))?;
    Ok(())
}

/// Manages database connection pools for tenants, using an RwLock for concurrency.
/// On lock poisoning (when a thread panics while holding the lock), operations that return Results
/// (like `add_tenant_pool` and `remove_tenant_pool`) will return an `InternalServerError`.
/// For `get_tenant_pool`, poisoning is logged as a warning and `None` is returned.
#[derive(Clone)]
pub struct TenantPoolManager {
    pub main_pool: Pool,
    pub tenant_pools: Arc<RwLock<HashMap<String, Pool>>>,
    tenant_urls: Arc<RwLock<HashMap<String, String>>>, // Add tenant URL cache
}

const LOCK_POISONED_ERROR: &str = "Tenant pools lock was poisoned";

#[allow(dead_code)]
impl TenantPoolManager {
    /// Helper method to handle lock poisoning errors consistently
    fn handle_lock_poisoned_error<T>() -> Result<T, ServiceError> {
        Err(ServiceError::internal_server_error(
            LOCK_POISONED_ERROR.to_string(),
        ))
    }
    /// Creates a TenantPoolManager that uses `main_pool` as the primary connection pool and
    /// initializes an empty, thread-safe map for tenant-specific pools.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// use std::sync::Arc;
    /// // let main_pool = init_db_pool("postgres://user:pass@localhost/db");
    /// // let manager = TenantPoolManager::new(main_pool);
    /// ```
    pub fn new(main_pool: Pool) -> Self {
        TenantPoolManager {
            main_pool,
            tenant_pools: Arc::new(RwLock::new(HashMap::new())),
            tenant_urls: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn add_tenant_pool(&self, tenant_id: String, pool: Pool) -> Result<(), ServiceError> {
        match self.tenant_pools.write() {
            Ok(mut pools) => {
                pools.insert(tenant_id, pool);
                Ok(())
            }
            Err(_) => Self::handle_lock_poisoned_error(),
        }
    }

    pub fn get_tenant_pool(&self, tenant_id: &str) -> Option<Pool> {
        match self.tenant_pools.read() {
            Ok(pools) => pools.get(tenant_id).cloned(),
            Err(_) => {
                log::warn!("Tenant pools lock was poisoned");
                None
            }
        }
    }

    /// Access the primary database connection pool.
    ///
    /// # Returns
    ///
    /// A clone of the primary `Pool`.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// // assuming `manager` is a TenantPoolManager
    /// let pool = manager.get_main_pool();
    /// // use `pool` to obtain connections...
    /// ```
    pub fn get_main_pool(&self) -> Pool {
        self.main_pool.clone()
    }

    /// Removes and returns the connection pool for the specified tenant, if present.
    ///
    /// # Returns
    ///
    /// `Ok(Some(pool))` if a pool was removed, `Ok(None)` if no pool existed for `tenant_id`,
    /// or `Err(ServiceError::InternalServerError { error_message })` if the tenant pools lock was poisoned.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::config::db::{TenantPoolManager, init_db_pool};
    ///
    /// let main_pool = init_db_pool("postgres://user:pass@localhost/db");
    /// let manager = TenantPoolManager::new(main_pool.clone());
    ///
    /// // Assume a tenant pool was added previously.
    /// let res = manager.remove_tenant_pool("tenant_a");
    /// match res {
    ///     Ok(Some(_pool)) => println!("Removed tenant pool"),
    ///     Ok(None) => println!("No pool for given tenant"),
    ///     Err(e) => eprintln!("error: {:?}", e),
    /// }
    /// ```
    pub fn remove_tenant_pool(&self, tenant_id: &str) -> Result<Option<Pool>, ServiceError> {
        match self.tenant_pools.write() {
            Ok(mut pools) => Ok(pools.remove(tenant_id)),
            Err(_) => Self::handle_lock_poisoned_error(),
        }
    }

    // Functional programming methods for enhanced composition and error handling

    /// Get or create a tenant pool using functional error handling patterns.
    ///
    /// Uses Either for composable error handling and functional composition.
    /// Returns Either::Right(pool) on success or Either::Left(error_message) on failure.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// let result = manager.get_or_create_pool_functional("tenant_1");
    /// match result {
    ///     Either::Right(pool) => println!("Got pool successfully"),
    ///     Either::Left(err) => eprintln!("Failed to get pool: {}", err),
    /// }
    /// ```
    pub fn get_or_create_pool_functional(&self, tenant_id: &str) -> Either<String, Pool> {
        // First try to get existing pool using functional patterns
        match self.try_get_existing_pool_functional(tenant_id) {
            Either::Right(pool) => Either::Right(pool),
            Either::Left(err) => {
                // Check if this is a "not found" error vs a critical error
                if err.contains("Pool not found") {
                    // Non-fatal: pool just doesn't exist yet, create it
                    self.create_tenant_pool_functional(tenant_id)
                } else {
                    // Critical error (e.g., lock poisoning): propagate the error
                    Either::Left(format!("Critical error accessing tenant pools: {}", err))
                }
            }
        }
    }

    /// Try to get an existing pool from the cache using functional patterns
    fn try_get_existing_pool_functional(&self, tenant_id: &str) -> Either<String, Pool> {
        match self.tenant_pools.read() {
            Ok(pools) => match pools.get(tenant_id) {
                Some(pool) => Either::Right(pool.clone()),
                None => Either::Left(format!("Pool not found for tenant: {}", tenant_id)),
            },
            Err(e) => Either::Left(format!("Failed to read tenant pools: {}", e)),
        }
    }

    /// Create a new tenant pool using functional composition
    fn create_tenant_pool_functional(&self, tenant_id: &str) -> Either<String, Pool> {
        // Get tenant database URL using functional patterns
        self.get_tenant_db_url_functional(tenant_id)
            .and_then(|db_url| {
                // Create pool using functional patterns
                try_init_db_pool_functional(&db_url)
                    .and_then(|pool| {
                        // Cache the pool and handle cache failures
                        match self.cache_tenant_pool_functional(tenant_id, pool.clone()) {
                            Either::Right(_) => Either::Right(pool),
                            Either::Left(cache_err) => Either::Left(format!(
                                "Pool created but failed to cache for tenant {}: {}", 
                                tenant_id, cache_err
                            ))
                        }
                    })
            })
    }

    /// Get tenant database URL using functional patterns with caching
    fn get_tenant_db_url_functional(&self, tenant_id: &str) -> Either<String, String> {
        // First check cache
        match self.tenant_urls.read() {
            Ok(urls) => {
                if let Some(cached_url) = urls.get(tenant_id) {
                    return Either::Right(cached_url.clone());
                }
            }
            Err(_) => {
                return Either::Left("Failed to read tenant URL cache".to_string());
            }
        }

        // Not in cache, query database
        use diesel::prelude::*;
        use crate::models::tenant::Tenant;
        use crate::schema::tenants::dsl::*;

        match self.main_pool.get() {
            Ok(mut conn) => {
                match tenants
                    .filter(id.eq(tenant_id))
                    .first::<Tenant>(&mut conn)
                {
                    Ok(tenant) => {
                        let tenant_db_url = tenant.db_url;
                        
                        // Cache the URL for future use
                        match self.tenant_urls.write() {
                            Ok(mut urls) => {
                                urls.insert(tenant_id.to_string(), tenant_db_url.clone());
                            }
                            Err(_) => {
                                // Log warning but continue - we still have the URL
                                log::warn!("Failed to cache tenant URL for {}", tenant_id);
                            }
                        }
                        
                        Either::Right(tenant_db_url)
                    }
                    Err(e) => Either::Left(format!("Failed to find tenant {}: {}", tenant_id, e)),
                }
            }
            Err(e) => Either::Left(format!("Failed to get main database connection: {}", e)),
        }
    }

    /// Cache a tenant pool with functional error handling
    fn cache_tenant_pool_functional(&self, tenant_id: &str, pool: Pool) -> Either<String, ()> {
        match self.tenant_pools.write() {
            Ok(mut pools) => {
                pools.insert(tenant_id.to_string(), pool);
                Either::Right(())
            }
            Err(e) => Either::Left(format!("Failed to cache tenant pool: {}", e)),
        }
    }

    /// Validate tenant pool health using functional patterns
    pub fn validate_tenant_pool_functional(&self, tenant_id: &str) -> Either<String, bool> {
        self.try_get_existing_pool_functional(tenant_id)
            .and_then(|pool| {
                match pool.get() {
                    Ok(_conn) => Either::Right(true),
                    Err(e) => Either::Left(format!("Pool unhealthy for tenant {}: {}", tenant_id, e)),
                }
            })
    }

    /// Legacy method for backward compatibility
    pub fn get_or_create_pool(&self, tenant_id: &str) -> Result<Pool, String> {
        self.get_or_create_pool_functional(tenant_id).into_result()
    }

    /// Clear cached URL for a specific tenant (useful for tenant config updates)
    pub fn clear_tenant_url_cache(&self, tenant_id: &str) -> Result<(), ServiceError> {
        match self.tenant_urls.write() {
            Ok(mut urls) => {
                urls.remove(tenant_id);
                Ok(())
            }
            Err(_) => Self::handle_lock_poisoned_error(),
        }
    }

    /// Clear all cached URLs (useful for bulk config updates)
    pub fn clear_all_url_caches(&self) -> Result<(), ServiceError> {
        match self.tenant_urls.write() {
            Ok(mut urls) => {
                urls.clear();
                Ok(())
            }
            Err(_) => Self::handle_lock_poisoned_error(),
        }
    }

    /// Remove a tenant completely (both pool and URL cache)
    pub fn remove_tenant_completely(&self, tenant_id: &str) -> Result<Option<Pool>, ServiceError> {
        // Remove pool first
        let pool_result = self.remove_tenant_pool(tenant_id)?;
        
        // Remove cached URL (ignore errors since pool removal is more critical)
        let _ = self.clear_tenant_url_cache(tenant_id);
        
        Ok(pool_result)
    }
}
