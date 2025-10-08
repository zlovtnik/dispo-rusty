//! Functional Middleware Pipeline
//!
//! This module implements composable middleware components using functional programming patterns.
//! Middleware functions are pure, composable, and support zero-allocation processing for
//! performance-critical paths. The system enables reusable middleware components through
//! functional composition and immutable request/response transformations.

#[cfg(feature = "functional")]
mod functional_middleware_impl {
    use super::*;
    use actix_service::{Service, Transform};
    use actix_web::body::EitherBody;
    use actix_web::dev::{ServiceRequest, ServiceResponse};
    use actix_web::Error;
    use actix_web::HttpResponse;
    use futures::future::{ok, LocalBoxFuture, Ready};
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::Arc;

    use crate::config::db::TenantPoolManager;
    use crate::constants;
    use crate::functional::function_traits::{FunctionCategory, PureFunction};
    use crate::functional::pure_function_registry::PureFunctionRegistry;
    use crate::models::response::ResponseBody;
    use crate::utils::token_utils;

    /// Result type for middleware operations
    pub type MiddlewareResult<T> = Result<T, MiddlewareError>;

    /// Error types for middleware operations
    #[derive(Debug, Clone)]
    pub enum MiddlewareError {
        AuthenticationFailed(String),
        TenantNotFound(String),
        TokenInvalid(String),
        InternalError(String),
    }

    /// Context passed through middleware pipeline
    #[derive(Debug, Clone)]
    pub struct MiddlewareContext {
        pub tenant_id: Option<String>,
        pub user_id: Option<String>,
        pub is_authenticated: bool,
        pub skip_auth: bool,
    }

    impl Default for MiddlewareContext {
        /// Creates a default MiddlewareContext with no tenant or user and authentication disabled.
        ///
        /// The default context has `tenant_id` and `user_id` set to `None`, `is_authenticated` set to
        /// `false`, and `skip_auth` set to `false`.
        ///
        /// # Examples
        ///
        /// ```
        /// let ctx = MiddlewareContext::default();
        /// assert!(ctx.tenant_id.is_none());
        /// assert!(ctx.user_id.is_none());
        /// assert!(!ctx.is_authenticated);
        /// assert!(!ctx.skip_auth);
        /// ```
        fn default() -> Self {
            Self {
                tenant_id: None,
                user_id: None,
                is_authenticated: false,
                skip_auth: false,
            }
        }
    }

    /// Pure function for extracting authentication token from request
    pub struct TokenExtractor;

    impl PureFunction<&ServiceRequest, MiddlewareResult<String>> for TokenExtractor {
        /// Extracts a Bearer token from the request's `Authorization` header.
        ///
        /// Returns `Ok(token)` containing the token string if the `Authorization` header is present,
        /// decodes to UTF-8, starts with `"Bearer "` (case-insensitive), and the token part is not empty;
        /// returns `Err(MiddlewareError::AuthenticationFailed(...))` otherwise.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::test::TestRequest;
        /// use actix_web::http::header;
        ///
        /// // Build a ServiceRequest with an Authorization header.
        /// let req = TestRequest::default()
        ///     .insert_header((header::AUTHORIZATION, "Bearer abc.def.ghi"))
        ///     .to_srv_request();
        ///
        /// let extractor = TokenExtractor;
        /// let token = extractor.call(&req).unwrap();
        /// assert_eq!(token, "abc.def.ghi");
        /// ```
        fn call(&self, req: &ServiceRequest) -> MiddlewareResult<String> {
            if let Some(auth_header) = req.headers().get(constants::AUTHORIZATION) {
                if let Ok(auth_str) = auth_header.to_str() {
                    if auth_str.to_lowercase().starts_with("bearer ") {
                        let token = auth_str[7..].trim().to_string();
                        if !token.is_empty() {
                            return Ok(token);
                        }
                    }
                }
            }
            Err(MiddlewareError::AuthenticationFailed(
                "Missing or invalid authorization header".to_string(),
            ))
        }

        /// Provide the canonical function type signature used by this PureFunction implementation.
        ///
        /// # Examples
        ///
        /// ```
        /// let sig = TokenExtractor.signature();
        /// assert_eq!(sig, "fn(&ServiceRequest) -> MiddlewareResult<String>");
        /// ```
        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> MiddlewareResult<String>"
        }

        /// Indicates that this pure function belongs to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// let extractor = TokenExtractor;
        /// assert_eq!(extractor.category(), FunctionCategory::Middleware);
        /// ```
        fn category(&self) -> FunctionCategory {
            FunctionCategory::Middleware
        }
    }

    /// Pure function for validating JWT token and extracting claims
    pub struct TokenValidator;

    impl PureFunction<(String, &TenantPoolManager), MiddlewareResult<(String, String)>>
        for TokenValidator
    {
        /// Validates and decodes a bearer token, returning the tenant and user IDs contained in it.
        ///
        /// Decodes the provided token, extracts `tenant_id` and `user_id` from the token claims,
        /// and verifies the token against the corresponding tenant pool from the `TenantPoolManager`.
        /// Returns an error when the token cannot be decoded or verified, or when the tenant is not found.
        ///
        /// # Returns
        ///
        /// `Ok((tenant_id, user_id))` on successful decode and verification; `Err(MiddlewareError::TokenInvalid(_))`
        /// if decoding or verification fails; `Err(MiddlewareError::TenantNotFound(_))` if the tenant is missing.
        ///
        /// # Examples
        ///
        /// ```
        /// // Illustrative example; types and helpers (TokenValidator, TenantPoolManager) must be available in scope.
        /// // let validator = TokenValidator;
        /// // let result = validator.call((token_string, &tenant_pool_manager));
        /// // assert!(matches!(result, Ok((tenant_id, user_id))));
        /// ```
        fn call(&self, input: (String, &TenantPoolManager)) -> MiddlewareResult<(String, String)> {
            let (token, manager) = input;

            let token_data = token_utils::decode_token(token).map_err(|e| {
                MiddlewareError::TokenInvalid(format!("Token decode failed: {}", e))
            })?;

            let tenant_id = token_data.claims.tenant_id.clone();
            let user_id = token_data.claims.user.clone();

            // Verify token against tenant database
            if let Some(tenant_pool) = manager.get_tenant_pool(&tenant_id) {
                token_utils::verify_token(&token_data, &tenant_pool).map_err(|e| {
                    MiddlewareError::TokenInvalid(format!("Token verification failed: {}", e))
                })?;
            } else {
                return Err(MiddlewareError::TenantNotFound(format!(
                    "Tenant '{}' not found",
                    tenant_id
                )));
            }

            Ok((tenant_id, user_id))
        }

        /// Function signature identifying this pure function's input and output types.
        ///
        /// # Examples
        ///
        /// ```
        /// let validator = TokenValidator;
        /// assert_eq!(
        ///     validator.signature(),
        ///     "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>"
        /// );
        /// ```
        fn signature(&self) -> &'static str {
            "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>"
        }

        /// Indicates that this pure function belongs to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// let extractor = TokenExtractor;
        /// assert_eq!(extractor.category(), FunctionCategory::Middleware);
        /// ```
        fn category(&self) -> FunctionCategory {
            FunctionCategory::Middleware
        }
    }

    /// Pure function for checking if request should skip authentication
    pub struct AuthSkipChecker;

    impl PureFunction<&ServiceRequest, bool> for AuthSkipChecker {
        /// Determines whether authentication should be skipped for the given request.
        ///
        /// Authentication is skipped when the request method is `OPTIONS` or when the
        /// request path starts with any entry in `constants::IGNORE_ROUTES`.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::{http::Method, test::TestRequest};
        /// let checker = AuthSkipChecker;
        /// let req = TestRequest::default().method(Method::OPTIONS).to_srv_request();
        /// assert!(checker.call(&req));
        /// ```
        fn call(&self, req: &ServiceRequest) -> bool {
            // Skip OPTIONS requests
            if req.method().as_str() == "OPTIONS" {
                return true;
            }

            // Check against ignore routes
            constants::IGNORE_ROUTES
                .iter()
                .any(|route| req.path().starts_with(route))
        }

        /// Provide the canonical function signature for this pure function.
        ///
        /// # Returns
        ///
        /// A static string literal describing the function's argument and return types: `fn(&ServiceRequest) -> bool`.
        ///
        /// # Examples
        ///
        /// ```
        /// let sig = AuthSkipChecker.signature();
        /// assert_eq!(sig, "fn(&ServiceRequest) -> bool");
        /// ```
        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> bool"
        }

        /// Indicates that this pure function belongs to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// let extractor = TokenExtractor;
        /// assert_eq!(extractor.category(), FunctionCategory::Middleware);
        /// ```
        fn category(&self) -> FunctionCategory {
            FunctionCategory::Middleware
        }
    }

    /// Composable middleware transformer that supports functional composition
    pub struct FunctionalMiddleware<T, F> {
        function: Arc<F>,
        registry: Arc<PureFunctionRegistry>,
        _phantom: PhantomData<T>,
    }

    impl<T, F> FunctionalMiddleware<T, F> {
        /// Constructs a new FunctionalMiddleware that wraps a pure function together with a function registry.
        ///
        /// The created middleware holds the provided function (shared) and the given PureFunctionRegistry
        /// for use during pipeline execution.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        ///
        /// // Assuming `PureFunctionRegistry`, `FunctionalMiddleware` and `MiddlewareResult` are in scope.
        /// let registry = Arc::new(PureFunctionRegistry::new());
        /// let func = |_: &()| -> MiddlewareResult<()> { Ok(()) };
        /// let _mw = FunctionalMiddleware::<(), _>::new(func, registry);
        /// ```
        pub fn new(function: F, registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                function: Arc::new(function),
                registry,
                _phantom: PhantomData,
            }
        }
    }

    /// Authentication middleware using functional composition
    pub struct FunctionalAuthentication {
        registry: Arc<PureFunctionRegistry>,
    }

    impl FunctionalAuthentication {
        /// Constructs a FunctionalAuthentication configured with the given function registry.
        ///
        /// # Parameters
        ///
        /// - `registry`: Shared registry of pure functions used by the middleware pipeline.
        ///
        /// # Returns
        ///
        /// A new `FunctionalAuthentication` instance using the provided registry.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // Assume `PureFunctionRegistry::new()` exists and returns an empty registry.
        /// let registry = Arc::new(PureFunctionRegistry::new());
        /// let auth = FunctionalAuthentication::new(registry.clone());
        /// ```
        pub fn new(registry: Arc<PureFunctionRegistry>) -> Self {
            Self { registry }
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

        /// Creates a FunctionalAuthenticationMiddleware that wraps the provided service and shares this
        /// builder's function registry.
        ///
        /// # Examples
        ///
        /// ```
        /// // given `registry: Arc<PureFunctionRegistry>` and `service` implementing Service<ServiceRequest>
        /// let auth = FunctionalAuthentication::new(Arc::clone(&registry));
        /// let ready_middleware = auth.new_transform(service);
        /// // `ready_middleware` resolves to a `FunctionalAuthenticationMiddleware` that wraps `service`
        /// ```
        fn new_transform(&self, service: S) -> Self::Future {
            ok(FunctionalAuthenticationMiddleware {
                service,
                registry: Arc::clone(&self.registry),
            })
        }
    }

    pub struct FunctionalAuthenticationMiddleware<S> {
        service: S,
        registry: Arc<PureFunctionRegistry>,
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

        /// Authenticate an incoming ServiceRequest using the functional middleware pipeline and forward it to the inner service.
        ///
        /// On success, forwards the (possibly enriched) request to the wrapped service and returns its response. If the request is configured to skip authentication, forwards immediately. If authentication or required application data is missing or invalid, produces an HTTP error response (Unauthorized or InternalServerError) instead of calling the inner service.
        ///
        /// # Returns
        ///
        /// `Ok(ServiceResponse)` containing either the wrapped service's response when processing succeeds or an HTTP error response when authentication or setup fails; `Err(Error)` when forwarding to the inner service or constructing the response fails.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// # use actix_web::dev::{ServiceRequest, ServiceResponse};
        /// # // This example is illustrative: calling `call` requires an initialized Actix service and runtime.
        /// # // In an integration test you would construct the FunctionalAuthentication middleware, wrap a test service,
        /// # // then send a ServiceRequest through the composed service and assert on the ServiceResponse.
        /// ```
        fn call(&self, req: ServiceRequest) -> Self::Future {
            let registry = Arc::clone(&self.registry);

            Box::pin(async move {
                // Functional composition pipeline
                let skip_checker = AuthSkipChecker;
                let should_skip = skip_checker.call(&req);

                if should_skip {
                    info!("Skipping authentication for route: {}", req.path());
                    let res = self.service.call(req).await?;
                    return Ok(res.map_into_left_body());
                }

                // Extract tenant manager
                let manager = match req.app_data::<Data<TenantPoolManager>>() {
                    Some(mgr) => mgr,
                    None => {
                        error!("TenantPoolManager not found in app data");
                        return Self::create_error_response(req, constants::MESSAGE_INTERNAL_ERROR);
                    }
                };

                // Functional authentication pipeline
                let token_extractor = TokenExtractor;
                let token_result = token_extractor.call(&req);

                let (tenant_id, user_id) = match token_result {
                    Ok(token) => {
                        let validator = TokenValidator;
                        match validator.call((token, manager)) {
                            Ok((tid, uid)) => (tid, uid),
                            Err(e) => {
                                error!("Token validation failed: {:?}", e);
                                return Self::create_error_response(
                                    req,
                                    constants::MESSAGE_INVALID_TOKEN,
                                );
                            }
                        }
                    }
                    Err(e) => {
                        error!("Token extraction failed: {:?}", e);
                        return Self::create_error_response(req, constants::MESSAGE_INVALID_TOKEN);
                    }
                };

                // Inject tenant pool into request extensions
                if let Some(tenant_pool) = manager.get_tenant_pool(&tenant_id) {
                    req.extensions_mut().insert(tenant_pool.clone());
                    info!(
                        "Authentication successful for tenant: {}, user: {}",
                        tenant_id, user_id
                    );
                } else {
                    error!("Tenant pool not found for tenant: {}", tenant_id);
                    return Self::create_error_response(req, constants::MESSAGE_INVALID_TOKEN);
                }

                let res = self.service.call(req).await?;
                Ok(res.map_into_left_body())
            })
        }
    }

    impl<S> FunctionalAuthenticationMiddleware<S> {
        /// Create an Unauthorized HTTP response containing a JSON error body with the provided message.
        ///
        /// The response body is a `ResponseBody` constructed using `message` and an empty payload constant,
        /// and the resulting `ServiceResponse` is returned wrapped in `Ok`.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::test::TestRequest;
        /// use actix_web::http::StatusCode;
        ///
        /// let srv_req = TestRequest::default().to_srv_request();
        /// let res = create_error_response(srv_req, "authentication required").unwrap();
        /// assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        /// ```
        fn create_error_response(
            req: ServiceRequest,
            message: &str,
        ) -> Result<ServiceResponse<EitherBody<impl actix_web::body::MessageBody>>, Error> {
            let (request, _pl) = req.into_parts();
            let response = HttpResponse::Unauthorized()
                .json(ResponseBody::new(message, constants::EMPTY))
                .map_into_right_body();
            Ok(ServiceResponse::new(request, response))
        }
    }

    /// Builder for composing middleware pipelines
    pub struct MiddlewarePipelineBuilder {
        registry: Arc<PureFunctionRegistry>,
        middleware_stack: Vec<Box<dyn MiddlewareComponent>>,
    }

    impl MiddlewarePipelineBuilder {
        /// Creates a new MiddlewarePipelineBuilder associated with the given pure-function registry.
        ///
        /// The builder is initialized with an empty middleware stack.
        ///
        /// # Parameters
        ///
        /// - `registry`: an `Arc` to the `PureFunctionRegistry` that will be used to resolve pure functions
        ///   when constructing middleware components.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // `PureFunctionRegistry` would be created elsewhere in your application.
        /// let registry: Arc<PureFunctionRegistry> = Arc::new(/* registry instance */);
        /// let builder = MiddlewarePipelineBuilder::new(registry);
        /// ```
        pub fn new(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry,
                middleware_stack: Vec::new(),
            }
        }

        /// Appends the functional authentication middleware to the builder and returns the builder.
        ///
        /// # Returns
        ///
        /// `Self` with a `FunctionalAuthentication` component appended to `middleware_stack`.
        ///
        /// # Examples
        ///
        /// ```
        /// let builder = MiddlewarePipelineBuilder::new(registry).with_auth();
        /// ```
        pub fn with_auth(mut self) -> Self {
            self.middleware_stack
                .push(Box::new(FunctionalAuthentication::new(Arc::clone(
                    &self.registry,
                ))));
            self
        }

        /// Constructs a ComposedMiddleware that wraps the provided service with the builder's middleware stack.
        
        ///
        
        /// # Examples
        
        ///
        
        /// ```
        
        /// use std::sync::Arc;
        
        /// use actix_web::{dev::{ServiceRequest, ServiceResponse, fn_service}, HttpResponse};
        
        /// // Assume `registry` is an Arc<PureFunctionRegistry> available in scope.
        
        /// let registry = Arc::new(crate::middleware::PureFunctionRegistry::new());
        
        /// let builder = crate::middleware::MiddlewarePipelineBuilder::new(registry);
        
        /// let service = fn_service(|req: ServiceRequest| async {
        
        ///     Ok::<ServiceResponse<_>, _>(req.into_response(HttpResponse::Ok().finish()))
        
        /// });
        
        /// let composed = builder.build(service);
        
        /// ```
        pub fn build<S, B>(self, service: S) -> ComposedMiddleware<S>
        where
            S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
            S::Future: 'static,
            B: 'static,
        {
            ComposedMiddleware {
                service: Arc::new(service),
                middleware_stack: self.middleware_stack,
            }
        }
    }

    /// Trait for composable middleware components
    pub trait MiddlewareComponent: Send + Sync {
        fn process<'a>(
            &'a self,
            req: ServiceRequest,
        ) -> Pin<Box<dyn Future<Output = Result<ServiceRequest, MiddlewareError>> + Send + 'a>>;
    }

    /// Composed middleware that chains multiple middleware components
    pub struct ComposedMiddleware<S> {
        service: Arc<S>,
        middleware_stack: Vec<Box<dyn MiddlewareComponent>>,
    }

    impl<S, B> Service<ServiceRequest> for ComposedMiddleware<S>
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<EitherBody<B>>;
        type Error = Error;
        type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

        forward_ready!(service);

        fn call(&self, req: ServiceRequest) -> Self::Future {
            let service = Arc::clone(&self.service);
            let middleware_stack = self.middleware_stack.clone();

            Box::pin(async move {
                let mut current_req = req;

                // Process through middleware stack
                for middleware in &middleware_stack {
                    current_req = match middleware.process(current_req).await {
                        Ok(req) => req,
                        Err(e) => {
                            error!("Middleware processing failed: {:?}", e);
                            return Self::create_error_response(
                                current_req,
                                constants::MESSAGE_INTERNAL_ERROR,
                            );
                        }
                    };
                }

                // Call the final service
                let res = service.call(current_req).await?;
                Ok(res.map_into_left_body())
            })
        }
    }

    impl<S> ComposedMiddleware<S> {
        /// Constructs an Internal Server Error HTTP response with a JSON `ResponseBody` containing `message` and wraps it into a `ServiceResponse`.
        
        ///
        
        /// The produced `ServiceResponse` re-uses the original request parts and uses an `EitherBody` with the error response as the right body.
        
        ///
        
        /// # Examples
        
        ///
        
        /// ```
        
        /// use actix_web::test::TestRequest;
        
        /// use actix_web::http::StatusCode;
        
        ///
        
        /// let req = TestRequest::default().to_srv_request();
        
        /// let resp = create_error_response(req, "internal failure").unwrap();
        
        /// assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
        
        /// ```
        fn create_error_response(
            req: ServiceRequest,
            message: &str,
        ) -> Result<ServiceResponse<EitherBody<impl actix_web::body::MessageBody>>, Error> {
            let (request, _pl) = req.into_parts();
            let response = HttpResponse::InternalServerError()
                .json(ResponseBody::new(message, constants::EMPTY))
                .map_into_right_body();
            Ok(ServiceResponse::new(request, response))
        }
    }

    impl MiddlewareComponent for FunctionalAuthentication {
        /// Executes the functional authentication pipeline for a single request.
        ///
        /// This method applies authentication checks to `req`, potentially enriching its
        /// extensions (for example by inserting the resolved tenant pool and authentication
        /// context) and returns the (possibly modified) `ServiceRequest` on success or a
        /// `MiddlewareError` describing why authentication failed.
        ///
        /// # Returns
        ///
        /// `Ok(ServiceRequest)` with the request prepared for downstream handling when
        /// authentication succeeds; `Err(MiddlewareError)` when authentication cannot be
        /// completed (variants include `AuthenticationFailed`, `TenantNotFound`,
        /// `TokenInvalid`, and `InternalError`).
        ///
        /// # Examples
        ///
        /// ```
        /// # use std::sync::Arc;
        /// # use futures::executor::block_on;
        /// # use actix_web::test::TestRequest;
        /// # use crate::middleware::functional_middleware::FunctionalAuthentication;
        /// # use crate::pure_functions::PureFunctionRegistry;
        /// let registry = Arc::new(PureFunctionRegistry::new());
        /// let fa = FunctionalAuthentication::new(registry);
        /// let req = TestRequest::default().to_srv_request();
        /// let result = block_on(fa.process(req));
        /// match result {
        ///     Ok(req) => { /* proceed with authenticated request */ },
        ///     Err(err) => { /* handle middleware error */ },
        /// }
        /// ```
        fn process<'a>(
            &'a self,
            req: ServiceRequest,
        ) -> Pin<Box<dyn Future<Output = Result<ServiceRequest, MiddlewareError>> + Send + 'a>>
        {
            Box::pin(async move {
                // Functional authentication logic here
                // This would be similar to the authentication logic above
                // but returning MiddlewareError instead of HTTP responses
                Ok(req) // Placeholder - implement full logic
            })
        }
    }

    #[cfg(feature = "functional")]
    pub use functional_middleware_impl::*;
}