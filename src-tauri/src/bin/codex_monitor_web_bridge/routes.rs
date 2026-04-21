use crate::auth::require_bridge_headers;
use crate::web_runtime_capabilities::{
    bridge_all_allowed_rpc_methods, bridge_capabilities_v1,
};
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
        .route("/api/capabilities", get(capabilities_handler))
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
            response_headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                request_headers.clone(),
            );
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

async fn capabilities_handler(
    State(state): State<BridgeState>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let allowed_origin = resolve_allowed_origin(&headers, &state)
        .map_err(|error| error_response(&headers, None, error))?;

    Ok(apply_cors_headers(
        &headers,
        allowed_origin,
        Json(bridge_capabilities_v1()),
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

    if !bridge_all_allowed_rpc_methods().contains(&request.method.as_str()) {
        return Err(error_response(
            &headers,
            allowed_origin.clone(),
            (StatusCode::FORBIDDEN, "bridge denied method".to_string()),
        ));
    }

    let result = state
        .daemon_client
        .call(&request.method, request.params)
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
    use crate::config::BridgeConfig;
    use crate::daemon_client::test_client_pair;
    use crate::web_runtime_capabilities::bridge_capabilities_v1;
    use crate::state::BridgeState;
    use axum::body::{to_bytes, Body};
    use axum::http::{header, HeaderValue, Request, StatusCode};
    use serde_json::json;
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};
    use tower::ServiceExt;

    fn test_state_with_client(daemon_client: crate::daemon_client::DaemonClient) -> BridgeState {
        BridgeState {
            config: BridgeConfig {
                listen: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8787),
                daemon_host: "127.0.0.1:4732".to_string(),
                daemon_token: None,
                require_cf_access_header: true,
                allowed_origins: vec![],
            },
            daemon_client,
        }
    }

    #[test]
    fn returns_bridge_capabilities() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let app = build_router(test_state());
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("GET")
                            .uri("/api/capabilities")
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let actual = serde_json::from_slice::<serde_json::Value>(&body).unwrap();
                let expected = serde_json::to_value(bridge_capabilities_v1()).unwrap();
                assert_eq!(actual, expected);
            });
    }

    #[test]
    fn advertised_thread_controls_have_matching_methods() {
        let capabilities = bridge_capabilities_v1();
        let methods = capabilities.methods;

        assert!(capabilities.thread_controls.steer);
        assert!(methods.contains(&"turn_steer"));
        assert!(capabilities.thread_controls.fork);
        assert!(methods.contains(&"fork_thread"));
        assert!(capabilities.thread_controls.compact);
        assert!(methods.contains(&"compact_thread"));
        assert!(capabilities.thread_controls.review);
        assert!(methods.contains(&"start_review"));
        assert!(capabilities.thread_controls.mcp);
        assert!(methods.contains(&"list_mcp_server_status"));
    }

    #[test]
    fn advertises_workspace_tree_file_support() {
        let capabilities = bridge_capabilities_v1();
        let methods = capabilities.methods;

        assert!(capabilities.files.workspace_tree);
        assert!(methods.contains(&"list_workspace_files"));
        assert!(methods.contains(&"read_workspace_file"));
    }

    #[test]
    fn advertises_workspace_agent_file_support() {
        let capabilities = bridge_capabilities_v1();
        let methods = capabilities.methods;

        assert!(capabilities.files.workspace_agents);
        assert!(methods.contains(&"read_workspace_agent_md"));
    }

    #[test]
    fn advertises_usage_snapshot_operation_support() {
        let capabilities = bridge_capabilities_v1();
        let methods = capabilities.methods;

        assert!(capabilities.operations.usage_snapshot);
        assert!(methods.contains(&"local_usage_snapshot"));
    }

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
    fn forwards_thread_control_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let requests = [
                    (
                        "turn_steer",
                        json!({
                            "workspaceId": "ws-1",
                            "threadId": "thread-1",
                            "turnId": "turn-1",
                            "text": "please revise",
                            "images": [],
                            "appMentions": []
                        }),
                    ),
                    (
                        "fork_thread",
                        json!({
                            "workspaceId": "ws-1",
                            "threadId": "thread-1"
                        }),
                    ),
                    (
                        "compact_thread",
                        json!({
                            "workspaceId": "ws-1",
                            "threadId": "thread-1"
                        }),
                    ),
                ];

                for (method, params) in requests {
                    let (client, mut server) = test_client_pair().await;
                    server.enqueue_result(1, json!({})).await;
                    let app = build_router(test_state_with_client(client));
                    let response = app
                        .oneshot(
                            Request::builder()
                                .method("POST")
                                .uri("/api/rpc")
                                .header("content-type", "application/json")
                                .header("cf-access-jwt-assertion", "present")
                                .body(Body::from(
                                    json!({ "method": method, "params": params }).to_string(),
                                ))
                                .unwrap(),
                        )
                        .await
                        .unwrap();

                    assert_eq!(
                        response.status(),
                        StatusCode::OK,
                        "{method} should be allowed"
                    );
                    assert_eq!(server.last_method().await, method);
                    assert_eq!(server.last_params().await, params);
                }
            });
    }

    #[test]
    fn forwards_review_and_mcp_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let requests = [
                    (
                        "start_review",
                        json!({
                            "workspaceId": "ws-1",
                            "threadId": "thread-1",
                            "target": { "type": "uncommittedChanges" },
                            "delivery": "detached"
                        }),
                    ),
                    (
                        "list_mcp_server_status",
                        json!({
                            "workspaceId": "ws-1",
                            "cursor": null,
                            "limit": null
                        }),
                    ),
                ];

                for (method, params) in requests {
                    let (client, mut server) = test_client_pair().await;
                    server.enqueue_result(1, json!({})).await;
                    let app = build_router(test_state_with_client(client));
                    let response = app
                        .oneshot(
                            Request::builder()
                                .method("POST")
                                .uri("/api/rpc")
                                .header("content-type", "application/json")
                                .header("cf-access-jwt-assertion", "present")
                                .body(Body::from(
                                    json!({ "method": method, "params": params }).to_string(),
                                ))
                                .unwrap(),
                        )
                        .await
                        .unwrap();

                    assert_eq!(response.status(), StatusCode::OK, "{method} should be allowed");
                    assert_eq!(server.last_method().await, method);
                    assert_eq!(server.last_params().await, params);
                }
            });
    }

    #[test]
    fn forwards_workspace_file_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let requests = [
                    (
                        "list_workspace_files",
                        json!({
                            "workspaceId": "ws-1"
                        }),
                    ),
                    (
                        "read_workspace_file",
                        json!({
                            "workspaceId": "ws-1",
                            "path": "src/main.ts"
                        }),
                    ),
                ];

                for (method, params) in requests {
                    let (client, mut server) = test_client_pair().await;
                    server.enqueue_result(1, json!({})).await;
                    let app = build_router(test_state_with_client(client));
                    let response = app
                        .oneshot(
                            Request::builder()
                                .method("POST")
                                .uri("/api/rpc")
                                .header("content-type", "application/json")
                                .header("cf-access-jwt-assertion", "present")
                                .body(Body::from(
                                    json!({ "method": method, "params": params }).to_string(),
                                ))
                                .unwrap(),
                        )
                        .await
                        .unwrap();

                    assert_eq!(response.status(), StatusCode::OK, "{method} should be allowed");
                    assert_eq!(server.last_method().await, method);
                    assert_eq!(server.last_params().await, params);
                }
            });
    }

    #[test]
    fn forwards_workspace_agent_read_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                let params = json!({
                    "workspaceId": "ws-1"
                });
                server
                    .enqueue_result(
                        1,
                        json!({
                            "exists": true,
                            "content": "# Agent",
                            "truncated": false
                        }),
                    )
                    .await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                json!({
                                    "method": "read_workspace_agent_md",
                                    "params": params
                                })
                                .to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(server.last_method().await, "read_workspace_agent_md");
                assert_eq!(server.last_params().await, params);
            });
    }

    #[test]
    fn forwards_local_usage_snapshot_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                let params = json!({
                    "days": 30,
                    "workspacePath": "/srv/app"
                });
                server
                    .enqueue_result(
                        1,
                        json!({
                            "updatedAt": 0,
                            "days": [],
                            "totals": {
                                "last7DaysTokens": 0,
                                "last30DaysTokens": 0,
                                "averageDailyTokens": 0,
                                "cacheHitRatePercent": 0.0,
                                "peakDay": null,
                                "peakDayTokens": 0
                            },
                            "topModels": []
                        }),
                    )
                    .await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                json!({
                                    "method": "local_usage_snapshot",
                                    "params": params
                                })
                                .to_string(),
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(server.last_method().await, "local_usage_snapshot");
                assert_eq!(server.last_params().await, params);
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

    #[test]
    fn forwards_approval_reply_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                server.enqueue_result(1, json!({})).await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                r#"{"method":"respond_to_server_request","params":{"workspaceId":"ws-1","requestId":7,"result":{"decision":"accept"}}}"#,
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(server.last_method().await, "respond_to_server_request");
            });
    }

    #[test]
    fn forwards_approval_rule_remember_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                server.enqueue_result(1, json!({})).await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                r#"{"method":"remember_approval_rule","params":{"workspaceId":"ws-1","command":["git","status"]}}"#,
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(server.last_method().await, "remember_approval_rule");
            });
    }

    #[test]
    fn forwards_git_write_and_branch_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let methods = [
                    "stage_git_file",
                    "stage_git_all",
                    "unstage_git_file",
                    "revert_git_file",
                    "revert_git_all",
                    "commit_git",
                    "fetch_git",
                    "pull_git",
                    "push_git",
                    "sync_git",
                    "checkout_git_branch",
                    "create_git_branch",
                ];

                for method in methods {
                    let (client, mut server) = test_client_pair().await;
                    server.enqueue_result(1, json!({})).await;
                    let app = build_router(test_state_with_client(client));
                    let response = app
                        .oneshot(
                            Request::builder()
                                .method("POST")
                                .uri("/api/rpc")
                                .header("content-type", "application/json")
                                .header("cf-access-jwt-assertion", "present")
                                .body(Body::from(
                                    json!({
                                        "method": method,
                                        "params": {
                                            "workspaceId": "ws-1",
                                            "path": "src/main.ts",
                                            "message": "feat: bridge",
                                            "name": "feature/bridge"
                                        }
                                    })
                                    .to_string(),
                                ))
                                .unwrap(),
                        )
                        .await
                        .unwrap();

                    assert_eq!(
                        response.status(),
                        StatusCode::OK,
                        "{method} should be allowed"
                    );
                    assert_eq!(server.last_method().await, method);
                }
            });
    }

    #[test]
    fn forwards_workspace_maintenance_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let requests = [
                    (
                        "add_workspace_from_git_url",
                        json!({
                            "url": "https://example.com/org/repo.git",
                            "destinationPath": "/srv/repos",
                            "targetFolderName": "repo"
                        }),
                    ),
                    ("remove_workspace", json!({ "id": "ws-1" })),
                    ("remove_worktree", json!({ "id": "wt-1" })),
                    (
                        "rename_worktree",
                        json!({ "id": "wt-1", "branch": "feature/new" }),
                    ),
                    (
                        "rename_worktree_upstream",
                        json!({
                            "id": "wt-1",
                            "oldBranch": "feature/old",
                            "newBranch": "feature/new"
                        }),
                    ),
                    ("apply_worktree_changes", json!({ "workspaceId": "wt-1" })),
                    (
                        "set_workspace_runtime_codex_args",
                        json!({
                            "workspaceId": "ws-1",
                            "codexArgs": "--model gpt-5.4"
                        }),
                    ),
                ];

                for (method, params) in requests {
                    let (client, mut server) = test_client_pair().await;
                    server.enqueue_result(1, json!({})).await;
                    let app = build_router(test_state_with_client(client));
                    let response = app
                        .oneshot(
                            Request::builder()
                                .method("POST")
                                .uri("/api/rpc")
                                .header("content-type", "application/json")
                                .header("cf-access-jwt-assertion", "present")
                                .body(Body::from(
                                    json!({ "method": method, "params": params }).to_string(),
                                ))
                                .unwrap(),
                        )
                        .await
                        .unwrap();

                    assert_eq!(
                        response.status(),
                        StatusCode::OK,
                        "{method} should be allowed"
                    );
                    assert_eq!(server.last_method().await, method);
                }
            });
    }

    #[test]
    fn forwards_prompt_create_requests() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                server.enqueue_result(1, json!({ "ok": true })).await;
                let app = build_router(test_state_with_client(client));
                let response = app
                    .oneshot(
                        Request::builder()
                            .method("POST")
                            .uri("/api/rpc")
                            .header("content-type", "application/json")
                            .header("cf-access-jwt-assertion", "present")
                            .body(Body::from(
                                r#"{"method":"prompts_create","params":{"workspaceId":"ws-1","scope":"workspace","name":"fix-tests","description":"Tighten coverage","argumentHint":"$TARGET","content":"Run tests"}}"#,
                            ))
                            .unwrap(),
                    )
                    .await
                    .unwrap();

                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(server.last_method().await, "prompts_create");
            });
    }
}
