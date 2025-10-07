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

    /// Authenticates an incoming ServiceRequest, injects the resolved tenant pool into the request extensions on success, or produces a 401 Unauthorized response on failure.
    ///
    /// This method bypasses authentication for OPTIONS requests and for paths listed in `constants::IGNORE_ROUTES`. When a Bearer token is present in the `Authorization` header, it is decoded and verified against the tenant pool obtained from `TenantPoolManager`; on successful verification the tenant pool is inserted into the request's extensions and the inner service is invoked. If authentication does not pass, the method returns a 401 response with a standardized JSON error body.
    ///
    /// # Returns
    ///
    /// `Ok(ServiceResponse)` containing the inner service response (left body) when authentication succeeds; otherwise a 401 Unauthorized `ServiceResponse` (right body) with a standardized JSON error.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use actix_web::dev::ServiceRequest;
    /// // Assume `auth_middleware` is an instance of the Authentication Transform produced middleware
    /// // and `req` is a constructed ServiceRequest.
    /// // let fut = auth_middleware.call(req);
    /// // let res = futures::executor::block_on(fut).unwrap();
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