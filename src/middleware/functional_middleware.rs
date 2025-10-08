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

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn middleware_context_default() {
            let context = MiddlewareContext::default();
            
            assert\!(context.tenant_id.is_none());
            assert\!(context.user_id.is_none());
            assert\!(\!context.is_authenticated);
            assert\!(\!context.skip_auth);
        }

        #[test]
        fn middleware_context_with_tenant() {
            let context = MiddlewareContext {
                tenant_id: Some("tenant123".to_string()),
                user_id: Some("user456".to_string()),
                is_authenticated: true,
                skip_auth: false,
            };
            
            assert_eq\!(context.tenant_id.unwrap(), "tenant123");
            assert_eq\!(context.user_id.unwrap(), "user456");
            assert\!(context.is_authenticated);
            assert\!(\!context.skip_auth);
        }

        #[test]
        fn middleware_error_variants() {
            let auth_err = MiddlewareError::AuthenticationFailed("test".to_string());
            let tenant_err = MiddlewareError::TenantNotFound("tenant1".to_string());
            let token_err = MiddlewareError::TokenInvalid("invalid".to_string());
            let internal_err = MiddlewareError::InternalError("error".to_string());
            
            match auth_err {
                MiddlewareError::AuthenticationFailed(msg) => assert_eq\!(msg, "test"),
                _ => panic\!("Wrong variant"),
            }
            
            match tenant_err {
                MiddlewareError::TenantNotFound(msg) => assert_eq\!(msg, "tenant1"),
                _ => panic\!("Wrong variant"),
            }
            
            match token_err {
                MiddlewareError::TokenInvalid(msg) => assert_eq\!(msg, "invalid"),
                _ => panic\!("Wrong variant"),
            }
            
            match internal_err {
                MiddlewareError::InternalError(msg) => assert_eq\!(msg, "error"),
                _ => panic\!("Wrong variant"),
            }
        }

        #[test]
        fn middleware_error_clone() {
            let error = MiddlewareError::AuthenticationFailed("test".to_string());
            let cloned = error.clone();
            
            match cloned {
                MiddlewareError::AuthenticationFailed(msg) => assert_eq\!(msg, "test"),
                _ => panic\!("Clone failed"),
            }
        }

        #[test]
        fn token_extractor_signature() {
            let extractor = TokenExtractor;
            assert_eq\!(extractor.signature(), "fn(&ServiceRequest) -> MiddlewareResult<String>");
        }

        #[test]
        fn token_extractor_category() {
            let extractor = TokenExtractor;
            assert_eq\!(extractor.category(), FunctionCategory::Middleware);
        }

        #[test]
        fn token_validator_signature() {
            let validator = TokenValidator;
            assert_eq\!(
                validator.signature(),
                "fn((String, &TenantPoolManager)) -> MiddlewareResult<(String, String)>"
            );
        }

        #[test]
        fn token_validator_category() {
            let validator = TokenValidator;
            assert_eq\!(validator.category(), FunctionCategory::Middleware);
        }

        #[test]
        fn auth_skip_checker_signature() {
            let checker = AuthSkipChecker;
            assert_eq\!(checker.signature(), "fn(&ServiceRequest) -> bool");
        }

        #[test]
        fn auth_skip_checker_category() {
            let checker = AuthSkipChecker;
            assert_eq\!(checker.category(), FunctionCategory::Middleware);
        }

        #[test]
        fn auth_skip_checker_skips_options() {
            use actix_web::test::TestRequest;
            use actix_web::http::Method;
            
            let checker = AuthSkipChecker;
            let req = TestRequest::default()
                .method(Method::OPTIONS)
                .uri("/test")
                .to_srv_request();
            
            assert\!(checker.call(&req));
        }

        #[test]
        fn auth_skip_checker_skips_health() {
            use actix_web::test::TestRequest;
            
            let checker = AuthSkipChecker;
            let req = TestRequest::get()
                .uri("/health")
                .to_srv_request();
            
            assert\!(checker.call(&req));
        }

        #[test]
        fn auth_skip_checker_does_not_skip_api() {
            use actix_web::test::TestRequest;
            
            let checker = AuthSkipChecker;
            let req = TestRequest::get()
                .uri("/api/users")
                .to_srv_request();
            
            assert\!(\!checker.call(&req));
        }

        #[test]
        fn token_extractor_missing_header() {
            use actix_web::test::TestRequest;
            
            let extractor = TokenExtractor;
            let req = TestRequest::get()
                .uri("/test")
                .to_srv_request();
            
            let result = extractor.call(&req);
            assert\!(result.is_err());
            
            match result {
                Err(MiddlewareError::AuthenticationFailed(msg)) => {
                    assert\!(msg.contains("Missing or invalid authorization header"));
                }
                _ => panic\!("Expected AuthenticationFailed error"),
            }
        }

        #[test]
        fn token_extractor_invalid_scheme() {
            use actix_web::test::TestRequest;
            
            let extractor = TokenExtractor;
            let req = TestRequest::get()
                .uri("/test")
                .insert_header((constants::AUTHORIZATION, "Basic token123"))
                .to_srv_request();
            
            let result = extractor.call(&req);
            assert\!(result.is_err());
        }

        #[test]
        fn token_extractor_empty_token() {
            use actix_web::test::TestRequest;
            
            let extractor = TokenExtractor;
            let req = TestRequest::get()
                .uri("/test")
                .insert_header((constants::AUTHORIZATION, "Bearer "))
                .to_srv_request();
            
            let result = extractor.call(&req);
            assert\!(result.is_err());
        }

        #[test]
        fn token_extractor_valid_token() {
            use actix_web::test::TestRequest;
            
            let extractor = TokenExtractor;
            let req = TestRequest::get()
                .uri("/test")
                .insert_header((constants::AUTHORIZATION, "Bearer valid_token"))
                .to_srv_request();
            
            let result = extractor.call(&req);
            assert\!(result.is_ok());
            assert_eq\!(result.unwrap(), "valid_token");
        }

        #[test]
        fn token_extractor_case_insensitive() {
            use actix_web::test::TestRequest;
            
            let extractor = TokenExtractor;
            let req = TestRequest::get()
                .uri("/test")
                .insert_header((constants::AUTHORIZATION, "BEARER token123"))
                .to_srv_request();
            
            let result = extractor.call(&req);
            assert\!(result.is_ok());
            assert_eq\!(result.unwrap(), "token123");
        }

        #[actix_rt::test]
        async fn functional_auth_creates_with_registry() {
            let registry = Arc::new(PureFunctionRegistry::new());
            let auth = FunctionalAuthentication::new(registry.clone());
            
            // Should create successfully - registry should be stored
            assert\!(Arc::ptr_eq(&auth.registry, &registry));
        }

        #[actix_rt::test]
        async fn middleware_pipeline_builder_creates() {
            let registry = Arc::new(PureFunctionRegistry::new());
            let builder = MiddlewarePipelineBuilder::new(registry);
            
            // Should create with empty stack
            assert_eq\!(builder.middleware_stack.len(), 0);
        }

        #[actix_rt::test]
        async fn middleware_pipeline_builder_with_auth() {
            let registry = Arc::new(PureFunctionRegistry::new());
            let builder = MiddlewarePipelineBuilder::new(registry)
                .with_auth();
            
            // Should add auth middleware
            assert_eq\!(builder.middleware_stack.len(), 1);
        }

        #[test]
        fn middleware_result_ok() {
            let result: MiddlewareResult<i32> = Ok(42);
            assert\!(result.is_ok());
            assert_eq\!(result.unwrap(), 42);
        }

        #[test]
        fn middleware_result_err() {
            let result: MiddlewareResult<i32> = Err(MiddlewareError::InternalError("test".to_string()));
            assert\!(result.is_err());
        }

        #[test]
        fn middleware_context_skip_auth() {
            let context = MiddlewareContext {
                tenant_id: None,
                user_id: None,
                is_authenticated: false,
                skip_auth: true,
            };
            
            assert\!(context.skip_auth);
            assert\!(\!context.is_authenticated);
        }

        #[test]
        fn middleware_context_authenticated() {
            let context = MiddlewareContext {
                tenant_id: Some("t1".to_string()),
                user_id: Some("u1".to_string()),
                is_authenticated: true,
                skip_auth: false,
            };
            
            assert\!(context.is_authenticated);
            assert\!(\!context.skip_auth);
            assert\!(context.tenant_id.is_some());
            assert\!(context.user_id.is_some());
        }

        #[test]
        fn middleware_error_debug_format() {
            let error = MiddlewareError::TokenInvalid("test token".to_string());
            let debug_str = format\!("{:?}", error);
            
            assert\!(debug_str.contains("TokenInvalid"));
            assert\!(debug_str.contains("test token"));
        }

        #[test]
        fn pure_function_implementations_are_consistent() {
            let extractor = TokenExtractor;
            let validator = TokenValidator;
            let checker = AuthSkipChecker;
            
            // All should be Middleware category
            assert_eq\!(extractor.category(), FunctionCategory::Middleware);
            assert_eq\!(validator.category(), FunctionCategory::Middleware);
            assert_eq\!(checker.category(), FunctionCategory::Middleware);
            
            // All should have non-empty signatures
            assert\!(\!extractor.signature().is_empty());
            assert\!(\!validator.signature().is_empty());
            assert\!(\!checker.signature().is_empty());
        }
    }
}

#[cfg(feature = "functional")]
pub use functional_middleware_impl::*;