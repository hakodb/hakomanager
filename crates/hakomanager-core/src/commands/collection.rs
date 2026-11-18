use super::{arg_str, engine};
use crate::dto::op;
use crate::error::Result;
use crate::state::ManagerState;
use serde_json::Value;

pub fn list(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collections = engine.list_collections()?;
    Ok(serde_json::json!({ "collections": collections }))
}

pub fn stats(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let name = arg_str(args, "collection")?;
    let stats = engine.collection_stats(name)?;
    serde_json::to_value(stats).map_err(crate::error::ManagerError::from)
}

pub fn drop(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let name = arg_str(args, "collection")?;
    let backup_path = crate::commands::ops::pre_op_backup(engine.as_ref(), state, "drop", name)?;
    let report = engine.drop_collection(name)?;
    state
        .audit
        .record(op::COLLECTION_DROP, name, true, &backup_path);
    let mut payload = serde_json::to_value(report).map_err(crate::error::ManagerError::from)?;
    payload["backup"] = Value::String(backup_path);
    Ok(payload)
}

pub fn rename(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let from = arg_str(args, "from")?;
    let to = arg_str(args, "to")?;
    engine.rename_collection(from, to)?;
    state.audit.record(op::COLLECTION_RENAME, from, true, to);
    Ok(serde_json::json!({ "from": from, "to": to }))
}
