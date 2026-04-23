use super::super::*;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct HttpErrorResponse {
    pub(crate) error: HttpErrorBody,
}

#[derive(Serialize)]
pub(crate) struct HttpErrorBody {
    pub(crate) message: String,
}

fn is_local_browser_origin(origin: &str) -> bool {
    origin.starts_with("http://127.0.0.1:")
        || origin.starts_with("http://localhost:")
        || origin.starts_with("https://127.0.0.1:")
        || origin.starts_with("https://localhost:")
}

pub(crate) fn resolve_allowed_origin(
    headers: &HeaderMap,
    config: &DaemonConfig,
) -> Result<Option<HeaderValue>, (StatusCode, String)> {
    let Some(origin) = headers.get(header::ORIGIN) else {
        return Ok(None);
    };
    let origin_value = origin
        .to_str()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid origin header".to_string()))?;
    let allowed = is_local_browser_origin(origin_value)
        || config
            .allowed_origins
            .iter()
            .any(|entry| entry == origin_value);
    if !allowed {
        return Err((StatusCode::FORBIDDEN, "daemon denied origin".to_string()));
    }
    Ok(Some(origin.clone()))
}

pub(crate) fn require_http_auth(
    headers: &HeaderMap,
    config: &DaemonConfig,
) -> Result<(), (StatusCode, String)> {
    if config.require_cf_access_header {
        let has_header = headers
            .get("cf-access-jwt-assertion")
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        if !has_header {
            return Err((
                StatusCode::UNAUTHORIZED,
                "missing cf-access-jwt-assertion header".to_string(),
            ));
        }
        return Ok(());
    }
    let Some(expected) = config.token.as_deref() else {
        return Ok(());
    };
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Err((StatusCode::UNAUTHORIZED, "missing authorization header".to_string()));
    };
    let value = value
        .to_str()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid authorization header".to_string()))?;
    let provided = value.strip_prefix("Bearer ").unwrap_or_default();
    if provided != expected {
        return Err((StatusCode::UNAUTHORIZED, "invalid authorization token".to_string()));
    }
    Ok(())
}

pub(crate) fn apply_cors_headers(
    headers: &HeaderMap,
    allowed_origin: Option<HeaderValue>,
    response: impl IntoResponse,
) -> Response {
    let mut response = response.into_response();
    if let Some(origin) = allowed_origin {
        let response_headers = response.headers_mut();
        response_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        response_headers.insert(
            header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
            HeaderValue::from_static("true"),
        );
        response_headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        if let Some(request_headers) = headers.get(header::ACCESS_CONTROL_REQUEST_HEADERS) {
            response_headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                request_headers.clone(),
            );
        } else {
            response_headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static("content-type, authorization"),
            );
        }
        response_headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response
}

pub(crate) fn error_response(
    headers: &HeaderMap,
    allowed_origin: Option<HeaderValue>,
    error: (StatusCode, String),
) -> Response {
    apply_cors_headers(
        headers,
        allowed_origin,
        (
            error.0,
            Json(HttpErrorResponse {
                error: HttpErrorBody { message: error.1 },
            }),
        ),
    )
}
