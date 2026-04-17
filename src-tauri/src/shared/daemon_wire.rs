use serde_json::{json, Value};

pub(crate) const DEFAULT_REMOTE_HOST: &str = "127.0.0.1:4732";
pub(crate) const DISCONNECTED_MESSAGE: &str = "remote backend disconnected";

pub(crate) enum IncomingMessage {
    Response {
        id: u64,
        payload: Result<Value, String>,
    },
    Notification {
        method: String,
        params: Value,
    },
}

pub(crate) fn build_request_line(id: u64, method: &str, params: Value) -> Result<String, String> {
    let request = json!({
        "id": id,
        "method": method,
        "params": params,
    });
    serde_json::to_string(&request).map_err(|err| err.to_string())
}

pub(crate) fn parse_incoming_line(line: &str) -> Option<IncomingMessage> {
    let message: Value = serde_json::from_str(line).ok()?;

    if let Some(id) = message.get("id").and_then(Value::as_u64) {
        if let Some(error) = message.get("error") {
            let error_message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("remote error")
                .to_string();
            return Some(IncomingMessage::Response {
                id,
                payload: Err(error_message),
            });
        }

        return Some(IncomingMessage::Response {
            id,
            payload: Ok(message.get("result").cloned().unwrap_or(Value::Null)),
        });
    }

    let method = message.get("method").and_then(Value::as_str)?;
    if method.is_empty() {
        return None;
    }
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(IncomingMessage::Notification {
        method: method.to_string(),
        params,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_request_line, parse_incoming_line, IncomingMessage};
    use serde_json::json;

    #[test]
    fn builds_request_lines_with_id_method_and_params() {
        let line = build_request_line(7, "list_workspaces", json!({ "scope": "all" }))
            .expect("request line");
        let value: serde_json::Value = serde_json::from_str(&line).expect("json");

        assert_eq!(value["id"], 7);
        assert_eq!(value["method"], "list_workspaces");
        assert_eq!(value["params"], json!({ "scope": "all" }));
    }

    #[test]
    fn parses_response_and_notification_lines() {
        let response =
            parse_incoming_line(r#"{"id":2,"result":{"ok":true}}"#).expect("response message");
        match response {
            IncomingMessage::Response { id, payload } => {
                assert_eq!(id, 2);
                assert_eq!(payload.expect("result"), json!({ "ok": true }));
            }
            IncomingMessage::Notification { .. } => panic!("expected response"),
        }

        let notification = parse_incoming_line(
            r#"{"method":"app-server-event","params":{"workspace_id":"ws-1"}}"#,
        )
        .expect("notification message");
        match notification {
            IncomingMessage::Notification { method, params } => {
                assert_eq!(method, "app-server-event");
                assert_eq!(params, json!({ "workspace_id": "ws-1" }));
            }
            IncomingMessage::Response { .. } => panic!("expected notification"),
        }
    }

    #[test]
    fn parses_error_responses() {
        let response = parse_incoming_line(r#"{"id":9,"error":{"message":"nope"}}"#)
            .expect("response message");

        match response {
            IncomingMessage::Response { id, payload } => {
                assert_eq!(id, 9);
                assert_eq!(payload.expect_err("error"), "nope");
            }
            IncomingMessage::Notification { .. } => panic!("expected response"),
        }
    }

    #[test]
    fn ignores_empty_notification_methods() {
        assert!(parse_incoming_line(r#"{"method":"","params":{}}"#).is_none());
    }
}
