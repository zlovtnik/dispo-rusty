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

    /// Authenticates an incoming `ServiceRequest`, forwarding it to the wrapped service on success or returning a 401 Unauthorized response on failure.
    ///
    /// If authentication succeeds the request is forwarded to the inner service and its response body is preserved as the left variant; if authentication fails a 401 JSON response with an error payload is returned as the right variant.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use actix_web::dev::{ServiceRequest};
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
        /// Creates a FunctionalAuthentication with no registry configured.
        ///
        /// # Examples
        ///
        /// ```
        /// let auth = FunctionalAuthentication::new();
        /// ```
        pub fn new() -> Self {
            Self { registry: None }
        }

        /// Create a `FunctionalAuthentication` configured with a supplied pure-function registry.
        ///
        /// The provided registry will be stored and used by the middleware to register
        /// pure functions when authentication succeeds.
        ///
        /// # Parameters
        ///
        /// - `registry`: an `Arc`-wrapped `PureFunctionRegistry` to associate with the middleware.
        ///
        /// # Returns
        ///
        /// A `FunctionalAuthentication` instance containing the given registry.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // Construct a registry (assumes `PureFunctionRegistry` implements `Default`).
        /// let registry = Arc::new(PureFunctionRegistry::default());
        /// let auth: FunctionalAuthentication = FunctionalAuthentication::with_registry(registry);
        /// ```
        pub fn with_registry(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry: Some(registry),
            }
        }
    }

    impl Default for FunctionalAuthentication {
        /// Create a `FunctionalAuthentication` configured with no registry.
        ///
        /// # Examples
        ///
        /// ```
        /// let auth = FunctionalAuthentication::default();
        /// // `auth` is ready to be used; it does not have a registry attached.
        /// ```
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

        /// Create a new middleware instance that wraps the provided service and carries a cloned optional registry.
        ///
        /// # Examples
        ///
        /// ```
        /// use crate::middleware::functional_auth::FunctionalAuthentication;
        ///
        /// let auth = FunctionalAuthentication::new();
        /// // `svc` represents the inner service to be wrapped; `new_transform` returns a Ready future
        /// // that will resolve to the constructed `FunctionalAuthenticationMiddleware`.
        /// let _ready = auth.new_transform(svc);
        /// ```
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

        /// Authenticate the incoming request using the functional authentication pipeline and either forward it to the inner service or produce an unauthorized response.
        ///
        /// Skips authentication for OPTIONS and configured ignore routes. On non-skipped requests, it extracts and validates a bearer token, obtains the tenant pool, injects the tenant pool into the request extensions on success, and optionally registers pure functions when a registry is present.
        ///
        /// # Returns
        /// A future that resolves to the inner service response (mapped into the left `EitherBody`) when authentication succeeds, or to a 401 Unauthorized `ServiceResponse` (right `EitherBody`) when authentication fails.
        ///
        /// # Examples
        ///
        /// ```
        /// // High-level usage (types elided for brevity):
        /// // let middleware = FunctionalAuthenticationMiddleware { service, registry: None };
        /// // let fut = middleware.call(service_request);
        /// // let response = fut.await.unwrap();
        /// ```
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
        /// Determines whether the incoming request should bypass authentication.
        ///
        /// Returns `true` when the request method is `OPTIONS` or when the request path
        /// starts with any prefix listed in `constants::IGNORE_ROUTES`.
        ///
        /// # Examples
        ///
        /// ```rust
        /// use actix_web::http::Method;
        /// use actix_web::test::TestRequest;
        /// // OPTIONS requests should be skipped
        /// let req = TestRequest::default().method(Method::OPTIONS).to_srv_request();
        /// assert!(crate::middleware::functional_auth::should_skip_authentication(&req));
        ///
        /// // Non-OPTIONS request to a non-ignored path should not be skipped
        /// let req = TestRequest::with_uri("/some/route").to_srv_request();
        /// assert!(!crate::middleware::functional_auth::should_skip_authentication(&req));
        /// ```
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

        /// Validate the Authorization token on the request and return the tenant id, user id, and tenant DB pool.
        ///
        /// Attempts to extract a bearer token from `req`, decode its claims, locate the corresponding tenant pool
        /// via `manager`, and verify the token against that tenant's pool. On success returns `(tenant_id, user_id, tenant_pool)`.
        /// On failure returns a static string describing the error condition.
        ///
        /// # Returns
        ///
        /// `Ok((tenant_id, user_id, tenant_pool))` on successful extraction, decoding, tenant lookup and verification;
        /// `Err("Token decode failed")`, `Err("Tenant not found")`, or `Err("Token verification failed")` for the respective failure cases.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use actix_web::dev::ServiceRequest;
        /// // let req: ServiceRequest = ...;
        /// // let manager: TenantPoolManager = ...;
        /// // let result = FunctionalAuthenticationMiddleware::process_authentication(&req, &manager);
        /// ```
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

        /// Extracts the bearer token from the request's `Authorization` header.
        ///
        /// Returns `Ok` with the token string when an Authorization header using the
        /// `Bearer` scheme is present and non-empty, or `Err` with a static error
        /// message describing the failure.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::http::header;
        /// use actix_web::test;
        ///
        /// let req = test::TestRequest::default()
        ///     .insert_header((header::AUTHORIZATION, "Bearer abc.def.ghi"))
        ///     .to_srv_request();
        ///
        /// let token = super::extract_token(&req).unwrap();
        /// assert_eq!(token, "abc.def.ghi");
        /// ```
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

        /// Registers authentication-related pure functions into the provided registry.
        ///
        /// This is a placeholder hook where authentication-specific pure functions
        /// (used by the functional middleware) can be registered for reuse across the
        /// application. Currently the function is a no-op and exists to reserve the
        /// registration point for future extensions.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// // Obtain or construct a `PureFunctionRegistry` appropriate for your app,
        /// // then pass a reference to this function to register authentication helpers.
        /// let registry = /* obtain PureFunctionRegistry */ unimplemented!();
        /// register_auth_functions(&registry);
        /// ```
        fn register_auth_functions(registry: &PureFunctionRegistry) {
            // Note: In a full implementation, we would register the pure functions
            // used in authentication here for reuse across the application
            let _ = registry; // Placeholder to avoid unused variable warning
        }

        /// Creates a 401 Unauthorized ServiceResponse with the standardized JSON error body for an invalid token.
        ///
        /// # Returns
        ///
        /// `Ok(ServiceResponse)` containing an `Unauthorized` JSON body with the standardized error message.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::test::TestRequest;
        /// use actix_web::dev::ServiceRequest;
        ///
        /// // Build a minimal ServiceRequest and produce the unauthorized response.
        /// let req: ServiceRequest = TestRequest::default().to_srv_request();
        /// let res = crate::middleware::auth_middleware::functional_auth::create_unauthorized_response(req);
        /// assert!(res.is_ok());
        /// let srv_res = res.unwrap();
        /// assert_eq!(srv_res.status(), actix_web::http::StatusCode::UNAUTHORIZED);
        /// ```
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