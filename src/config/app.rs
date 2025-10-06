use actix_web::web;
use log::info;
use std::sync::Once;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::api::*;

static LOG_ONCE: Once = Once::new();

/// Configure application HTTP routes and register the API scope.
///
/// This registers the root health endpoint and mounts the `/api` scope with its
/// nested routes. On the first invocation this function logs a human-readable
/// summary of all registered routes and timestamps the start and end of the
/// configuration process.
///
/// # Examples
///
/// ```
/// use actix_web::App;
///
/// // Mounts the routes onto an Actix application builder.
/// let app = App::new().configure(config_services);
/// ```
pub fn config_services(cfg: &mut web::ServiceConfig) {
    LOG_ONCE.call_once(|| {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        info!("Starting route configuration at {}", timestamp);
        info!("Configuring routes...");

        info!("Route Configuration Summary:");
        info!("  - GET /health -> health_controller::health");
        info!("  - GET /api/ping -> ping_controller::ping");
        info!("  - GET /api/health -> health_controller::health");
        info!("  - GET /api/health/detailed -> health_controller::health_detailed");
        info!("  - GET /api/logs -> health_controller::logs");
        info!("  - POST /api/auth/signup -> account_controller::signup");
        info!("  - POST /api/auth/login -> account_controller::login");
        info!("  - POST /api/auth/logout -> account_controller::logout");
        info!("  - POST /api/auth/refresh -> account_controller::refresh");
        info!("  - GET /api/auth/me -> account_controller::me");
        info!("  - GET /api/address-book -> address_book_controller::find_all (list all contacts)");
        info!("  - POST /api/address-book -> address_book_controller::insert (create new contact)");
        info!("  - GET /api/address-book/{{id}} -> address_book_controller::find_by_id (get specific contact)");
        info!("  - PUT /api/address-book/{{id}} -> address_book_controller::update (update contact)");
        info!("  - DELETE /api/address-book/{{id}} -> address_book_controller::delete (delete contact)");
        info!("  - GET /api/address-book/filter -> address_book_controller::filter (filter contacts)");
        info!("  - GET /api/admin/tenant/stats -> tenant_controller::get_system_stats (system statistics)");
        info!("  - GET /api/admin/tenant/health -> tenant_controller::get_tenant_health (tenant health status)");
        info!("  - GET /api/admin/tenant/status -> tenant_controller::get_tenant_status (tenant connection status)");
        info!("  - GET /api/tenants -> tenant_controller::find_all (list all tenants)");
        info!("  - GET /api/tenants/filter -> tenant_controller::filter (filter tenants)");
        info!("  - POST /api/tenants -> tenant_controller::create (create new tenant)");
        info!("  - GET /api/tenants/{{id}} -> tenant_controller::find_by_id (get tenant by id)");
        info!("  - PUT /api/tenants/{{id}} -> tenant_controller::update (update tenant)");
        info!("  - DELETE /api/tenants/{{id}} -> tenant_controller::delete (delete tenant)");
        let end_timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        info!("Route configuration completed successfully at {}", end_timestamp);
    });

    // Root level routes
    cfg.service(health_controller::health);

    // API scope routes
    cfg.service(
        web::scope("/api")
            .configure(configure_api_routes),
    );
}

/// Registers API endpoints and sub-scopes used under the `/api` path.
///
/// This function adds standalone routes (ping and health endpoints) and configures the
/// `/auth`, `/address-book`, `/admin`, and `/tenants` sub-scopes.
///
/// # Examples
///
/// ```
/// use actix_web::{App, web};
///
/// let app = App::new().service(web::scope("/api").configure(crate::config::configure_api_routes));
/// ```
fn configure_api_routes(cfg: &mut web::ServiceConfig) {
    // Standalone routes in /api
    cfg.service(ping_controller::ping);
    cfg.service(health_controller::health);
    cfg.service(health_controller::health_detailed);
    cfg.service(health_controller::logs);

    // Auth scope routes
    cfg.service(
        web::scope("/auth")
            .configure(configure_auth_routes),
    );

    // Address book scope routes
    cfg.service(
        web::scope("/address-book")
            .configure(configure_address_book_routes),
    );

    // Admin scope routes
    cfg.service(
        web::scope("/admin")
            .configure(configure_admin_routes),
    );

    // Tenant scope routes
    cfg.service(
        web::scope("/tenants")
            .configure(configure_tenant_routes),
    );
}

/// Register authentication-related HTTP routes on the provided ServiceConfig.
///
/// The function adds routes for signup, login, logout, token refresh, and retrieving
/// the current authenticated user's information under the configured scope.
///
/// # Examples
///
/// ```
/// use actix_web::{App, web};
///
/// let app = App::new().service(
///     web::scope("/api/auth").configure(configure_auth_routes)
/// );
/// ```
fn configure_auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/signup").route(web::post().to(account_controller::signup)),
    );
    cfg.service(
        web::resource("/login").route(web::post().to(account_controller::login)),
    );
    cfg.service(
        web::resource("/logout").route(web::post().to(account_controller::logout)),
    );
    cfg.service(
        web::resource("/refresh").route(web::post().to(account_controller::refresh)),
    );
    cfg.service(
        web::resource("/me").route(web::get().to(account_controller::me)),
    );
}

fn configure_address_book_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("")
            .route(web::get().to(address_book_controller::find_all))
            .route(web::post().to(address_book_controller::insert)),
    );
    cfg.service(
        web::resource("/{id}")
            .route(web::get().to(address_book_controller::find_by_id))
            .route(web::put().to(address_book_controller::update))
            .route(web::delete().to(address_book_controller::delete)),
    );
    cfg.service(
        web::resource("/filter")
            .route(web::get().to(address_book_controller::filter)),
    );
}

fn configure_admin_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/tenant")
            .configure(configure_tenant_admin_routes),
    );
}

/// Configure tenant-related admin routes under the tenant admin scope.
///
/// Registers the following routes (relative to the scope):
/// - GET `/stats` -> `tenant_controller::get_system_stats`
/// - GET `/health` -> `tenant_controller::get_tenant_health`
/// - GET `/status` -> `tenant_controller::get_tenant_status`
///
/// # Examples
///
/// ```
/// use actix_web::{web, App};
///
/// let app = App::new().service(web::scope("/admin/tenant").configure(configure_tenant_admin_routes));
/// ```
fn configure_tenant_admin_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/stats").route(web::get().to(tenant_controller::get_system_stats)),
    );
    cfg.service(
        web::resource("/health").route(web::get().to(tenant_controller::get_tenant_health)),
    );
    cfg.service(
        web::resource("/status").route(web::get().to(tenant_controller::get_tenant_status)),
    );
}

/// Register tenant-related HTTP routes on the provided ServiceConfig.
///
/// This configures handlers for the tenant collection (GET list, POST create),
/// a filtered listing (GET /filter), and per-tenant operations by `id` (GET, PUT, DELETE).
///
/// # Examples
///
/// ```
/// use actix_web::web;
///
/// // Attach the tenant routes under the `/tenants` scope.
/// let scope = web::scope("/tenants").configure(configure_tenant_routes);
/// ```
fn configure_tenant_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("")
            .route(web::get().to(tenant_controller::find_all))
            .route(web::post().to(tenant_controller::create)),
    );
    cfg.service(
        web::resource("/filter")
            .route(web::get().to(tenant_controller::filter)),
    );
    cfg.service(
        web::resource("/{id}")
            .route(web::get().to(tenant_controller::find_by_id))
            .route(web::put().to(tenant_controller::update))
            .route(web::delete().to(tenant_controller::delete)),
    );
}