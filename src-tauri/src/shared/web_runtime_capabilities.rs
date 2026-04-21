use serde::Serialize;

const BRIDGE_ALLOWED_RPC_METHODS: &[&str] = &[
    "list_workspaces",
    "add_workspace",
    "add_workspace_from_git_url",
    "connect_workspace",
    "remove_workspace",
    "remove_worktree",
    "rename_worktree",
    "rename_worktree_upstream",
    "apply_worktree_changes",
    "list_workspace_files",
    "read_workspace_file",
    "read_workspace_agent_md",
    "read_global_agents_md",
    "read_global_codex_config_toml",
    "codex_doctor_current_config",
    "set_workspace_runtime_codex_args",
    "list_threads",
    "start_thread",
    "read_thread",
    "resume_thread",
    "set_thread_name",
    "archive_thread",
    "send_user_message",
    "turn_interrupt",
    "turn_steer",
    "fork_thread",
    "compact_thread",
    "start_review",
    "list_mcp_server_status",
    "thread_live_subscribe",
    "thread_live_unsubscribe",
    "get_git_status",
    "get_git_diffs",
    "get_git_log",
    "list_git_branches",
    "get_git_commit_diff",
    "get_git_remote",
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
    "get_app_settings",
    "update_app_settings",
    "local_usage_snapshot",
    "get_config_model",
    "model_list",
    "collaboration_mode_list",
    "skills_list",
    "apps_list",
    "prompts_list",
    "prompts_create",
    "prompts_update",
    "prompts_delete",
    "prompts_move",
    "account_rate_limits",
    "account_read",
    "respond_to_server_request",
    "remember_approval_rule",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebRuntimeCapabilities {
    pub(crate) version: u32,
    pub(crate) methods: Vec<&'static str>,
    pub(crate) thread_controls: ThreadControlCapabilities,
    pub(crate) files: FileCapabilities,
    pub(crate) operations: OperationsCapabilities,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ThreadControlCapabilities {
    pub(crate) steer: bool,
    pub(crate) fork: bool,
    pub(crate) compact: bool,
    pub(crate) review: bool,
    pub(crate) mcp: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileCapabilities {
    pub(crate) workspace_tree: bool,
    pub(crate) workspace_agents: bool,
    pub(crate) global_agents: bool,
    pub(crate) global_config: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationsCapabilities {
    pub(crate) usage_snapshot: bool,
    pub(crate) doctor_report: bool,
    pub(crate) feature_flags: bool,
}

pub(crate) fn bridge_capabilities_v1() -> WebRuntimeCapabilities {
    WebRuntimeCapabilities {
        version: 1,
        methods: bridge_all_allowed_rpc_methods().to_vec(),
        thread_controls: ThreadControlCapabilities {
            steer: true,
            fork: true,
            compact: true,
            review: true,
            mcp: true,
        },
        files: FileCapabilities {
            workspace_tree: true,
            workspace_agents: true,
            global_agents: true,
            global_config: true,
        },
        operations: OperationsCapabilities {
            usage_snapshot: true,
            doctor_report: true,
            feature_flags: false,
        },
    }
}

pub(crate) fn bridge_all_allowed_rpc_methods() -> &'static [&'static str] {
    BRIDGE_ALLOWED_RPC_METHODS
}
