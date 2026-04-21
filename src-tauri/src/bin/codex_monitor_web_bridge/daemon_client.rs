use crate::daemon_wire::{build_request_line, parse_incoming_line, IncomingMessage};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};

#[cfg(test)]
use std::collections::VecDeque;

const DAEMON_EVENT_BUFFER: usize = 256;
const DAEMON_OUTBOUND_BUFFER: usize = 256;
const BRIDGE_DISCONNECTED_MESSAGE: &str = "bridge lost daemon connection";

#[derive(Clone)]
pub(crate) struct DaemonClient {
    inner: Arc<DaemonClientInner>,
}

struct DaemonClientInner {
    out_tx: mpsc::Sender<String>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: AtomicU64,
    events_tx: broadcast::Sender<String>,
    connected: AtomicBool,
}

impl DaemonClient {
    pub(crate) async fn connect(host: String, token: Option<String>) -> Result<Self, String> {
        let stream = TcpStream::connect(&host)
            .await
            .map_err(|err| format!("failed to connect to daemon at {host}: {err}"))?;
        let (reader, writer) = stream.into_split();
        let client = Self::from_io(reader, writer);
        if let Some(token) = token {
            client.call("auth", json!({ "token": token })).await?;
        }
        Ok(client)
    }

    pub(crate) async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.inner.connected.load(Ordering::SeqCst) {
            return Err(BRIDGE_DISCONNECTED_MESSAGE.to_string());
        }

        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.inner.pending.lock().await.insert(id, tx);

        let line = build_request_line(id, method, params)?;
        if self.inner.out_tx.send(line).await.is_err() {
            self.inner.pending.lock().await.remove(&id);
            self.mark_disconnected().await;
            return Err(BRIDGE_DISCONNECTED_MESSAGE.to_string());
        }

        match rx.await {
            Ok(result) => result,
            Err(_) => {
                self.mark_disconnected().await;
                Err("bridge lost daemon response channel".to_string())
            }
        }
    }

    pub(crate) fn subscribe(&self) -> broadcast::Receiver<String> {
        self.inner.events_tx.subscribe()
    }

    fn from_io<R, W>(reader: R, writer: W) -> Self
    where
        R: AsyncRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        let (out_tx, mut out_rx) = mpsc::channel::<String>(DAEMON_OUTBOUND_BUFFER);
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let (events_tx, _) = broadcast::channel(DAEMON_EVENT_BUFFER);
        let inner = Arc::new(DaemonClientInner {
            out_tx,
            pending: Arc::clone(&pending),
            next_id: AtomicU64::new(1),
            events_tx,
            connected: AtomicBool::new(true),
        });

        let inner_for_writer = Arc::clone(&inner);
        tokio::spawn(async move {
            let mut writer = writer;
            while let Some(message) = out_rx.recv().await {
                if writer.write_all(message.as_bytes()).await.is_err()
                    || writer.write_all(b"\n").await.is_err()
                {
                    mark_disconnected(&inner_for_writer).await;
                    break;
                }
            }
        });

        let inner_for_reader = Arc::clone(&inner);
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let Some(message) = parse_incoming_line(trimmed) else {
                    continue;
                };

                match message {
                    IncomingMessage::Response { id, payload } => {
                        if let Some(sender) = inner_for_reader.pending.lock().await.remove(&id) {
                            let _ = sender.send(payload);
                        }
                    }
                    IncomingMessage::Notification { .. } => {
                        let _ = inner_for_reader.events_tx.send(trimmed.to_string());
                    }
                }
            }

            mark_disconnected(&inner_for_reader).await;
        });

        Self { inner }
    }

    async fn mark_disconnected(&self) {
        mark_disconnected(&self.inner).await;
    }

    #[cfg(test)]
    pub(crate) fn test_client() -> Self {
        let (stream_a, _stream_b) = tokio::io::duplex(64);
        let (reader, writer) = tokio::io::split(stream_a);
        Self::from_io(reader, writer)
    }
}

async fn mark_disconnected(inner: &Arc<DaemonClientInner>) {
    inner.connected.store(false, Ordering::SeqCst);
    let mut pending = inner.pending.lock().await;
    for (_, sender) in pending.drain() {
        let _ = sender.send(Err(BRIDGE_DISCONNECTED_MESSAGE.to_string()));
    }
}

#[cfg(test)]
pub(crate) async fn test_client_pair() -> (DaemonClient, TestServer) {
    let (client_stream, server_stream) = tokio::io::duplex(1024);
    let (client_reader, client_writer) = tokio::io::split(client_stream);
    let (server_reader, server_writer) = tokio::io::split(server_stream);
    let client = DaemonClient::from_io(client_reader, client_writer);
    let server = TestServer::new(server_reader, server_writer);
    (client, server)
}

#[cfg(test)]
pub(crate) struct TestServer {
    responses: Arc<Mutex<VecDeque<String>>>,
    last_method: Arc<Mutex<Option<String>>>,
    last_params: Arc<Mutex<Option<Value>>>,
}

#[cfg(test)]
impl TestServer {
    fn new<R, W>(reader: R, mut writer: W) -> Self
    where
        R: AsyncRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        let responses = Arc::new(Mutex::new(VecDeque::<String>::new()));
        let last_method = Arc::new(Mutex::new(None));
        let last_params = Arc::new(Mutex::new(None));
        let responses_for_task = Arc::clone(&responses);
        let last_method_for_task = Arc::clone(&last_method);
        let last_params_for_task = Arc::clone(&last_params);

        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let value: Value = serde_json::from_str(trimmed).expect("request json");
                let method = value
                    .get("method")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let params = value.get("params").cloned().unwrap_or(Value::Null);
                *last_method_for_task.lock().await = Some(method);
                *last_params_for_task.lock().await = Some(params);

                while let Some(response) = responses_for_task.lock().await.pop_front() {
                    writer
                        .write_all(response.as_bytes())
                        .await
                        .expect("write response");
                    writer.write_all(b"\n").await.expect("write newline");
                }
            }
        });

        Self {
            responses,
            last_method,
            last_params,
        }
    }

    pub(crate) async fn enqueue_result(&mut self, id: u64, result: Value) {
        self.responses
            .lock()
            .await
            .push_back(serde_json::to_string(&json!({ "id": id, "result": result })).unwrap());
    }

    pub(crate) async fn enqueue_notification(&mut self, method: &str, params: Value) {
        self.responses.lock().await.push_back(
            serde_json::to_string(&json!({ "method": method, "params": params })).unwrap(),
        );
    }

    pub(crate) async fn last_method(&self) -> String {
        for _ in 0..20 {
            if let Some(method) = self.last_method.lock().await.clone() {
                return method;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("expected method");
    }

    pub(crate) async fn last_params(&self) -> Value {
        for _ in 0..20 {
            if let Some(params) = self.last_params.lock().await.clone() {
                return params;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("expected params");
    }
}

#[cfg(test)]
mod tests {
    use super::test_client_pair;
    use serde_json::json;

    #[test]
    fn forwards_rpc_requests_to_the_daemon_connection() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                server.enqueue_result(1, json!({ "ok": true })).await;

                let result = client.call("list_workspaces", json!({})).await.unwrap();

                assert_eq!(result["ok"], true);
                assert_eq!(server.last_method().await, "list_workspaces");
            });
    }

    #[test]
    fn broadcasts_notifications_to_subscribers() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let (client, mut server) = test_client_pair().await;
                let mut events = client.subscribe();
                server
                    .enqueue_notification("app-server-event", json!({ "workspace_id": "ws-1" }))
                    .await;
                server.enqueue_result(1, json!({ "ok": true })).await;

                let _ = client.call("list_workspaces", json!({})).await.unwrap();
                let event = events.recv().await.expect("event");

                assert_eq!(
                    event,
                    r#"{"method":"app-server-event","params":{"workspace_id":"ws-1"}}"#
                );
            });
    }
}
