use actix_web::web;
use log::info;
use std::sync::Once;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::api::*;

static LOG_ONCE: Once = Once::new();

/// Register application HTTP routes on the given Actix-web ServiceConfig and emit a one-time log summary of available routes.
///
/// This configures root and `/api` scoped routes (including `/api/auth`, `/api/address-book`, and `/api/admin/tenant`) and logs a timestamped summary the first time it is called.
///
/// # Examples
///
/// ```
/// use actix_web::{App, test};
///
/// // Initialize an Actix test service that applies the route configuration.
/// let app = test::init_service(App::new().configure(crate::config_services));
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

/// Registers API endpoints and mounts their sub-scopes on the given service configuration.
///
/// Adds standalone handlers under `/api` (ping, health, logs) and mounts the following sub-scopes:
/// `/auth`, `/address-book`, and `/admin`, each configured by their respective configurators.
///
/// # Examples
///
/// ```
/// use actix_web::web;
///
/// // Typically used when building the app routes:
/// // App::new().service(web::scope("/api").configure(configure_api_routes));
/// web::scope("/api").configure(configure_api_routes);
/// ```
fn configure_api_routes(cfg: &mut web::ServiceConfig) {
    // Standalone routes in /api
    cfg.service(ping_controller::ping);
    cfg.service(health_controller::health);
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
}

/// Registers authentication routes on the provided service configuration.
///
/// Adds the following endpoints under the current scope:
/// - `POST /signup` -> `account_controller::signup`
/// - `POST /login` -> `account_controller::login`
/// - `POST /logout` -> `account_controller::logout`
/// - `POST /refresh` -> `account_controller::refresh`
/// - `GET  /me` -> `account_controller::me`
///
/// # Examples
///
/// ```
/// use actix_web::web;
///
/// // Mount under an `/auth` scope:
/// // web::scope("/auth").configure(configure_auth_routes);
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

/// Registers address-book HTTP endpoints on the given service configuration.

///

/// The following routes are added to the current scope:

/// - GET  ""           -> `address_book_controller::find_all`

/// - POST ""           -> `address_book_controller::insert`

/// - GET  "/{id}"      -> `address_book_controller::find_by_id`

/// - PUT  "/{id}"      -> `address_book_controller::update`

/// - DELETE "/{id}"    -> `address_book_controller::delete`

/// - GET  "/filter"    -> `address_book_controller::filter`

///

/// # Examples

///

/// ```rust

/// use actix_web::web;

///

/// // Mounts the address-book routes at "/api/address-book"

/// let cfg = &mut web::ServiceConfig::new();

/// // In actual server setup you'd call:

/// // cfg.service(web::scope("/api").service(web::scope("/address-book").configure(configure_address_book_routes)));

/// // Here we demonstrate the configure call directly:

/// configure_address_book_routes(cfg);

/// ```
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

/// Adds the tenant-related admin route scope to the provided service configuration.
///
/// This configures a nested "/tenant" scope and delegates its route registrations to
/// `configure_tenant_admin_routes`, intended to be mounted under an admin scope (e.g. "/admin").
///
/// # Examples
///
/// ```
/// use actix_web::web;
///
/// // inside app configuration:
/// // web::scope("/admin").configure(configure_admin_routes);
/// let cfg = &mut web::ServiceConfig::new();
/// configure_admin_routes(cfg);
/// ```
fn configure_admin_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/tenant")
            .configure(configure_tenant_admin_routes),
    );
}

/// Register tenant-admin HTTP routes on the provided Actix `ServiceConfig`.
///
/// This function adds three GET endpoints under the current scope:
/// - `GET /stats` -> `tenant_controller::get_system_stats`
/// - `GET /health` -> `tenant_controller::get_tenant_health`
/// - `GET /status` -> `tenant_controller::get_tenant_status`
///
/// # Examples
///
/// ```
/// use actix_web::{web, App};
///
/// // Mount under a scope (e.g., "/api/admin/tenant") to expose the tenant admin routes
/// let app = App::new().service(web::scope("/api/admin/tenant").configure(configure_tenant_admin_routes));
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