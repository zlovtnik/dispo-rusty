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

/// Create and configure an r2d2 PostgreSQL connection pool for the given database URL.
///
/// # Examples
///
/// ```no_run
/// let pool = init_db_pool("postgres://user:password@localhost/mydb");
/// // Acquire a connection:
/// let _conn = pool.get().unwrap();
/// ```
///
/// # Returns
///
/// The configured r2d2 connection pool connected to the specified database URL.
///
/// # Panics
///
/// Panics if the pool cannot be created.
pub fn init_db_pool(url: &str) -> Pool {
    use log::info;

    info!("Migrating and configuring database...");
    let manager = ConnectionManager::<Connection>::new(url);

    r2d2::Pool::builder()
        .build(manager)
        .expect("Failed to create pool.")
}

/// Applies all embedded, pending database migrations against the provided PostgreSQL connection.
///
/// # Panics
///
/// Panics if running the pending migrations fails.
///
/// # Examples
///
/// ```
/// // Obtain a `PgConnection`, then apply migrations:
/// // let mut conn = establish_connection(); // user-provided connection setup
/// // run_migration(&mut conn);
/// ```
pub fn run_migration(conn: &mut PgConnection) {
    conn.run_pending_migrations(MIGRATIONS).unwrap();
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

#[allow(dead_code)]
impl TenantPoolManager {
    /// Creates a TenantPoolManager that owns the provided main connection pool and an empty map for per-tenant pools.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::config::db::{TenantPoolManager, Pool};
    ///
    /// // Acquire or construct a `Pool` appropriate for your application.
    /// let main_pool: Pool = /* create pool */ unimplemented!();
    /// let manager = TenantPoolManager::new(main_pool);
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
            Err(_) => Err(ServiceError::InternalServerError {
                error_message: "Tenant pools lock was poisoned".to_string(),
            }),
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

    pub fn get_main_pool(&self) -> Pool {
        self.main_pool.clone()
    }

    /// Removes and returns the connection pool registered for a tenant, if any.
    ///
    /// Attempts to acquire a write lock on the internal tenant pool map and remove the
    /// entry for `tenant_id`.
    ///
    /// # Parameters
    ///
    /// - `tenant_id`: Identifier of the tenant whose pool should be removed.
    ///
    /// # Returns
    ///
    /// `Ok(Some(pool))` with the removed pool if a pool was present for `tenant_id`,
    /// `Ok(None)` if no pool existed for `tenant_id`, or `Err(ServiceError::InternalServerError)`
    /// if the tenant pools lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::config::db::{TenantPoolManager, Pool};
    ///
    /// // Construct a dummy Pool for example purposes (unsafe placeholder to allow compilation).
    /// let main_pool: Pool = unsafe { std::mem::MaybeUninit::zeroed().assume_init() };
    /// let manager = TenantPoolManager::new(main_pool);
    ///
    /// // Removing a non-existent tenant returns Ok(None).
    /// assert_eq!(manager.remove_tenant_pool("no-such-tenant").unwrap(), None);
    /// ```
    pub fn remove_tenant_pool(&self, tenant_id: &str) -> Result<Option<Pool>, ServiceError> {
        match self.tenant_pools.write() {
            Ok(mut pools) => Ok(pools.remove(tenant_id)),
            Err(_) => Err(ServiceError::InternalServerError {
                error_message: "Tenant pools lock was poisoned".to_string(),
            }),
        }
    }
}