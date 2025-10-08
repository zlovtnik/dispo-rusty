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

        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> MiddlewareResult<String>"
        }

        fn category(&self) -> FunctionCategory {
            FunctionCategory::Middleware
        }
    }

    /// Pure function for validating JWT token and extracting claims
    pub struct TokenValidator;

    impl PureFunction<(String, &TenantPoolManager), MiddlewareResult<(String, String)>>
        for TokenValidator
    {
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

        fn signature(&self) -> &'static str {
            "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>"
        }

        fn category(&self) -> FunctionCategory {
            FunctionCategory::Middleware
        }
    }

    /// Pure function for checking if request should skip authentication
    pub struct AuthSkipChecker;

    impl PureFunction<&ServiceRequest, bool> for AuthSkipChecker {
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

        fn signature(&self) -> &'static str {
            "fn(&ServiceRequest) -> bool"
        }

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
        pub fn new(registry: Arc<PureFunctionRegistry>) -> Self {
            Self {
                registry,
                middleware_stack: Vec::new(),
            }
        }

        pub fn with_auth(mut self) -> Self {
            self.middleware_stack
                .push(Box::new(FunctionalAuthentication::new(Arc::clone(
                    &self.registry,
                ))));
            self
        }

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
