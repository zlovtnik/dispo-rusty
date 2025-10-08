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

    /// Authenticate a ServiceRequest and either forward it to the inner service or return a 401 Unauthorized response.
    ///
    /// On success, forwards the (possibly augmented) request to the wrapped service and returns its response as the left variant of `EitherBody`. On failure, returns a 401 Unauthorized JSON response as the right variant.
    ///
    /// # Returns
    ///
    /// A future resolving to a `ServiceResponse` whose body is `EitherBody<B>`: the left variant contains the inner service response when authentication succeeds, and the right variant contains a 401 Unauthorized JSON payload when authentication fails.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Given `middleware` that wraps an inner service and a `req: ServiceRequest`:
    /// // let fut = middleware.call(req);
    /// // let res = futures::executor::block_on(fut).unwrap();
    /// // match res.into_body() {
    /// //     EitherBody::Left(body) => { /* authenticated path */ },
    /// //     EitherBody::Right(body) => { /* unauthorized response */ },
    /// // }
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
        /// assert!(auth.registry.is_none());
        /// ```
        pub fn new() -> Self {
            Self { registry: None }
        }

        /// Constructs a `FunctionalAuthentication` configured to use the provided pure-function registry.
        ///
        /// The created instance will use the given `registry` to register pure functions (if present)
        /// when authentication succeeds.
        ///
        /// # Parameters
        ///
        /// - `registry`: Shared `Arc` to a `PureFunctionRegistry` whose functions will be registered during authentication.
        ///
        /// # Returns
        ///
        /// A `FunctionalAuthentication` that will use the provided registry.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // Assume PureFunctionRegistry::new() is available in scope.
        /// let registry = Arc::new(PureFunctionRegistry::new());
        /// let auth = FunctionalAuthentication::with_registry(registry.clone());
        /// ```
        pub fn with_registry(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry: Some(registry),
            }
        }
    }

    impl Default for FunctionalAuthentication {
        /// Creates a default `FunctionalAuthentication` with no function registry configured.
        ///
        /// # Examples
        ///
        /// ```
        /// let auth = FunctionalAuthentication::default();
        /// let auth2 = FunctionalAuthentication::new();
        /// // Both have no registry by default.
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

        /// Create a FunctionalAuthentication middleware that wraps the provided inner service and clones the optional function registry.
        ///
        /// The returned ready future resolves to a `FunctionalAuthenticationMiddleware` which will forward requests to `service` and use a cloned copy of `self.registry` for optional pure-function registration.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// # use futures::executor::block_on;
        /// # use crate::middleware::auth::FunctionalAuthentication;
        /// let auth = FunctionalAuthentication::new();
        /// let service = /* an inner service */ ();
        /// let middleware = block_on(auth.new_transform(service)).unwrap();
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

        /// Handles an incoming request through the middleware's functional authentication flow and forwards it to the inner service on success.
        ///
        /// The middleware skips authentication for OPTIONS and configured ignore routes. On successful authentication it inserts the tenant pool into the request's extensions, optionally registers pure functions when a registry is present, and forwards the request to the inner service. On failure or when required application data is missing it produces a 401 Unauthorized JSON response.
        ///
        /// # Returns
        ///
        /// A `Result` containing a `ServiceResponse` whose body is an `EitherBody`:
        /// - `Left` when the request was forwarded to the inner service (preserving the inner body),
        /// - `Right` when an unauthorized 401 JSON response was produced.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// # use actix_web::dev::ServiceRequest;
        /// # use std::sync::Arc;
        /// # async fn example(mut middleware_call: impl FnOnce(ServiceRequest) -> _ , req: ServiceRequest) {
        /// let fut = middleware_call(req);
        /// let _res = fut.await;
        /// # }
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
        /// Determines whether the given request should bypass authentication.
        ///
        /// Returns `true` for HTTP OPTIONS requests or when the request path starts with
        /// any entry in `constants::IGNORE_ROUTES`, `false` otherwise.
        ///
        /// # Examples
        ///
        /// ```rust
        /// # // Example usage (ignored for doctest compilation)
        /// # use actix_web::{http::Method, test::TestRequest};
        /// # use actix_web::dev::ServiceRequest;
        /// // Construct a ServiceRequest and check skipping behavior
        /// let req: ServiceRequest = TestRequest::with_uri("/health").method(Method::OPTIONS).to_srv_request();
        /// assert!(should_skip_authentication(&req));
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

        /// Processes and validates an authorization token from the request and returns the tenant context on success.
        ///
        /// Attempts to extract a bearer token from the `Authorization` header, decode it, locate the tenant's DB pool,
        /// and verify the token against that tenant's secrets. On success returns `(tenant_id, user_id, tenant_pool)`.
        ///
        /// # Errors
        ///
        /// Returns an `Err(&'static str)` with one of:
        /// - `"Missing authorization header"`, `"Invalid header encoding"`, `"Invalid authorization scheme"`, or `"Empty token"` from token extraction;
        /// - `"Token decode failed"` if token decoding fails;
        /// - `"Tenant not found"` if the tenant ID has no associated pool;
        /// - `"Token verification failed"` if token verification against the tenant pool fails.
        ///
        /// # Examples
        ///
        /// ```
        /// // Pseudocode example: requires a running Actix ServiceRequest and TenantPoolManager.
        /// # use std::sync::Arc;
        /// # use crate::middleware::auth_middleware::FunctionalAuthenticationMiddleware as M;
        /// # fn example(req: &actix_web::dev::ServiceRequest, manager: &crate::config::tenant::TenantPoolManager) {
        /// match M::process_authentication(req, manager) {
        ///     Ok((tenant_id, user_id, _pool)) => {
        ///         // use tenant_id and user_id
        ///     }
        ///     Err(err) => {
        ///         // handle unauthorized case
        ///     }
        /// }
        /// # }
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

        /// Extracts the bearer token from the `Authorization` header of the request.
        ///
        /// Returns the token string on success, or a static error message describing the failure.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::test::TestRequest;
        /// use actix_web::http::header;
        ///
        /// let req = TestRequest::default()
        ///     .insert_header((header::AUTHORIZATION, "Bearer abc.def.ghi"))
        ///     .to_srv_request();
        ///
        /// let token = extract_token(&req).unwrap();
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
        /// This function is a placeholder and does nothing; in a complete implementation it
        /// will add the pure functions used by authentication flows to `registry`.
        ///
        /// # Examples
        ///
        /// ```
        /// // Given an existing `PureFunctionRegistry` instance `reg`:
        /// // register_auth_functions(&reg);
        /// ```
        fn register_auth_functions(registry: &PureFunctionRegistry) {
            // Note: In a full implementation, we would register the pure functions
            // used in authentication here for reuse across the application
            let _ = registry; // Placeholder to avoid unused variable warning
        }

        /// Constructs a 401 Unauthorized ServiceResponse with the standardized invalid-token JSON payload.
        ///
        /// The response body is `ResponseBody::new(constants::MESSAGE_INVALID_TOKEN, constants::EMPTY)` mapped into the right variant of `EitherBody`.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::http::StatusCode;
        /// use actix_web::test::TestRequest;
        ///
        /// let req = TestRequest::default().to_srv_request();
        /// let res = crate::middleware::auth_middleware::create_unauthorized_response(req).unwrap();
        /// assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
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