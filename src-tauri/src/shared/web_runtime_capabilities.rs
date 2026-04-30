#![allow(dead_code)]

use serde::Serialize;

const WEB_ALLOWED_RPC_METHODS: &[&str] = &[
    "ping",
    "daemon_info",
    "get_app_settings",
    "update_app_settings",
    "list_workspaces",
    "is_workspace_path_dir",
    "add_workspace",
    "add_workspace_from_git_url",
    "add_clone",
    "add_worktree",
    "connect_workspace",
    "remove_workspace",
    "remove_worktree",
    "rename_worktree",
    "rename_worktree_upstream",
    "apply_worktree_changes",
    "update_workspace_settings",
    "worktree_setup_status",
    "worktree_setup_mark_ran",
    "set_workspace_runtime_codex_args",
    "file_read",
    "file_write",
    "list_workspace_files",
    "read_workspace_file",
    "get_codex_config_path",
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
    "thread_inject_items",
    "clean_background_terminals",
    "compact_thread",
    "start_review",
    "list_mcp_server_status",
    "thread_live_subscribe",
    "thread_live_unsubscribe",
    "get_git_status",
    "get_git_diffs",
    "get_git_log",
    "get_git_commit_diff",
    "get_git_remote",
    "list_git_branches",
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
    "init_git_repo",
    "create_github_repo",
    "list_git_roots",
    "get_github_issues",
    "get_github_pull_requests",
    "get_github_pull_request_diff",
    "get_github_pull_request_comments",
    "checkout_github_pull_request",
    "generate_commit_message",
    "local_usage_snapshot",
    "get_config_model",
    "model_list",
    "collaboration_mode_list",
    "experimental_feature_list",
    "set_codex_feature_flag",
    "skills_list",
    "apps_list",
    "get_agents_settings",
    "set_agents_core_settings",
    "create_agent",
    "update_agent",
    "delete_agent",
    "read_agent_config_toml",
    "write_agent_config_toml",
    "prompts_list",
    "prompts_workspace_dir",
    "prompts_global_dir",
    "prompts_create",
    "prompts_update",
    "prompts_delete",
    "prompts_move",
    "account_rate_limits",
    "account_read",
    "codex_login",
    "codex_login_cancel",
    "respond_to_server_request",
    "remember_approval_rule",
    "codex_doctor",
    "generate_run_metadata",
    "generate_agent_description",
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
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationsCapabilities {
    pub(crate) usage_snapshot: bool,
    pub(crate) feature_flags: bool,
    pub(crate) account_login: bool,
}

pub(crate) fn web_capabilities_v1() -> WebRuntimeCapabilities {
    WebRuntimeCapabilities {
        version: 1,
        methods: web_allowed_rpc_methods().to_vec(),
        thread_controls: ThreadControlCapabilities {
            steer: true,
            fork: true,
            compact: true,
            review: true,
            mcp: true,
        },
        files: FileCapabilities {
            workspace_tree: true,
        },
        operations: OperationsCapabilities {
            usage_snapshot: true,
            feature_flags: true,
            account_login: true,
        },
    }
}

pub(crate) fn web_allowed_rpc_methods() -> &'static [&'static str] {
    WEB_ALLOWED_RPC_METHODS
}
