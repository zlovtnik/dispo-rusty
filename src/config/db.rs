use crate::error::ServiceError;
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

/// Create and configure a database connection pool for the given database URL.
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

    info!("Migrating and configuring database...");
    let manager = ConnectionManager::<Connection>::new(url);

    r2d2::Pool::builder()
        .build(manager)
        .expect("Failed to create pool.")
}

/// Creates a database connection pool for the given database URL without panicking on failure.

///

/// The function attempts to build an r2d2 connection pool for the provided PostgreSQL URL. On

/// success it returns the configured pool; on failure it returns `ServiceError::InternalServerError`

/// with a descriptive message.

///

/// # Arguments

///

/// * `url` - The database connection URL (e.g., `postgres://user:pass@host/db`).

///

/// # Returns

///

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
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to create pool: {e}"),
        })
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
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Migration failed: {e}"),
        })?;
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
}

const LOCK_POISONED_ERROR: &str = "Tenant pools lock was poisoned";

#[allow(dead_code)]
impl TenantPoolManager {
    /// Helper method to handle lock poisoning errors consistently
    fn handle_lock_poisoned_error<T>() -> Result<T, ServiceError> {
        Err(ServiceError::InternalServerError {
            error_message: LOCK_POISONED_ERROR.to_string(),
        })
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
    /// ```
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
}