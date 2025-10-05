use actix_web::web;
use log::info;
use std::sync::Once;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::api::*;

static LOG_ONCE: Once = Once::new();

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
        info!("  - GET /api/auth/me -> account_controller::me");
        info!("  - GET /api/address-book -> address_book_controller::find_all (list all contacts)");
        info!("  - POST /api/address-book -> address_book_controller::insert (create new contact)");
        info!("  - GET /api/address-book/{{id}} -> address_book_controller::find_by_id (get specific contact)");
        info!("  - PUT /api/address-book/{{id}} -> address_book_controller::update (update contact)");
        info!("  - DELETE /api/address-book/{{id}} -> address_book_controller::delete (delete contact)");
        info!("  - GET /api/address-book/filter -> address_book_controller::filter (filter contacts)");
        info!("  - GET /api/admin/tenant/stats -> tenant_controller::get_tenant_stats (tenant statistics)");
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

fn configure_tenant_admin_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/stats").route(web::get().to(tenant_controller::get_tenant_stats)),
    );
    cfg.service(
        web::resource("/health").route(web::get().to(tenant_controller::get_tenant_health)),
    );
    cfg.service(
        web::resource("/status").route(web::get().to(tenant_controller::get_tenant_status)),
    );
}
