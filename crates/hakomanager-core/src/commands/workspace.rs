use super::{arg_str, arg_str_or};
use crate::adapter::LocalHakoAdapter;
use crate::dto::{op, DatabaseProfile};
use crate::error::{ManagerError, Result};
use crate::state::{ManagerState, OpenDatabase};
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;

pub fn list(state: &ManagerState) -> Result<Value> {
    let profiles: Vec<&DatabaseProfile> = state
        .databases
        .values()
        .map(|entry| &entry.profile)
        .collect();
    serde_json::to_value(profiles).map_err(ManagerError::from)
}

pub fn open(args: &Value, state: &mut ManagerState) -> Result<Value> {
    let path = arg_str(args, "path")?;
    let generated = id_from_path(path);
    let id = match args.get("id").and_then(Value::as_str) {
        Some(value) => value.to_string(),
        None => generated,
    };

    if let Some(entry) = state.databases.get(&id) {
        return serde_json::to_value(&entry.profile).map_err(ManagerError::from);
    }

    let name = arg_str_or(args, "name", basename(path))?.to_string();
    let durability = arg_str_or(args, "durability", "on-commit")?;
    let read_only = args
        .get("readOnly")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let encryption_configured = args
        .get("encryptionConfigured")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let engine = Arc::new(LocalHakoAdapter::open(path, durability, read_only)?);
    let profile = DatabaseProfile {
        id: id.clone(),
        name,
        path: path.to_string(),
        read_only,
        durability: durability.to_string(),
        encryption_configured,
    };
    state.databases.insert(
        id.clone(),
        OpenDatabase {
            profile: profile.clone(),
            engine,
        },
    );
    state.audit.record(op::WORKSPACE_OPEN, &id, true, path);
    serde_json::to_value(profile).map_err(ManagerError::from)
}

pub fn close(args: &Value, state: &mut ManagerState) -> Result<Value> {
    let id = arg_str(args, "profileId")?;
    match state.databases.remove(id) {
        Some(_) => {
            state.audit.record(op::WORKSPACE_CLOSE, id, true, "");
            Ok(serde_json::json!({ "closed": id }))
        }
        None => Err(ManagerError::Validation(format!("unknown database '{id}'"))),
    }
}

pub fn set_writes(args: &Value, state: &mut ManagerState) -> Result<Value> {
    let id = arg_str(args, "profileId")?;
    let enabled = args
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or_else(|| ManagerError::Validation("missing boolean argument 'enabled'".into()))?;
    let entry = state
        .databases
        .get_mut(id)
        .ok_or_else(|| ManagerError::Validation(format!("unknown database '{id}'")))?;
    entry.engine.set_writes(enabled);
    entry.profile.read_only = !enabled;
    state
        .audit
        .record(op::WORKSPACE_SET_WRITES, id, true, &enabled.to_string());
    serde_json::to_value(&entry.profile).map_err(ManagerError::from)
}

fn basename(path: &str) -> &str {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
}

fn id_from_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("db-{:012x}", hasher.finish())
}
