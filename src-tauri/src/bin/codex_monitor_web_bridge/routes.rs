use crate::auth::require_bridge_headers;
use crate::state::BridgeState;
use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
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
        .route("/api/rpc", post(rpc_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
}

async fn rpc_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Result<Json<RpcResultResponse>, (StatusCode, Json<RpcErrorResponse>)> {
    require_bridge_headers(&headers, state.config.require_cf_access_header)
        .map_err(error_response)?;

    if !ALLOWED_RPC_METHODS.contains(&request.method.as_str()) {
        return Err(error_response((
            StatusCode::FORBIDDEN,
            "bridge denied method".to_string(),
        )));
    }

    let result = state
        .daemon_client
        .call(&request.method, request.params)
        .await
        .map_err(|message| error_response((StatusCode::BAD_GATEWAY, message)))?;

    Ok(Json(RpcResultResponse { result }))
}

async fn ws_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
    websocket: WebSocketUpgrade,
) -> Result<impl IntoResponse, (StatusCode, Json<RpcErrorResponse>)> {
    require_bridge_headers(&headers, state.config.require_cf_access_header)
        .map_err(error_response)?;
    let mut events = state.daemon_client.subscribe();

    Ok(websocket.on_upgrade(move |mut socket| async move {
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
    }))
}

fn error_response(error: (StatusCode, String)) -> (StatusCode, Json<RpcErrorResponse>) {
    (
        error.0,
        Json(RpcErrorResponse {
            error: RpcErrorBody { message: error.1 },
        }),
    )
}

#[cfg(test)]
pub(crate) fn test_state() -> BridgeState {
    BridgeState {
        config: crate::config::BridgeConfig {
            listen: "127.0.0.1:8787".parse().expect("listen"),
            daemon_host: "127.0.0.1:4732".to_string(),
            daemon_token: None,
            require_cf_access_header: true,
        },
        daemon_client: crate::daemon_client::DaemonClient::test_client(),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_router, test_state};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
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
}
