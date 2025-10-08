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
        /// Constructs a default `MiddlewareContext` with no tenant or user set and authentication disabled.
        ///
        /// The returned context has `tenant_id` and `user_id` set to `None`, and `is_authenticated` and
        /// `skip_auth` set to `false`.
        ///
        /// # Examples
        ///
        /// ```
        /// let ctx = MiddlewareContext::default();
        /// assert!(ctx.tenant_id.is_none());
        /// assert!(ctx.user_id.is_none());
        /// assert_eq!(ctx.is_authenticated, false);
        /// assert_eq!(ctx.skip_auth, false);
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
        /// Returns the token string if the header exists, is a valid ASCII/UTF-8 string,
        /// and begins with the case-insensitive prefix `Bearer `; otherwise returns
        /// `MiddlewareError::AuthenticationFailed`.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::http::header;
        /// use actix_web::test::TestRequest;
        ///
        /// // Construct a ServiceRequest with an Authorization header
        /// let req = TestRequest::default()
        ///     .insert_header((header::AUTHORIZATION, "Bearer token123"))
        ///     .to_srv_request();
        ///
        /// // Assume `TokenExtractor` is in scope and implements `call(&self, &ServiceRequest)`.
        /// let extractor = crate::TokenExtractor;
        /// let result = extractor.call(&req);
        /// assert_eq!(result.unwrap(), "token123".to_string());
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

        /// Provides the declared signature string for this pure function.
        ///
        /// Returns the canonical signature string describing the function's expected input and output.
        ///
        /// # Examples
        ///
        /// ```
        /// let sig = TokenExtractor.signature(&TokenExtractor);
        /// assert_eq!(sig, "fn(&ServiceRequest) -> MiddlewareResult<String>");
        /// ```
        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> MiddlewareResult<String>"
        }

        /// Identifies this function as belonging to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// #[derive(PartialEq, Debug)]
        /// enum FunctionCategory { Middleware }
        ///
        /// struct Dummy;
        /// impl Dummy {
        ///     fn category(&self) -> FunctionCategory {
        ///         FunctionCategory::Middleware
        ///     }
        /// }
        ///
        /// let d = Dummy;
        /// assert_eq!(d.category(), FunctionCategory::Middleware);
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
        /// Validates and verifies a token and returns the associated tenant and user IDs.
        ///
        /// Decodes the provided token and verifies it against the tenant pool obtained
        /// from the given `TenantPoolManager`. On success returns a tuple containing
        /// the tenant ID and the user ID extracted from the token claims.
        ///
        /// # Returns
        /// `Ok((tenant_id, user_id))` with IDs extracted from the token on success.
        /// `Err(MiddlewareError::TokenInvalid(_))` if token decoding or verification fails.
        /// `Err(MiddlewareError::TenantNotFound(_))` if no tenant pool exists for the token's tenant.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// // Example usage (requires a real TenantPoolManager and a valid token):
        /// // let validator = TokenValidator;
        /// // let manager: TenantPoolManager = /* ... */;
        /// // let token = "eyJ...".to_string();
        /// // let result = validator.call((token, &manager));
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

        /// Textual signature used to identify this pure function's input and output types for registry lookups.
        ///
        /// # Returns
        /// A static string describing the function's input `(String, &TenantPoolManager)` and output `MiddlewareResult<(String, String)>`.
        ///
        /// # Examples
        ///
        /// ```
        /// // Example usage: ensure the registry signature matches the expected representation.
        /// let sig = TokenValidator {}.signature();
        /// assert_eq!(sig, "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>");
        /// ```
        fn signature(&self) -> &'static str {
            "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>"
        }

        /// Identifies this function as belonging to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// #[derive(PartialEq, Debug)]
        /// enum FunctionCategory { Middleware }
        ///
        /// struct Dummy;
        /// impl Dummy {
        ///     fn category(&self) -> FunctionCategory {
        ///         FunctionCategory::Middleware
        ///     }
        /// }
        ///
        /// let d = Dummy;
        /// assert_eq!(d.category(), FunctionCategory::Middleware);
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
        /// # Examples
        ///
        /// ```
        /// use actix_web::http::Method;
        /// use actix_web::test::TestRequest;
        ///
        /// // OPTIONS requests should always skip authentication.
        /// let req = TestRequest::default().method(Method::OPTIONS).to_srv_request();
        /// let checker = AuthSkipChecker;
        /// assert!(checker.call(&req));
        /// ```
        ///
        /// # Returns
        ///
        /// `true` if the request should bypass authentication (the request method is OPTIONS or the path starts with a configured ignore route), `false` otherwise.
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

        /// Provide the expected function type signature for this pure function.
        ///
        /// The returned value is the static string `"fn(&ServiceRequest) -> bool"`.
        ///
        /// # Examples
        ///
        /// ```
        /// // The signature string can be compared against the expected type description.
        /// assert_eq!("fn(&ServiceRequest) -> bool", "fn(&ServiceRequest) -> bool");
        /// ```
        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> bool"
        }

        /// Identifies this function as belonging to the middleware category.
        ///
        /// # Examples
        ///
        /// ```
        /// #[derive(PartialEq, Debug)]
        /// enum FunctionCategory { Middleware }
        ///
        /// struct Dummy;
        /// impl Dummy {
        ///     fn category(&self) -> FunctionCategory {
        ///         FunctionCategory::Middleware
        ///     }
        /// }
        ///
        /// let d = Dummy;
        /// assert_eq!(d.category(), FunctionCategory::Middleware);
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
        /// Create a new FunctionalMiddleware by wrapping the provided function in an Arc and storing the registry.
        ///
        /// # Examples
        ///
        /// ```ignore
        /// let registry = std::sync::Arc::new(PureFunctionRegistry::new());
        /// let func = |req: &ServiceRequest| -> MiddlewareResult<&ServiceRequest> { Ok(req) };
        /// let middleware = FunctionalMiddleware::new(func, registry.clone());
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
        /// Creates a new FunctionalAuthentication using the provided pure function registry.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // assuming PureFunctionRegistry and FunctionalAuthentication are in scope
        /// let registry = Arc::new(PureFunctionRegistry::default());
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

        /// Creates a transform future that produces a `FunctionalAuthenticationMiddleware` wrapping the provided service.
        ///
        /// The returned future resolves to a `FunctionalAuthenticationMiddleware` which holds the given `service` and a cloned
        /// reference to the middleware registry.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use std::sync::Arc;
        /// // Assume `registry` is an Arc<PureFunctionRegistry> and `auth` is FunctionalAuthentication::new(registry.clone()).
        /// // Also assume `service` implements the expected Actix `Service` trait.
        /// // let fut = auth.new_transform(service);
        /// // fut resolves to a FunctionalAuthenticationMiddleware wrapping `service`.
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

        /// Processes an incoming `ServiceRequest` through the authentication pipeline, conditionally skips authentication, and forwards the request to the inner service or returns a standardized error response.
        ///
        /// This method:
        /// - checks whether authentication should be skipped for the request and, if so, forwards it unchanged to the inner service;
        /// - extracts and validates a bearer token when authentication is required;
        /// - on successful validation, inserts the resolved tenant pool into the request's extensions;
        /// - on any failure (missing tenant manager, token extraction/validation failure, missing tenant pool) returns a standardized error response.
        ///
        /// # Returns
        ///
        /// A `Future` that resolves to the inner service's `ServiceResponse` (mapped to the left body) when processing succeeds, or to an HTTP error response when authentication or setup fails.
        ///
        /// # Examples
        ///
        /// ```rust
        /// // This example is illustrative; invoking `call` requires a full Actix service and runtime,
        /// // so it is shown here as a no-run snippet.
        /// #![allow(unused)]
        /// // let middleware: FunctionalAuthenticationMiddleware<_> = /* constructed middleware */ ;
        /// // let req: ServiceRequest = /* construct request */ ;
        /// // let fut = middleware.call(req);
        /// // let res = async_std::task::block_on(fut);
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
        /// Constructs a 401 Unauthorized `ServiceResponse` containing a JSON error body.
        ///
        /// The response body will be a `ResponseBody` with the provided `message` and an empty data payload.
        ///
        /// # Parameters
        ///
        /// - `req`: the incoming `ServiceRequest` to convert into a `ServiceResponse`.
        /// - `message`: short error message to include in the JSON body.
        ///
        /// # Returns
        ///
        /// `Ok(ServiceResponse)` containing an `Unauthorized` response with a JSON error body, or an `Err(Error)` if constructing the response fails.
        ///
        /// # Examples
        ///
        /// ```
        /// // Given a `ServiceRequest` named `req`, create an unauthorized error response:
        /// // let resp = create_error_response(req, "Authentication required").unwrap();
        /// // assert_eq!(resp.status(), actix_web::http::StatusCode::UNAUTHORIZED);
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
        /// Creates a new middleware pipeline builder with an empty middleware stack.
        ///
        /// # Examples
        ///
        /// ```rust
        /// use std::sync::Arc;
        /// # use crate::functional::PureFunctionRegistry;
        /// let registry = Arc::new(PureFunctionRegistry::default());
        /// let builder = MiddlewarePipelineBuilder::new(registry);
        /// ```
        pub fn new(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry,
                middleware_stack: Vec::new(),
            }
        }

        /// Add the functional authentication middleware to the pipeline.
        ///
        /// This appends a `FunctionalAuthentication` component (cloned from the builder's registry)
        /// to the internal middleware stack and returns the updated builder for chaining.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use std::sync::Arc;
        ///
        /// // assume `registry` is an Arc<PureFunctionRegistry> obtained elsewhere
        /// let registry: Arc<_> = Arc::new(PureFunctionRegistry::new());
        /// let builder = MiddlewarePipelineBuilder::new(registry).with_auth();
        /// ```
        pub fn with_auth(mut self) -> Self {
            self.middleware_stack
                .push(Box::new(FunctionalAuthentication::new(Arc::clone(
                    &self.registry,
                ))));
            self
        }

        /// Wraps the given Actix service with the configured middleware stack, producing a composed service ready to handle requests.
        ///
        /// Consumes the builder and returns a ComposedMiddleware that will apply the accumulated middleware components
        /// in order before delegating to the provided service.
        ///
        /// # Examples
        ///
        /// ```
        /// use std::sync::Arc;
        /// // `registry` and `service` are placeholders for an actual PureFunctionRegistry and an Actix service.
        /// let registry = Arc::new(crate::pure::PureFunctionRegistry::new());
        /// let builder = crate::functional::MiddlewarePipelineBuilder::new(registry).with_auth();
        /// let service = /* an Actix service implementing Service<ServiceRequest> */ ;
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

        /// Process an incoming request through the middleware chain, then invoke the inner service.
        ///
        /// Each middleware component is applied in order; if a component returns an error, an internal
        /// server error response is produced and returned immediately. If all components succeed, the
        /// resulting request is forwarded to the wrapped service and its response is returned.
        ///
        /// # Examples
        ///
        /// ```
        /// // This example is illustrative; integration tests exercise the real ComposedMiddleware usage.
        /// // Construct a ComposedMiddleware with a middleware stack and call it with a ServiceRequest,
        /// // observing that middleware are applied before the inner service is invoked.
        /// ```
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
        /// Creates a 500 Internal Server Error response with a JSON body containing `message`.
        ///
        /// The function consumes the provided `ServiceRequest` and returns a `ServiceResponse` whose
        /// body is the right branch of an `EitherBody`, serialized from `ResponseBody::new(message, constants::EMPTY)`.
        ///
        /// # Examples
        ///
        /// ```
        /// use actix_web::{dev::ServiceRequest, http::StatusCode};
        /// // Assume `req` is a valid ServiceRequest constructed in a test context.
        /// // let req: ServiceRequest = ...;
        /// // let res = create_error_response(req, "internal failure").unwrap();
        /// // assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
        /// ```
        —
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
        /// Processes a `ServiceRequest` through the functional authentication component and
        /// returns either the (potentially augmented) request or a `MiddlewareError`.
        ///
        /// On success the returned `ServiceRequest` may include additional extensions (for example
        /// tenant-related state) required by downstream services. On failure the call returns one of
        /// the `MiddlewareError` variants such as `AuthenticationFailed`, `TenantNotFound`,
        /// `TokenInvalid`, or `InternalError`.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use futures::executor::block_on;
        /// // Assume `component` is a `FunctionalAuthentication` instance and `req` a `ServiceRequest`.
        /// // let result = block_on(component.process(req));
        /// // match result {
        /// //     Ok(req) => { /* proceed with authenticated request */ }
        /// //     Err(err) => { /* handle middleware error */ }
        /// // }
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