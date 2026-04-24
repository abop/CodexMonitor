use std::path::PathBuf;

use crate::shared::config_toml_core;

pub(crate) fn read_steer_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("steer")
}

pub(crate) fn read_collaboration_modes_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("collaboration_modes")
}

pub(crate) fn read_unified_exec_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("unified_exec")
}

pub(crate) fn read_apps_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("apps")
}

pub(crate) fn read_personality() -> Result<Option<String>, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(read_personality_from_document(&document))
}

pub(crate) fn read_approvals_reviewer() -> Result<Option<String>, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(read_approvals_reviewer_from_document(&document))
}

pub(crate) fn write_steer_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("steer", enabled)
}

pub(crate) fn write_collaboration_modes_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("collaboration_modes", enabled)
}

pub(crate) fn write_unified_exec_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("unified_exec", enabled)
}

pub(crate) fn write_apps_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("apps", enabled)
}

pub(crate) fn write_feature_enabled(feature_key: &str, enabled: bool) -> Result<(), String> {
    let key = feature_key.trim();
    if key.is_empty() {
        return Err("feature key is empty".to_string());
    }
    if key.eq_ignore_ascii_case("collab") {
        return Err("feature key `collab` is no longer supported; use `multi_agent`".to_string());
    }
    write_feature_flag(key, enabled)
}

pub(crate) fn write_personality(personality: &str) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    let normalized = normalize_personality_value(personality);
    config_toml_core::set_top_level_string(&mut document, "personality", normalized);
    config_toml_core::persist_global_config_document(&root, &document)
}

pub(crate) fn write_approvals_reviewer(reviewer: &str) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    let normalized = normalize_approvals_reviewer_value(reviewer);
    config_toml_core::set_top_level_string(&mut document, "approvals_reviewer", normalized);
    config_toml_core::persist_global_config_document(&root, &document)
}

fn read_feature_flag(key: &str) -> Result<Option<bool>, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_feature_flag(&document, key))
}

fn write_feature_flag(key: &str, enabled: bool) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    config_toml_core::set_feature_flag(&mut document, key, enabled)?;
    config_toml_core::persist_global_config_document(&root, &document)
}

pub(crate) fn config_toml_path() -> Option<PathBuf> {
    resolve_default_codex_home().map(|home| home.join("config.toml"))
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_top_level_string(&document, "model"))
}

fn resolve_default_codex_home() -> Option<PathBuf> {
    crate::codex::home::resolve_default_codex_home()
}

fn read_personality_from_document(document: &toml_edit::Document) -> Option<String> {
    config_toml_core::read_top_level_string(document, "personality")
        .as_deref()
        .and_then(normalize_personality_value)
        .map(|value| value.to_string())
}

fn read_approvals_reviewer_from_document(document: &toml_edit::Document) -> Option<String> {
    config_toml_core::read_top_level_string(document, "approvals_reviewer")
        .as_deref()
        .and_then(normalize_approvals_reviewer_value)
        .map(|value| value.to_string())
}

fn normalize_personality_value(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

fn normalize_approvals_reviewer_value(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "user" => Some("user"),
        "auto_review" | "guardian_subagent" => Some("auto_review"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_approvals_reviewer_value, normalize_personality_value,
        read_approvals_reviewer_from_document, read_personality_from_document,
    };
    use crate::shared::config_toml_core;

    #[test]
    fn parse_personality_reads_supported_values() {
        let friendly =
            config_toml_core::parse_document("personality = \"friendly\"\n").expect("parse");
        let pragmatic =
            config_toml_core::parse_document("personality = \"pragmatic\"\n").expect("parse");
        let unknown =
            config_toml_core::parse_document("personality = \"unknown\"\n").expect("parse");

        assert_eq!(
            read_personality_from_document(&friendly),
            Some("friendly".to_string())
        );
        assert_eq!(
            read_personality_from_document(&pragmatic),
            Some("pragmatic".to_string())
        );
        assert_eq!(read_personality_from_document(&unknown), None);
    }

    #[test]
    fn normalize_personality_is_case_insensitive() {
        assert_eq!(normalize_personality_value("Friendly"), Some("friendly"));
        assert_eq!(normalize_personality_value("PRAGMATIC"), Some("pragmatic"));
        assert_eq!(normalize_personality_value("unknown"), None);
    }

    #[test]
    fn parse_approvals_reviewer_reads_supported_values() {
        let user =
            config_toml_core::parse_document("approvals_reviewer = \"user\"\n").expect("parse");
        let auto_review =
            config_toml_core::parse_document("approvals_reviewer = \"auto_review\"\n")
                .expect("parse");
        let guardian =
            config_toml_core::parse_document("approvals_reviewer = \"guardian_subagent\"\n")
                .expect("parse");

        assert_eq!(
            read_approvals_reviewer_from_document(&user),
            Some("user".to_string())
        );
        assert_eq!(
            read_approvals_reviewer_from_document(&auto_review),
            Some("auto_review".to_string())
        );
        assert_eq!(
            read_approvals_reviewer_from_document(&guardian),
            Some("auto_review".to_string())
        );
    }

    #[test]
    fn normalize_approvals_reviewer_is_case_insensitive_and_accepts_legacy() {
        assert_eq!(normalize_approvals_reviewer_value("USER"), Some("user"));
        assert_eq!(
            normalize_approvals_reviewer_value("guardian_subagent"),
            Some("auto_review")
        );
        assert_eq!(
            normalize_approvals_reviewer_value("AUTO_REVIEW"),
            Some("auto_review")
        );
        assert_eq!(normalize_approvals_reviewer_value("unknown"), None);
    }
}
