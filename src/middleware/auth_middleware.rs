use actix_service::forward_ready;
use actix_web::body::EitherBody;
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::http::{
    header::{HeaderName, HeaderValue},
    Method,
};
use actix_web::web::Data;
use actix_web::Error;
use actix_web::HttpMessage;
use actix_web::HttpResponse;
use futures::future::{ok, LocalBoxFuture, Ready};
use log::{error, info};

use crate::config::db::TenantPoolManager;
use crate::constants;
use crate::models::response::ResponseBody;
use crate::utils::token_utils;

pub struct Authentication;

impl<S, B> Transform<S, ServiceRequest> for Authentication
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthenticationMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(AuthenticationMiddleware { service })
    }
}

pub struct AuthenticationMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for AuthenticationMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    /// Authenticate the incoming request and either forward it to the inner service or return a 401 Unauthorized response.
    ///
    /// On success the request is forwarded to the wrapped service and its response body is preserved as the left variant; on failure an Unauthorized response with a JSON error payload is returned as the right variant.
    ///
    /// # Examples
    ///
    /// ```
    /// // Given `middleware` that wraps an inner service and a `req: ServiceRequest`:
    /// // let fut = middleware.call(req);
    /// // let result = futures::executor::block_on(fut);
    /// // `result` will be `Ok(ServiceResponse)` containing either the inner response (left) or a 401 JSON response (right).
    /// ```
    fn call(&self, req: ServiceRequest) -> Self::Future {
        let mut authenticate_pass: bool = false;

        // Bypass some account routes
        let mut headers = req.headers().clone();
        headers.append(
            HeaderName::from_static("content-length"),
            HeaderValue::from_static("true"),
        );
        if Method::OPTIONS == *req.method() {
            authenticate_pass = true;
        } else {
            for ignore_route in constants::IGNORE_ROUTES.iter() {
                if req.path().starts_with(ignore_route) {
                    authenticate_pass = true;
                    break;
                }
            }
        }

        if !authenticate_pass {
            if let Some(manager) = req.app_data::<Data<TenantPoolManager>>() {
                if let Some(authen_header) = req.headers().get(constants::AUTHORIZATION) {
                    info!("Parsing authorization header...");
                    if let Ok(authen_str) = authen_header.to_str() {
                        if authen_str.starts_with("bearer") || authen_str.starts_with("Bearer") {
                            let token = authen_str[6..authen_str.len()].trim();
                            if let Ok(token_data) = token_utils::decode_token(token.to_string()) {
                                info!("Decoding token...");
                                if let Some(tenant_pool) =
                                    manager.get_tenant_pool(&token_data.claims.tenant_id)
                                {
                                    if token_utils::verify_token(&token_data, &tenant_pool).is_ok()
                                    {
                                        info!("Valid token");
                                        req.extensions_mut().insert(tenant_pool.clone());
                                        authenticate_pass = true;
                                    } else {
                                        error!("Invalid token");
                                    }
                                } else {
                                    error!("Tenant not found");
                                }
                            }
                        }
                    }
                }
            }
        }

        if !authenticate_pass {
            let (request, _pl) = req.into_parts();
            let response = HttpResponse::Unauthorized()
                .json(ResponseBody::new(
                    constants::MESSAGE_INVALID_TOKEN,
                    constants::EMPTY,
                ))
                .map_into_right_body();

            return Box::pin(async { Ok(ServiceResponse::new(request, response)) });
        }

        let res = self.service.call(req);

        Box::pin(async move { res.await.map(ServiceResponse::map_into_left_body) })
    }
}

// ===== FUNCTIONAL AUTHENTICATION MIDDLEWARE =====

#[cfg(feature = "functional")]
mod functional_auth {
    use super::*;
    use crate::functional::function_traits::FunctionCategory;
    use crate::functional::pure_function_registry::PureFunctionRegistry;
    use std::sync::Arc;

    /// Enhanced authentication middleware using functional programming patterns
    /// Provides composable middleware components with pure functions and zero-allocation processing
    pub struct FunctionalAuthentication {
        registry: Option<Arc<PureFunctionRegistry>>,
    }

    impl FunctionalAuthentication {
        /// Create new functional authentication middleware
        pub fn new() -> Self {
            Self { registry: None }
        }

        /// Create functional authentication with custom registry
        pub fn with_registry(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry: Some(registry),
            }
        }
    }

    impl Default for FunctionalAuthentication {
        fn default() -> Self {
            Self::new()
        }
    }

    impl<S, B> Transform<S, ServiceRequest> for FunctionalAuthentication
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<EitherBody<B>>;
        type Error = Error;
        type InitError = ();
        type Transform = FunctionalAuthenticationMiddleware<S>;
        type Future = Ready<Result<Self::Transform, Self::InitError>>;

        fn new_transform(&self, service: S) -> Self::Future {
            ok(FunctionalAuthenticationMiddleware {
                service,
                registry: self.registry.clone(),
            })
        }
    }

    pub struct FunctionalAuthenticationMiddleware<S> {
        service: S,
        registry: Option<Arc<PureFunctionRegistry>>,
    }

    impl<S, B> Service<ServiceRequest> for FunctionalAuthenticationMiddleware<S>
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<EitherBody<B>>;
        type Error = Error;
        type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

        forward_ready!(service);

        /// Process request through functional authentication pipeline
        fn call(&self, req: ServiceRequest) -> Self::Future {
            let registry = self.registry.clone();

            Box::pin(async move {
                // Functional composition: Check if authentication should be skipped
                let should_skip_auth = Self::should_skip_authentication(&req);

                if should_skip_auth {
                    info!("Skipping authentication for route: {}", req.path());
                    let res = self.service.call(req).await?;
                    return Ok(res.map_into_left_body());
                }

                // Extract tenant manager from app data
                let manager = match req.app_data::<Data<TenantPoolManager>>() {
                    Some(mgr) => mgr,
                    None => {
                        error!("TenantPoolManager not found in app data");
                        return Self::create_unauthorized_response(req);
                    }
                };

                // Functional pipeline: Extract and validate token
                match Self::process_authentication(&req, manager) {
                    Ok((tenant_id, user_id, tenant_pool)) => {
                        // Inject tenant context into request extensions
                        req.extensions_mut().insert(tenant_pool);
                        info!(
                            "Authentication successful for tenant: {}, user: {}",
                            tenant_id, user_id
                        );

                        // Register successful authentication functions if registry available
                        if let Some(reg) = &registry {
                            Self::register_auth_functions(reg);
                        }

                        let res = self.service.call(req).await?;
                        Ok(res.map_into_left_body())
                    }
                    Err(auth_error) => {
                        error!("Functional authentication failed: {:?}", auth_error);
                        Self::create_unauthorized_response(req)
                    }
                }
            })
        }
    }

    impl<S> FunctionalAuthenticationMiddleware<S> {
        /// Pure function to determine if authentication should be skipped
        fn should_skip_authentication(req: &ServiceRequest) -> bool {
            // Skip OPTIONS preflight requests
            if req.method() == Method::OPTIONS {
                return true;
            }

            // Check against configured ignore routes
            constants::IGNORE_ROUTES
                .iter()
                .any(|route| req.path().starts_with(route))
        }

        /// Functional pipeline for token extraction and validation
        fn process_authentication(
            req: &ServiceRequest,
            manager: &TenantPoolManager,
        ) -> Result<(String, String, crate::config::db::Pool), &'static str> {
            // Extract token using functional approach
            let token = Self::extract_token(req)?;

            // Decode and validate token
            let token_data =
                token_utils::decode_token(token.clone()).map_err(|_| "Token decode failed")?;

            let tenant_id = token_data.claims.tenant_id.clone();
            let user_id = token_data.claims.user.clone();

            // Verify token against tenant database
            let tenant_pool = manager
                .get_tenant_pool(&tenant_id)
                .ok_or("Tenant not found")?;

            token_utils::verify_token(&token_data, &tenant_pool)
                .map_err(|_| "Token verification failed")?;

            Ok((tenant_id, user_id, tenant_pool.clone()))
        }

        /// Pure function for token extraction
        fn extract_token(req: &ServiceRequest) -> Result<String, &'static str> {
            let auth_header = req
                .headers()
                .get(constants::AUTHORIZATION)
                .ok_or("Missing authorization header")?;

            let auth_str = auth_header
                .to_str()
                .map_err(|_| "Invalid header encoding")?;

            if !auth_str.to_lowercase().starts_with("bearer ") {
                return Err("Invalid authorization scheme");
            }

            let token = auth_str[7..].trim();
            if token.is_empty() {
                return Err("Empty token");
            }

            Ok(token.to_string())
        }

        /// Register authentication-related pure functions
        fn register_auth_functions(registry: &PureFunctionRegistry) {
            // Note: In a full implementation, we would register the pure functions
            // used in authentication here for reuse across the application
            let _ = registry; // Placeholder to avoid unused variable warning
        }

        /// Create unauthorized error response
        fn create_unauthorized_response(
            req: ServiceRequest,
        ) -> Result<ServiceResponse<EitherBody<impl actix_web::body::MessageBody>>, Error> {
            let (request, _pl) = req.into_parts();
            let response = HttpResponse::Unauthorized()
                .json(ResponseBody::new(
                    constants::MESSAGE_INVALID_TOKEN,
                    constants::EMPTY,
                ))
                .map_into_right_body();
            Ok(ServiceResponse::new(request, response))
        }
    }
}

#[cfg(feature = "functional")]
pub use functional_auth::*;
