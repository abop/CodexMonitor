#[path = "codex_monitor_web_bridge/auth.rs"]
mod auth;
#[path = "codex_monitor_web_bridge/config.rs"]
mod config;
#[path = "codex_monitor_web_bridge/daemon_client.rs"]
mod daemon_client;
#[allow(dead_code)]
#[path = "../shared/daemon_wire.rs"]
mod daemon_wire;
#[path = "../shared/mod.rs"]
mod shared;
#[path = "codex_monitor_web_bridge/routes.rs"]
mod routes;
#[path = "codex_monitor_web_bridge/state.rs"]
mod state;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime.block_on(async move {
        let config = config::load_from_env()?;
        let state = state::build(config).await?;
        let listener = tokio::net::TcpListener::bind(state.config.listen).await?;
        axum::serve(listener, routes::build_router(state)).await?;
        Ok(())
    })
}
