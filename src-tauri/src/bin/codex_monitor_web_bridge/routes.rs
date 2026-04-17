use crate::auth::require_bridge_headers;
use crate::state::BridgeState;
use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::IntoResponse;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const ALLOWED_RPC_METHODS: &[&str] = &[
    "list_workspaces",
    "add_workspace",
    "connect_workspace",
    "list_threads",
    "start_thread",
    "read_thread",
    "resume_thread",
    "set_thread_name",
    "archive_thread",
    "send_user_message",
    "turn_interrupt",
    "thread_live_subscribe",
    "thread_live_unsubscribe",
    "get_git_status",
    "get_git_diffs",
    "get_git_log",
    "list_git_branches",
    "get_git_commit_diff",
    "get_git_remote",
    "get_app_settings",
    "update_app_settings",
    "get_config_model",
    "model_list",
    "collaboration_mode_list",
    "skills_list",
    "apps_list",
    "prompts_list",
    "account_rate_limits",
    "account_read",
];

#[derive(Deserialize)]
struct RpcRequest {
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct RpcResultResponse {
    result: Value,
}

#[derive(Serialize)]
struct RpcErrorResponse {
    error: RpcErrorBody,
}

#[derive(Serialize)]
struct RpcErrorBody {
    message: String,
}

pub(crate) fn build_router(state: BridgeState) -> Router {
    Router::new()
        .route("/api/rpc", post(rpc_handler).options(preflight_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
}

fn is_local_browser_origin(origin: &str) -> bool {
    origin.starts_with("http://127.0.0.1:")
        || origin.starts_with("http://localhost:")
        || origin.starts_with("https://127.0.0.1:")
        || origin.starts_with("https://localhost:")
}

fn resolve_allowed_origin(
    headers: &HeaderMap,
    state: &BridgeState,
) -> Result<Option<HeaderValue>, (StatusCode, String)> {
    let Some(origin) = headers.get(header::ORIGIN) else {
        return Ok(None);
    };
    let origin_value = origin
        .to_str()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid origin header".to_string()))?;
    let allowed = is_local_browser_origin(origin_value)
        || state
            .config
            .allowed_origins
            .iter()
            .any(|entry| entry == origin_value);
    if !allowed {
        return Err((StatusCode::FORBIDDEN, "bridge denied origin".to_string()));
    }
    Ok(Some(origin.clone()))
}

fn apply_cors_headers(
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
            HeaderValue::from_static("POST, OPTIONS"),
        );
        if let Some(request_headers) = headers.get(header::ACCESS_CONTROL_REQUEST_HEADERS) {
            response_headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, request_headers.clone());
        } else {
            response_headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static("content-type, cf-access-jwt-assertion"),
            );
        }
        response_headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response
}

fn error_response(
    headers: &HeaderMap,
    allowed_origin: Option<HeaderValue>,
    error: (StatusCode, String),
) -> Response {
    apply_cors_headers(
        headers,
        allowed_origin,
        (
            error.0,
            Json(RpcErrorResponse {
                error: RpcErrorBody { message: error.1 },
            }),
        ),
    )
}

async fn preflight_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state)
        .map_err(|error| error_response(&headers, None, error))?;
    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        StatusCode::NO_CONTENT,
    ))
}

async fn rpc_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state)
        .map_err(|error| error_response(&headers, None, error))?;
    require_bridge_headers(&headers, state.config.require_cf_access_header)
        .map_err(|error| error_response(&headers, allowed_origin.clone(), error))?;

    if !ALLOWED_RPC_METHODS.contains(&request.method.as_str()) {
        return Err(error_response(&headers, allowed_origin.clone(), (
            StatusCode::FORBIDDEN,
            "bridge denied method".to_string(),
        )));
    }

    let result = state
        .daemon_client
        .call(&request.method, request.params)
        .await
        .map_err(|message| error_response(&headers, allowed_origin.clone(), (StatusCode::BAD_GATEWAY, message)))?;

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        Json(RpcResultResponse { result }),
    ))
}

async fn ws_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
    websocket: WebSocketUpgrade,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state)
        .map_err(|error| error_response(&headers, None, error))?;
    require_bridge_headers(&headers, state.config.require_cf_access_header)
        .map_err(|error| error_response(&headers, allowed_origin.clone(), error))?;
    let mut events = state.daemon_client.subscribe();

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        websocket.on_upgrade(move |mut socket| async move {
            loop {
                let message = match events.recv().await {
                    Ok(message) => message,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                };

                if socket.send(Message::Text(message.into())).await.is_err() {
                    break;
                }
            }
        }),
    ))
}

#[cfg(test)]
pub(crate) fn test_state() -> BridgeState {
    BridgeState {
        config: crate::config::BridgeConfig {
            listen: "127.0.0.1:8787".parse().expect("listen"),
            daemon_host: "127.0.0.1:4732".to_string(),
            daemon_token: None,
            require_cf_access_header: true,
            allowed_origins: vec![],
        },
        daemon_client: crate::daemon_client::DaemonClient::test_client(),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_router, test_state};
    use axum::body::Body;
    use axum::http::{header, HeaderValue, Request, StatusCode};
    use tower::ServiceExt;

    #[test]
    fn rejects_methods_outside_the_allowlist() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let app = build_router(test_state());
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(r#"{"method":"delete_everything","params":{}}"#))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::FORBIDDEN);
            });
    }

    #[test]
    fn rejects_rpc_without_cloudflare_header_when_required() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let app = build_router(test_state());
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .body(Body::from(r#"{"method":"list_workspaces","params":{}}"#))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            });
    }

    #[test]
    fn handles_cors_preflight_for_local_dev_origin() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let app = build_router(test_state());
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("OPTIONS")
                            .uri("/api/rpc")
                            .header(header::ORIGIN, "http://127.0.0.1:1424")
                            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                            .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::NO_CONTENT);
                assert_eq!(
                    response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
                    Some(&HeaderValue::from_static("http://127.0.0.1:1424"))
                );
                assert_eq!(
                    response
                        .headers()
                        .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS),
                    Some(&HeaderValue::from_static("true"))
                );
            });
    }

    #[test]
    fn includes_cors_headers_on_rpc_errors_for_allowed_origin() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let app = build_router(test_state());
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header(header::ORIGIN, "http://127.0.0.1:1424")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(r#"{"method":"delete_everything","params":{}}"#))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::FORBIDDEN);
                assert_eq!(
                    response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
                    Some(&HeaderValue::from_static("http://127.0.0.1:1424"))
                );
            });
    }
}
