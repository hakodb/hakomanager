use super::{arg_str, arg_str_or, engine};
use crate::dto::op;
use crate::error::Result;
use crate::state::ManagerState;
use serde_json::Value;

pub fn quiescence(args: &Value, state: &ManagerState) -> Result<Value> {
    Ok(engine(args, state)?.quiescence())
}

pub fn watch(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = args.get("collection").and_then(Value::as_str);
    engine.watch(collection)?;
    Ok(serde_json::json!({ "watching": collection.unwrap_or("*") }))
}

pub fn stats(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.stats()
}

pub fn backup(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let path = arg_str(args, "path")?;
    engine.backup(path)?;
    state.audit.record(op::OPS_BACKUP, path, true, "");
    Ok(serde_json::json!({ "backup": path }))
}

/// Destructive-op safety per the plan: before drop/compact/vacuum, snapshot
/// the database to `<data-sibling>/<dbname>-pre-<op>-<timestamp>.backup`
/// (same parent dir, engine-native backup directory). Best-effort marker is
/// returned to the caller; a failed backup aborts the destructive op.
pub fn pre_op_backup(
    engine: &dyn crate::adapter_v2::AdvancedAdapter,
    state: &ManagerState,
    op_name: &str,
    target: &str,
) -> Result<String> {
    let stem = std::path::Path::new(&engine.db_path())
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "db".to_string());
    let parent = std::path::Path::new(&engine.db_path())
        .parent()
        .map(|dir| dir.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = parent.join(format!("{stem}-pre-{op_name}-{stamp}.backup"));
    let path = path.to_string_lossy().to_string();
    engine.backup(&path)?;
    state.audit.record(op::OPS_BACKUP, &path, true, op_name);
    let _ = target;
    Ok(path)
}

pub fn flush(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.flush()?;
    Ok(serde_json::json!({ "flushed": true }))
}

pub fn compact(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = args.get("collection").and_then(Value::as_str);
    let backup_path = pre_op_backup(engine.as_ref(), state, "compact", collection.unwrap_or("*"))?;
    engine.compact(collection)?;
    let target = arg_str_or(args, "collection", "*")?;
    state.audit.record(op::OPS_COMPACT, target, true, &backup_path);
    Ok(serde_json::json!({ "compacted": target, "backup": backup_path }))
}

pub fn vacuum(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let backup_path = pre_op_backup(engine.as_ref(), state, "vacuum", collection)?;
    engine.vacuum(collection)?;
    state
        .audit
        .record(op::OPS_VACUUM, collection, true, &backup_path);
    Ok(serde_json::json!({ "vacuumed": collection, "backup": backup_path }))
}
