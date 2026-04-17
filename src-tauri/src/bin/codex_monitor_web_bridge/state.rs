use crate::config::BridgeConfig;
use crate::daemon_client::DaemonClient;

#[derive(Clone)]
pub(crate) struct BridgeState {
    pub(crate) config: BridgeConfig,
    pub(crate) daemon_client: DaemonClient,
}

pub(crate) async fn build(config: BridgeConfig) -> Result<BridgeState, String> {
    let daemon_client =
        DaemonClient::connect(config.daemon_host.clone(), config.daemon_token.clone()).await?;

    Ok(BridgeState {
        config,
        daemon_client,
    })
}

#[cfg(test)]
mod tests {
    use super::BridgeState;

    #[test]
    fn bridge_state_is_cloneable() {
        fn assert_clone<T: Clone>() {}
        assert_clone::<BridgeState>();
    }
}
