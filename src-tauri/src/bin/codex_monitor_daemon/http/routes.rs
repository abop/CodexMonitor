use super::auth::{apply_cors_headers, error_response, require_http_auth, resolve_allowed_origin};
use super::HttpState;
use crate::rpc;
use crate::shared::web_runtime_capabilities::{
    web_allowed_rpc_methods, web_capabilities_v1,
};
use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
struct RpcRequest {
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Default, Deserialize)]
struct WsQuery {
    token: Option<String>,
}

#[derive(Serialize)]
struct RpcResultResponse {
    result: Value,
}

pub(crate) fn build_router(state: HttpState) -> Router {
    Router::new()
        .route("/api/capabilities", get(capabilities_handler))
        .route("/api/rpc", post(rpc_handler).options(preflight_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
}

async fn preflight_handler(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state.config)
        .map_err(|error| error_response(&headers, None, error))?;
    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        StatusCode::NO_CONTENT,
    ))
}

async fn capabilities_handler(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state.config)
        .map_err(|error| error_response(&headers, None, error))?;

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        Json(web_capabilities_v1()),
    ))
}

async fn rpc_handler(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state.config)
        .map_err(|error| error_response(&headers, None, error))?;
    require_http_auth(&headers, None, &state.config)
        .map_err(|error| error_response(&headers, allowed_origin.clone(), error))?;

    if !web_allowed_rpc_methods().contains(&request.method.as_str()) {
        return Err(error_response(
            &headers,
            allowed_origin.clone(),
            (StatusCode::FORBIDDEN, "daemon denied method".to_string()),
        ));
    }

    let result = rpc::handle_rpc_request(
        &state.daemon_state,
        &request.method,
        request.params,
        "daemon-http".to_string(),
    )
    .await
    .map_err(|message| {
        error_response(
            &headers,
            allowed_origin.clone(),
            (StatusCode::BAD_GATEWAY, message),
        )
    })?;

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        Json(RpcResultResponse { result }),
    ))
}

async fn ws_handler(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Query(query): Query<WsQuery>,
    websocket: WebSocketUpgrade,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state.config)
        .map_err(|error| error_response(&headers, None, error))?;
    require_http_auth(&headers, query.token.as_deref(), &state.config)
        .map_err(|error| error_response(&headers, allowed_origin.clone(), error))?;
    let mut events = state.events_tx.subscribe();

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        websocket.on_upgrade(move |mut socket| async move {
            loop {
                let event = match events.recv().await {
                    Ok(event) => event,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                };

                let Some(payload) = rpc::serialize_event_notification(event) else {
                    continue;
                };

                if socket.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::build_router;
    use crate::{DaemonConfig, DaemonEvent, DaemonEventSink, DaemonState};
    use axum::body::{to_bytes, Body};
    use axum::http::{header, HeaderValue, Request, StatusCode};
    use serde_json::{json, Value};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};
    use std::sync::Arc;
    use tower::ServiceExt;

    fn test_state() -> super::HttpState {
        let (events_tx, _) = tokio::sync::broadcast::channel(32);
        let config = Arc::new(DaemonConfig {
            listen: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 4732),
            token: Some("test-token".to_string()),
            data_dir: std::env::temp_dir(),
            http_listen: Some(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 4787)),
            allowed_origins: vec!["https://monitor.example.com".to_string()],
            require_cf_access_header: false,
        });
        let daemon_state = Arc::new(DaemonState::load(
            &config,
            DaemonEventSink {
                tx: events_tx.clone(),
            },
        ));
        super::HttpState {
            config,
            daemon_state,
            events_tx,
        }
    }

    async fn parse_body(response: axum::response::Response) -> Value {
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn returns_capabilities() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/capabilities")
                    .header(header::ORIGIN, "https://monitor.example.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = parse_body(response).await;
        assert_eq!(body.get("version").and_then(Value::as_u64), Some(1));
    }

    #[tokio::test]
    async fn rejects_unknown_method() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/rpc")
                    .header("content-type", "application/json")
                    .header(header::ORIGIN, "https://monitor.example.com")
                    .header(header::AUTHORIZATION, "Bearer test-token")
                    .body(Body::from(
                        json!({ "method": "delete_everything", "params": {} }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn rejects_missing_auth_when_token_required() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/rpc")
                    .header("content-type", "application/json")
                    .header(header::ORIGIN, "https://monitor.example.com")
                    .body(Body::from(
                        json!({ "method": "list_workspaces", "params": {} }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_unknown_origin() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/capabilities")
                    .header(header::ORIGIN, "https://evil.example.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn forwards_allowed_rpc_requests() {
        let app = build_router(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/rpc")
                    .header("content-type", "application/json")
                    .header(header::ORIGIN, "https://monitor.example.com")
                    .header(header::AUTHORIZATION, "Bearer test-token")
                    .body(Body::from(
                        json!({ "method": "list_workspaces", "params": {} }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("https://monitor.example.com"))
        );
    }

    #[tokio::test]
    async fn serializes_existing_daemon_events() {
        let state = test_state();
        let mut receiver = state.events_tx.subscribe();
        let _ = state
            .events_tx
            .send(DaemonEvent::AppServer(crate::backend::events::AppServerEvent {
                workspace_id: "ws-1".to_string(),
                message: json!({ "method": "thread/started" }),
            }));
        let event = receiver.recv().await.unwrap();
        let payload = crate::rpc::serialize_event_notification(event).unwrap();
        let value: Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(
            value.get("method").and_then(Value::as_str),
            Some("app-server-event")
        );
    }
}
