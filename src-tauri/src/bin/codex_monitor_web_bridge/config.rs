use crate::daemon_wire::DEFAULT_REMOTE_HOST;
use std::env;
use std::net::SocketAddr;

const DEFAULT_BRIDGE_LISTEN: &str = "127.0.0.1:8787";

#[derive(Clone)]
pub(crate) struct BridgeConfig {
    pub(crate) listen: SocketAddr,
    pub(crate) daemon_host: String,
    pub(crate) daemon_token: Option<String>,
    pub(crate) require_cf_access_header: bool,
    pub(crate) allowed_origins: Vec<String>,
}

pub(crate) fn load_from_env() -> Result<BridgeConfig, String> {
    let listen = env::var("CODEX_MONITOR_WEB_BRIDGE_LISTEN")
        .unwrap_or_else(|_| DEFAULT_BRIDGE_LISTEN.to_string())
        .parse::<SocketAddr>()
        .map_err(|err| format!("invalid CODEX_MONITOR_WEB_BRIDGE_LISTEN: {err}"))?;
    let daemon_host = env::var("CODEX_MONITOR_WEB_BRIDGE_DAEMON_HOST")
        .unwrap_or_else(|_| DEFAULT_REMOTE_HOST.to_string());
    let daemon_token = env::var("CODEX_MONITOR_WEB_BRIDGE_DAEMON_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let require_cf_access_header = env::var("CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER")
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false);
    let allowed_origins = env::var("CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS")
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(BridgeConfig {
        listen,
        daemon_host,
        daemon_token,
        require_cf_access_header,
        allowed_origins,
    })
}

#[cfg(test)]
mod tests {
    use super::{load_from_env, BridgeConfig};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    #[test]
    fn bridge_config_exposes_core_fields() {
        let config = BridgeConfig {
            listen: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8080),
            daemon_host: "127.0.0.1:4732".to_string(),
            daemon_token: Some("secret".to_string()),
            require_cf_access_header: true,
            allowed_origins: vec!["https://bridge.example.com".to_string()],
        };

        assert_eq!(config.listen.port(), 8080);
        assert_eq!(config.daemon_host, "127.0.0.1:4732");
        assert_eq!(config.daemon_token.as_deref(), Some("secret"));
        assert!(config.require_cf_access_header);
        assert_eq!(config.allowed_origins, vec!["https://bridge.example.com"]);
    }

    #[test]
    fn loads_default_bridge_config_from_env() {
        std::env::remove_var("CODEX_MONITOR_WEB_BRIDGE_LISTEN");
        std::env::remove_var("CODEX_MONITOR_WEB_BRIDGE_DAEMON_HOST");
        std::env::remove_var("CODEX_MONITOR_WEB_BRIDGE_DAEMON_TOKEN");
        std::env::remove_var("CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER");
        std::env::remove_var("CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS");

        let config = load_from_env().expect("config");

        assert_eq!(config.listen.port(), 8787);
        assert_eq!(config.daemon_host, "127.0.0.1:4732");
        assert_eq!(config.daemon_token, None);
        assert!(!config.require_cf_access_header);
        assert!(config.allowed_origins.is_empty());
    }
}
