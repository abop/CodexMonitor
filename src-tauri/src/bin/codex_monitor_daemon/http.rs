#[path = "http/auth.rs"]
mod auth;
#[path = "http/routes.rs"]
mod routes;

use super::*;

#[derive(Clone)]
pub(crate) struct HttpState {
    pub(crate) config: Arc<DaemonConfig>,
    pub(crate) daemon_state: Arc<DaemonState>,
    pub(crate) events_tx: broadcast::Sender<DaemonEvent>,
}

pub(crate) async fn serve(
    listener: tokio::net::TcpListener,
    config: Arc<DaemonConfig>,
    daemon_state: Arc<DaemonState>,
    events_tx: broadcast::Sender<DaemonEvent>,
) -> Result<(), std::io::Error> {
    let http_state = HttpState {
        config,
        daemon_state,
        events_tx,
    };
    axum::serve(listener, routes::build_router(http_state)).await
}
