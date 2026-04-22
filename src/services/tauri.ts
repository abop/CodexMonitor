import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Options as NotificationOptions } from "@tauri-apps/plugin-notification";
import { bridgeRpc } from "./bridge/http";
import { pickBrowserImageFiles } from "./browserFiles";
import { isWebRuntime, readRuntimeConfig } from "./runtime";
import type {
  AppSettings,
  CodexUpdateResult,
  CodexDoctorResult,
  DictationModelStatus,
  DictationSessionState,
  LocalUsageSnapshot,
  TcpDaemonStatus,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TrayRecentThreadEntry,
  TraySessionUsage,
  WorkspaceInfo,
  AppMention,
  WorkspaceSettings,
} from "../types";
import type {
  GitFileDiff,
  GitFileStatus,
  GitCommitDiff,
  GitHubIssuesResponse,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  GitHubPullRequestsResponse,
  GitLogResponse,
  ReviewTarget,
} from "../types";

function isMissingTauriInvokeError(error: unknown) {
  return (
    error instanceof TypeError &&
    (error.message.includes("reading 'invoke'") ||
      error.message.includes("reading \"invoke\""))
  );
}

type RpcParams = Record<string, unknown>;

function bridgeConfigOrThrow() {
  const config = readRuntimeConfig();
  if (!config.bridgeBaseUrl) {
    throw new Error("Bridge URL is not configured.");
  }
  return { baseUrl: config.bridgeBaseUrl };
}

function unsupportedInWeb(feature: string): never {
  throw new Error(`${feature} is unavailable in the web build.`);
}

function requireDesktopRuntime(feature: string) {
  if (isWebRuntime()) {
    unsupportedInWeb(feature);
  }
}

async function invokeSupportedRpc<T>(
  command: string,
  params?: RpcParams,
): Promise<T> {
  // The name stays for existing callers, but web runtime now trusts the bridge
  // to enforce method allowlisting instead of duplicating it here.
  if (isWebRuntime()) {
    return bridgeRpc<T>(bridgeConfigOrThrow(), command, params);
  }
  if (params === undefined) {
    return invoke<T>(command);
  }
  return invoke<T>(command, params);
}

export async function pickWorkspacePath(): Promise<string | null> {
  if (isWebRuntime()) {
    unsupportedInWeb("Workspace picker");
  }
  const selection = await open({ directory: true, multiple: false });
  if (!selection || Array.isArray(selection)) {
    return null;
  }
  return selection;
}

export async function pickWorkspacePaths(): Promise<string[]> {
  if (isWebRuntime()) {
    unsupportedInWeb("Workspace picker");
  }
  const selection = await open({ directory: true, multiple: true });
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickImageFiles(): Promise<string[]> {
  if (isWebRuntime()) {
    return pickBrowserImageFiles();
  }
  const selection = await open({
    multiple: true,
    filters: [
      {
        name: "Images",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "bmp",
          "tiff",
          "tif",
          "heic",
          "heif",
        ],
      },
    ],
  });
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export async function exportMarkdownFile(
  content: string,
  defaultFileName = "plan.md",
): Promise<string | null> {
  if (isWebRuntime()) {
    unsupportedInWeb("Markdown export");
  }
  const selection = await save({
    title: "Export plan as Markdown",
    defaultPath: defaultFileName,
    filters: [
      {
        name: "Markdown",
        extensions: ["md"],
      },
    ],
  });
  if (!selection) {
    return null;
  }
  await invoke("write_text_file", { path: selection, content });
  return selection;
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  if (isWebRuntime()) {
    return invokeSupportedRpc<WorkspaceInfo[]>("list_workspaces", {});
  }
  try {
    return await invoke<WorkspaceInfo[]>("list_workspaces");
  } catch (error) {
    if (isMissingTauriInvokeError(error)) {
      // In non-Tauri environments (e.g., Electron/web previews), the invoke
      // bridge may be missing. Treat this as "no workspaces" instead of crashing.
      console.warn("Tauri invoke bridge unavailable; returning empty workspaces list.");
      return [];
    }
    throw error;
  }
}

export async function getCodexConfigPath(): Promise<string> {
  requireDesktopRuntime("Codex config path lookup");
  return invoke<string>("get_codex_config_path");
}

export type TextFileResponse = {
  exists: boolean;
  content: string;
  truncated: boolean;
};

export type GlobalAgentsResponse = TextFileResponse;
export type GlobalCodexConfigResponse = TextFileResponse;
export type AgentMdResponse = TextFileResponse;
export type AgentSummary = {
  name: string;
  description: string | null;
  developerInstructions: string | null;
  configFile: string;
  resolvedPath: string;
  managedByApp: boolean;
  fileExists: boolean;
};

export type AgentsSettings = {
  configPath: string;
  multiAgentEnabled: boolean;
  maxThreads: number;
  maxDepth: number;
  agents: AgentSummary[];
};

export type SetAgentsCoreInput = {
  multiAgentEnabled: boolean;
  maxThreads: number;
  maxDepth: number;
};

export type CreateAgentInput = {
  name: string;
  description?: string | null;
  developerInstructions?: string | null;
  template?: "blank" | string | null;
  model?: string | null;
  reasoningEffort?: string | null;
};

export type UpdateAgentInput = {
  originalName: string;
  name: string;
  description?: string | null;
  developerInstructions?: string | null;
  renameManagedFile?: boolean;
};

export type DeleteAgentInput = {
  name: string;
  deleteManagedFile?: boolean;
};

export async function readImageAsDataUrl(path: string): Promise<string> {
  requireDesktopRuntime("Local image reads");
  return invoke<string>("read_image_as_data_url", { path });
}

export async function readGlobalAgentsMd(): Promise<GlobalAgentsResponse> {
  return invokeSupportedRpc<GlobalAgentsResponse>("read_global_agents_md");
}

export async function writeGlobalAgentsMd(content: string): Promise<void> {
  return invokeSupportedRpc("write_global_agents_md", {
    content,
  });
}

export async function readGlobalCodexConfigToml(): Promise<GlobalCodexConfigResponse> {
  return invokeSupportedRpc<GlobalCodexConfigResponse>(
    "read_global_codex_config_toml",
  );
}

export async function writeGlobalCodexConfigToml(content: string): Promise<void> {
  return invokeSupportedRpc("write_global_codex_config_toml", {
    content,
  });
}

export async function getAgentsSettings(): Promise<AgentsSettings> {
  return invokeSupportedRpc<AgentsSettings>("get_agents_settings");
}

export async function setAgentsCoreSettings(
  input: SetAgentsCoreInput,
): Promise<AgentsSettings> {
  requireDesktopRuntime("Agent settings");
  return invoke<AgentsSettings>("set_agents_core_settings", { input });
}

export async function createAgent(input: CreateAgentInput): Promise<AgentsSettings> {
  requireDesktopRuntime("Agent management");
  return invoke<AgentsSettings>("create_agent", { input });
}

export async function updateAgent(input: UpdateAgentInput): Promise<AgentsSettings> {
  requireDesktopRuntime("Agent management");
  return invoke<AgentsSettings>("update_agent", { input });
}

export async function deleteAgent(input: DeleteAgentInput): Promise<AgentsSettings> {
  requireDesktopRuntime("Agent management");
  return invoke<AgentsSettings>("delete_agent", { input });
}

export async function readAgentConfigToml(agentName: string): Promise<string> {
  requireDesktopRuntime("Agent config access");
  return invoke<string>("read_agent_config_toml", { agentName });
}

export async function writeAgentConfigToml(
  agentName: string,
  content: string,
): Promise<void> {
  requireDesktopRuntime("Agent config access");
  return invoke("write_agent_config_toml", { agentName, content });
}

export async function getConfigModel(workspaceId: string): Promise<string | null> {
  const response = await invokeSupportedRpc<{ model?: string | null }>(
    "get_config_model",
    {
      workspaceId,
    },
  );
  const model = response?.model;
  if (typeof model !== "string") {
    return null;
  }
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function addWorkspace(path: string): Promise<WorkspaceInfo> {
  return invokeSupportedRpc<WorkspaceInfo>("add_workspace", { path });
}

export async function addWorkspaceFromGitUrl(
  url: string,
  destinationPath: string,
  targetFolderName: string | null,
): Promise<WorkspaceInfo> {
  return invokeSupportedRpc<WorkspaceInfo>("add_workspace_from_git_url", {
    url,
    destinationPath,
    targetFolderName,
  });
}

export async function isWorkspacePathDir(path: string): Promise<boolean> {
  requireDesktopRuntime("Workspace path validation");
  return invoke<boolean>("is_workspace_path_dir", { path });
}

export async function addClone(
  sourceWorkspaceId: string,
  copiesFolder: string,
  copyName: string,
): Promise<WorkspaceInfo> {
  requireDesktopRuntime("Clone workspaces");
  return invoke<WorkspaceInfo>("add_clone", {
    sourceWorkspaceId,
    copiesFolder,
    copyName,
  });
}

export async function addWorktree(
  parentId: string,
  branch: string,
  name: string | null,
  copyAgentsMd = true,
): Promise<WorkspaceInfo> {
  requireDesktopRuntime("Worktree creation");
  return invoke<WorkspaceInfo>("add_worktree", { parentId, branch, name, copyAgentsMd });
}

export type WorktreeSetupStatus = {
  shouldRun: boolean;
  script: string | null;
};

export async function getWorktreeSetupStatus(
  workspaceId: string,
): Promise<WorktreeSetupStatus> {
  return invokeSupportedRpc<WorktreeSetupStatus>("worktree_setup_status", {
    workspaceId,
  });
}

export async function markWorktreeSetupRan(workspaceId: string): Promise<void> {
  requireDesktopRuntime("Worktree setup");
  return invoke("worktree_setup_mark_ran", { workspaceId });
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  requireDesktopRuntime("Workspace settings updates");
  return invoke<WorkspaceInfo>("update_workspace_settings", { id, settings });
}

export async function removeWorkspace(id: string): Promise<void> {
  return invokeSupportedRpc("remove_workspace", { id });
}

export async function removeWorktree(id: string): Promise<void> {
  return invokeSupportedRpc("remove_worktree", { id });
}

export async function renameWorktree(
  id: string,
  branch: string,
): Promise<WorkspaceInfo> {
  return invokeSupportedRpc<WorkspaceInfo>("rename_worktree", { id, branch });
}

export async function renameWorktreeUpstream(
  id: string,
  oldBranch: string,
  newBranch: string,
): Promise<void> {
  return invokeSupportedRpc("rename_worktree_upstream", {
    id,
    oldBranch,
    newBranch,
  });
}

export async function applyWorktreeChanges(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("apply_worktree_changes", { workspaceId });
}

export async function openWorkspaceIn(
  path: string,
  options: {
    appName?: string | null;
    command?: string | null;
    args?: string[];
    line?: number | null;
    column?: number | null;
  },
): Promise<void> {
  if (isWebRuntime()) {
    unsupportedInWeb("Open workspace in external app");
  }
  return invoke("open_workspace_in", {
    path,
    app: options.appName ?? null,
    command: options.command ?? null,
    args: options.args ?? [],
    line: options.line ?? null,
    column: options.column ?? null,
  });
}

export async function getOpenAppIcon(appName: string): Promise<string | null> {
  requireDesktopRuntime("External app icons");
  return invoke<string | null>("get_open_app_icon", { appName });
}

export async function connectWorkspace(id: string): Promise<void> {
  return invokeSupportedRpc("connect_workspace", { id });
}

export async function setWorkspaceRuntimeCodexArgs(
  workspaceId: string,
  codexArgs: string | null,
): Promise<{ appliedCodexArgs: string | null; respawned: boolean }> {
  return invokeSupportedRpc("set_workspace_runtime_codex_args", {
    workspaceId,
    codexArgs,
  });
}

export async function startThread(workspaceId: string) {
  return invokeSupportedRpc<any>("start_thread", { workspaceId });
}

export async function forkThread(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("fork_thread", { workspaceId, threadId });
}

export async function compactThread(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("compact_thread", { workspaceId, threadId });
}

function isInlineImageUrl(image: string) {
  return (
    image.startsWith("data:") ||
    image.startsWith("http://") ||
    image.startsWith("https://")
  );
}

async function convertImagesToDataUrls(images: string[]): Promise<string[]> {
  return Promise.all(
    images.map(async (image) => {
      if (isInlineImageUrl(image)) {
        return image;
      }
      return readImageAsDataUrl(image);
    }),
  );
}

async function normalizeImagesForRpc(images?: string[]): Promise<string[] | null> {
  if (images == null) {
    return null;
  }
  if (images.length === 0) {
    return [];
  }
  if (isWebRuntime()) {
    return images;
  }
  const hasPathImages = images.some((image) => !isInlineImageUrl(image));
  if (!hasPathImages) {
    return images;
  }
  let settings: AppSettings;
  let mobileRuntime: boolean;
  try {
    [settings, mobileRuntime] = await Promise.all([getAppSettings(), isMobileRuntime()]);
  } catch (error) {
    if (isMissingTauriInvokeError(error)) {
      return images;
    }
    throw error;
  }
  if (settings.backendMode !== "remote" && !mobileRuntime) {
    return images;
  }
  return convertImagesToDataUrls(images);
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: {
    model?: string | null;
    effort?: string | null;
    serviceTier?: "fast" | "flex" | null | undefined;
    accessMode?: "read-only" | "current" | "full-access";
    images?: string[];
    collaborationMode?: Record<string, unknown> | null;
    appMentions?: AppMention[];
  },
) {
  const images = await normalizeImagesForRpc(options?.images);
  const payload: Record<string, unknown> = {
    workspaceId,
    threadId,
    text,
    model: options?.model ?? null,
    effort: options?.effort ?? null,
    accessMode: options?.accessMode ?? null,
    images,
  };
  if (options?.serviceTier !== undefined) {
    payload.serviceTier = options.serviceTier;
  }
  if (options?.collaborationMode) {
    payload.collaborationMode = options.collaborationMode;
  }
  if (options?.appMentions && options.appMentions.length > 0) {
    payload.appMentions = options.appMentions;
  }
  return invokeSupportedRpc("send_user_message", payload);
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  return invokeSupportedRpc("turn_interrupt", { workspaceId, threadId, turnId });
}

export async function steerTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
  text: string,
  images?: string[],
  appMentions?: AppMention[],
) {
  const normalizedImages = await normalizeImagesForRpc(images);
  const payload: Record<string, unknown> = {
    workspaceId,
    threadId,
    turnId,
    text,
    images: normalizedImages,
  };
  if (appMentions && appMentions.length > 0) {
    payload.appMentions = appMentions;
  }
  return invokeSupportedRpc("turn_steer", payload);
}

export async function startReview(
  workspaceId: string,
  threadId: string,
  target: ReviewTarget,
  delivery?: "inline" | "detached",
) {
  const payload: Record<string, unknown> = { workspaceId, threadId, target };
  if (delivery) {
    payload.delivery = delivery;
  }
  return invokeSupportedRpc("start_review", payload);
}

export async function respondToServerRequest(
  workspaceId: string,
  requestId: number | string,
  decision: "accept" | "decline",
) {
  return invokeSupportedRpc("respond_to_server_request", {
    workspaceId,
    requestId,
    result: { decision },
  });
}

export async function respondToUserInputRequest(
  workspaceId: string,
  requestId: number | string,
  answers: Record<string, { answers: string[] }>,
) {
  return invokeSupportedRpc("respond_to_server_request", {
    workspaceId,
    requestId,
    result: { answers },
  });
}

export async function rememberApprovalRule(
  workspaceId: string,
  command: string[],
) {
  return invokeSupportedRpc("remember_approval_rule", { workspaceId, command });
}

export async function getGitStatus(workspace_id: string): Promise<{
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}> {
  return invokeSupportedRpc("get_git_status", { workspaceId: workspace_id });
}

export type InitGitRepoResponse =
  | { status: "initialized"; commitError?: string }
  | { status: "already_initialized" }
  | { status: "needs_confirmation"; entryCount: number };

export async function initGitRepo(
  workspaceId: string,
  branch: string,
  force = false,
): Promise<InitGitRepoResponse> {
  requireDesktopRuntime("Git repo setup");
  return invoke<InitGitRepoResponse>("init_git_repo", { workspaceId, branch, force });
}

export type CreateGitHubRepoResponse =
  | { status: "ok"; repo: string; remoteUrl?: string | null }
  | {
      status: "partial";
      repo: string;
      remoteUrl?: string | null;
      pushError?: string | null;
      defaultBranchError?: string | null;
    };

export async function createGitHubRepo(
  workspaceId: string,
  repo: string,
  visibility: "private" | "public",
  branch?: string | null,
): Promise<CreateGitHubRepoResponse> {
  requireDesktopRuntime("GitHub repository creation");
  return invoke<CreateGitHubRepoResponse>("create_github_repo", {
    workspaceId,
    repo,
    visibility,
    branch,
  });
}

export async function listGitRoots(
  workspace_id: string,
  depth: number,
): Promise<string[]> {
  requireDesktopRuntime("Git root discovery");
  return invoke("list_git_roots", { workspaceId: workspace_id, depth });
}

export async function getGitDiffs(
  workspace_id: string,
): Promise<GitFileDiff[]> {
  return invokeSupportedRpc("get_git_diffs", { workspaceId: workspace_id });
}

export async function getGitLog(
  workspace_id: string,
  limit = 40,
): Promise<GitLogResponse> {
  return invokeSupportedRpc("get_git_log", { workspaceId: workspace_id, limit });
}

export async function getGitCommitDiff(
  workspace_id: string,
  sha: string,
): Promise<GitCommitDiff[]> {
  return invokeSupportedRpc("get_git_commit_diff", {
    workspaceId: workspace_id,
    sha,
  });
}

export async function getGitRemote(workspace_id: string): Promise<string | null> {
  return invokeSupportedRpc("get_git_remote", { workspaceId: workspace_id });
}

export async function stageGitFile(workspaceId: string, path: string) {
  return invokeSupportedRpc("stage_git_file", { workspaceId, path });
}

export async function stageGitAll(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("stage_git_all", { workspaceId });
}

export async function unstageGitFile(workspaceId: string, path: string) {
  return invokeSupportedRpc("unstage_git_file", { workspaceId, path });
}

export async function revertGitFile(workspaceId: string, path: string) {
  return invokeSupportedRpc("revert_git_file", { workspaceId, path });
}

export async function revertGitAll(workspaceId: string) {
  return invokeSupportedRpc("revert_git_all", { workspaceId });
}

export async function commitGit(
  workspaceId: string,
  message: string,
): Promise<void> {
  return invokeSupportedRpc("commit_git", { workspaceId, message });
}

export async function pushGit(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("push_git", { workspaceId });
}

export async function pullGit(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("pull_git", { workspaceId });
}

export async function fetchGit(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("fetch_git", { workspaceId });
}

export async function syncGit(workspaceId: string): Promise<void> {
  return invokeSupportedRpc("sync_git", { workspaceId });
}

export async function getGitHubIssues(
  workspace_id: string,
): Promise<GitHubIssuesResponse> {
  requireDesktopRuntime("GitHub issues");
  return invoke("get_github_issues", { workspaceId: workspace_id });
}

export async function getGitHubPullRequests(
  workspace_id: string,
): Promise<GitHubPullRequestsResponse> {
  requireDesktopRuntime("GitHub pull requests");
  return invoke("get_github_pull_requests", { workspaceId: workspace_id });
}

export async function getGitHubPullRequestDiff(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestDiff[]> {
  requireDesktopRuntime("GitHub pull requests");
  return invoke("get_github_pull_request_diff", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function getGitHubPullRequestComments(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestComment[]> {
  requireDesktopRuntime("GitHub pull requests");
  return invoke("get_github_pull_request_comments", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function checkoutGitHubPullRequest(
  workspace_id: string,
  prNumber: number,
): Promise<void> {
  requireDesktopRuntime("GitHub pull requests");
  return invoke("checkout_github_pull_request", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function localUsageSnapshot(
  days?: number,
  workspacePath?: string | null,
): Promise<LocalUsageSnapshot> {
  const payload: { days: number; workspacePath?: string } = { days: days ?? 30 };
  if (workspacePath) {
    payload.workspacePath = workspacePath;
  }
  return invokeSupportedRpc("local_usage_snapshot", payload);
}

export async function getModelList(workspaceId: string) {
  return invokeSupportedRpc<any>("model_list", { workspaceId });
}

export async function getExperimentalFeatureList(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  if (isWebRuntime()) {
    return invokeSupportedRpc<any>("experimental_feature_list", {
      workspaceId,
      cursor,
      limit,
    });
  }
  return invoke<any>("experimental_feature_list", { workspaceId, cursor, limit });
}

export async function setCodexFeatureFlag(
  featureKey: string,
  enabled: boolean,
): Promise<void> {
  requireDesktopRuntime("Experimental feature settings");
  return invoke("set_codex_feature_flag", { featureKey, enabled });
}

export async function generateRunMetadata(workspaceId: string, prompt: string) {
  requireDesktopRuntime("Run metadata generation");
  return invoke<{ title: string; worktreeName: string }>("generate_run_metadata", {
    workspaceId,
    prompt,
  });
}

export async function getCollaborationModes(workspaceId: string) {
  return invokeSupportedRpc<any>("collaboration_mode_list", { workspaceId });
}

export async function getAccountRateLimits(workspaceId: string) {
  return invokeSupportedRpc<any>("account_rate_limits", { workspaceId });
}

export async function getAccountInfo(workspaceId: string) {
  return invokeSupportedRpc<any>("account_read", { workspaceId });
}

export async function runCodexLogin(workspaceId: string) {
  return invokeSupportedRpc<{ loginId: string; authUrl: string; raw?: unknown }>("codex_login", {
    workspaceId,
  });
}

export async function cancelCodexLogin(workspaceId: string) {
  return invokeSupportedRpc<{ canceled: boolean; status?: string; raw?: unknown }>(
    "codex_login_cancel",
    { workspaceId },
  );
}

export async function getSkillsList(workspaceId: string) {
  return invokeSupportedRpc<any>("skills_list", { workspaceId });
}

export async function getAppsList(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
  threadId?: string | null,
) {
  return invokeSupportedRpc<any>("apps_list", {
    workspaceId,
    cursor,
    limit,
    threadId,
  });
}

export async function getPromptsList(workspaceId: string) {
  return invokeSupportedRpc<any>("prompts_list", { workspaceId });
}

export async function getWorkspacePromptsDir(workspaceId: string) {
  requireDesktopRuntime("Prompt directory access");
  return invoke<string>("prompts_workspace_dir", { workspaceId });
}

export async function getGlobalPromptsDir(workspaceId: string) {
  requireDesktopRuntime("Prompt directory access");
  return invoke<string>("prompts_global_dir", { workspaceId });
}

export async function createPrompt(
  workspaceId: string,
  data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return invokeSupportedRpc<any>("prompts_create", {
    workspaceId,
    scope: data.scope,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function updatePrompt(
  workspaceId: string,
  data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return invokeSupportedRpc<any>("prompts_update", {
    workspaceId,
    path: data.path,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function deletePrompt(workspaceId: string, path: string) {
  return invokeSupportedRpc<any>("prompts_delete", { workspaceId, path });
}

export async function movePrompt(
  workspaceId: string,
  data: { path: string; scope: "workspace" | "global" },
) {
  return invokeSupportedRpc<any>("prompts_move", {
    workspaceId,
    path: data.path,
    scope: data.scope,
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invokeSupportedRpc<AppSettings>("get_app_settings", {});
}

export async function isMobileRuntime(): Promise<boolean> {
  requireDesktopRuntime("Mobile runtime detection");
  return invoke<boolean>("is_mobile_runtime");
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invokeSupportedRpc<AppSettings>("update_app_settings", { settings });
}

export async function tailscaleStatus(): Promise<TailscaleStatus> {
  requireDesktopRuntime("Tailscale");
  return invoke<TailscaleStatus>("tailscale_status");
}

export async function tailscaleDaemonCommandPreview(): Promise<TailscaleDaemonCommandPreview> {
  requireDesktopRuntime("Tailscale");
  return invoke<TailscaleDaemonCommandPreview>("tailscale_daemon_command_preview");
}

export async function tailscaleDaemonStart(): Promise<TcpDaemonStatus> {
  requireDesktopRuntime("Tailscale");
  return invoke<TcpDaemonStatus>("tailscale_daemon_start");
}

export async function tailscaleDaemonStop(): Promise<TcpDaemonStatus> {
  requireDesktopRuntime("Tailscale");
  return invoke<TcpDaemonStatus>("tailscale_daemon_stop");
}

export async function tailscaleDaemonStatus(): Promise<TcpDaemonStatus> {
  requireDesktopRuntime("Tailscale");
  return invoke<TcpDaemonStatus>("tailscale_daemon_status");
}

type MenuAcceleratorUpdate = {
  id: string;
  accelerator: string | null;
};

export async function setMenuAccelerators(
  updates: MenuAcceleratorUpdate[],
): Promise<void> {
  requireDesktopRuntime("Menu accelerators");
  return invoke("menu_set_accelerators", { updates });
}

export async function runCodexDoctor(
  codexBin: string | null,
  codexArgs: string | null,
): Promise<CodexDoctorResult> {
  if (isWebRuntime()) {
    return invokeSupportedRpc<CodexDoctorResult>("codex_doctor_current_config");
  }
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin, codexArgs });
}

export async function runCodexUpdate(
  codexBin: string | null,
  codexArgs: string | null,
): Promise<CodexUpdateResult> {
  requireDesktopRuntime("Codex update");
  return invoke<CodexUpdateResult>("codex_update", { codexBin, codexArgs });
}

export async function getWorkspaceFiles(workspaceId: string) {
  return invokeSupportedRpc<string[]>("list_workspace_files", { workspaceId });
}

export async function readWorkspaceFile(
  workspaceId: string,
  path: string,
): Promise<{ content: string; truncated: boolean }> {
  return invokeSupportedRpc<{ content: string; truncated: boolean }>(
    "read_workspace_file",
    {
      workspaceId,
      path,
    },
  );
}

export async function readAgentMd(workspaceId: string): Promise<AgentMdResponse> {
  return invokeSupportedRpc<AgentMdResponse>("read_workspace_agent_md", {
    workspaceId,
  });
}

export async function writeAgentMd(workspaceId: string, content: string): Promise<void> {
  return invokeSupportedRpc("write_workspace_agent_md", {
    workspaceId,
    content,
  });
}

export async function listGitBranches(workspaceId: string) {
  return invokeSupportedRpc<any>("list_git_branches", { workspaceId });
}

export async function checkoutGitBranch(workspaceId: string, name: string) {
  return invokeSupportedRpc("checkout_git_branch", { workspaceId, name });
}

export async function createGitBranch(workspaceId: string, name: string) {
  return invokeSupportedRpc("create_git_branch", { workspaceId, name });
}

function withModelId(modelId?: string | null) {
  return modelId ? { modelId } : {};
}

export async function getDictationModelStatus(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  requireDesktopRuntime("Dictation");
  return invoke<DictationModelStatus>(
    "dictation_model_status",
    withModelId(modelId),
  );
}

export async function downloadDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  requireDesktopRuntime("Dictation");
  return invoke<DictationModelStatus>(
    "dictation_download_model",
    withModelId(modelId),
  );
}

export async function cancelDictationDownload(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  requireDesktopRuntime("Dictation");
  return invoke<DictationModelStatus>(
    "dictation_cancel_download",
    withModelId(modelId),
  );
}

export async function removeDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  requireDesktopRuntime("Dictation");
  return invoke<DictationModelStatus>(
    "dictation_remove_model",
    withModelId(modelId),
  );
}

export async function startDictation(
  preferredLanguage: string | null,
): Promise<DictationSessionState> {
  requireDesktopRuntime("Dictation");
  return invoke("dictation_start", { preferredLanguage });
}

export async function requestDictationPermission(): Promise<boolean> {
  requireDesktopRuntime("Dictation");
  return invoke("dictation_request_permission");
}

export async function stopDictation(): Promise<DictationSessionState> {
  requireDesktopRuntime("Dictation");
  return invoke("dictation_stop");
}

export async function cancelDictation(): Promise<DictationSessionState> {
  requireDesktopRuntime("Dictation");
  return invoke("dictation_cancel");
}

export async function openTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<{ id: string }> {
  requireDesktopRuntime("Terminal sessions");
  return invoke("terminal_open", { workspaceId, terminalId, cols, rows });
}

export async function writeTerminalSession(
  workspaceId: string,
  terminalId: string,
  data: string,
): Promise<void> {
  requireDesktopRuntime("Terminal sessions");
  return invoke("terminal_write", { workspaceId, terminalId, data });
}

export async function resizeTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  requireDesktopRuntime("Terminal sessions");
  return invoke("terminal_resize", { workspaceId, terminalId, cols, rows });
}

export async function closeTerminalSession(
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  requireDesktopRuntime("Terminal sessions");
  return invoke("terminal_close", { workspaceId, terminalId });
}

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
  sortKey?: "created_at" | "updated_at" | null,
) {
  return invokeSupportedRpc<any>("list_threads", {
    workspaceId,
    cursor,
    limit,
    sortKey,
  });
}

export async function listMcpServerStatus(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  return invokeSupportedRpc<any>("list_mcp_server_status", {
    workspaceId,
    cursor,
    limit,
  });
}

export async function resumeThread(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("resume_thread", { workspaceId, threadId });
}

export async function readThread(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("read_thread", { workspaceId, threadId });
}

export async function threadLiveSubscribe(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("thread_live_subscribe", { workspaceId, threadId });
}

export async function threadLiveUnsubscribe(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("thread_live_unsubscribe", {
    workspaceId,
    threadId,
  });
}

export async function archiveThread(workspaceId: string, threadId: string) {
  return invokeSupportedRpc<any>("archive_thread", { workspaceId, threadId });
}

export async function setThreadName(
  workspaceId: string,
  threadId: string,
  name: string,
) {
  return invokeSupportedRpc<any>("set_thread_name", { workspaceId, threadId, name });
}

export async function setTrayRecentThreads(entries: TrayRecentThreadEntry[]) {
  requireDesktopRuntime("Tray integration");
  return invoke<void>("set_tray_recent_threads", { entries });
}

export async function setTraySessionUsage(usage: TraySessionUsage | null) {
  requireDesktopRuntime("Tray integration");
  return invoke<void>("set_tray_session_usage", { usage });
}

export async function generateCommitMessage(
  workspaceId: string,
  commitMessageModelId: string | null,
): Promise<string> {
  requireDesktopRuntime("Commit message generation");
  return invoke("generate_commit_message", { workspaceId, commitMessageModelId });
}

export type GeneratedAgentConfiguration = {
  description: string;
  developerInstructions: string;
};

export async function generateAgentDescription(
  workspaceId: string,
  description: string,
): Promise<GeneratedAgentConfiguration> {
  requireDesktopRuntime("Agent description generation");
  return invoke("generate_agent_description", { workspaceId, description });
}

export type AppBuildType = "debug" | "release";

export async function getAppBuildType(): Promise<AppBuildType> {
  requireDesktopRuntime("App build metadata");
  return invoke<AppBuildType>("app_build_type");
}

export async function sendNotification(
  title: string,
  body: string,
  options?: {
    id?: number;
    group?: string;
    actionTypeId?: string;
    sound?: string;
    autoCancel?: boolean;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  requireDesktopRuntime("Notification delivery");
  const macosDebugBuild = await invoke<boolean>("is_macos_debug_build").catch(
    () => false,
  );
  const attemptFallback = async () => {
    try {
      await invoke("send_notification_fallback", { title, body });
      return true;
    } catch (error) {
      console.warn("Notification fallback failed.", { error });
      return false;
    }
  };

  // In dev builds on macOS, the notification plugin can silently fail because
  // the process is not a bundled app. Prefer the native AppleScript fallback.
  if (macosDebugBuild) {
    await attemptFallback();
    return;
  }

  try {
    const notification = await import("@tauri-apps/plugin-notification");
    let permissionGranted = await notification.isPermissionGranted();
    if (!permissionGranted) {
      const permission = await notification.requestPermission();
      permissionGranted = permission === "granted";
      if (!permissionGranted) {
        console.warn("Notification permission not granted.", { permission });
        await attemptFallback();
        return;
      }
    }
    if (permissionGranted) {
      const payload: NotificationOptions = { title, body };
      if (options?.id !== undefined) {
        payload.id = options.id;
      }
      if (options?.group !== undefined) {
        payload.group = options.group;
      }
      if (options?.actionTypeId !== undefined) {
        payload.actionTypeId = options.actionTypeId;
      }
      if (options?.sound !== undefined) {
        payload.sound = options.sound;
      }
      if (options?.autoCancel !== undefined) {
        payload.autoCancel = options.autoCancel;
      }
      if (options?.extra !== undefined) {
        payload.extra = options.extra;
      }
      await notification.sendNotification(payload);
      return;
    }
  } catch (error) {
    console.warn("Notification plugin failed.", { error });
  }

  await attemptFallback();
}
