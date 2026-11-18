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

pub fn flush(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.flush()?;
    Ok(serde_json::json!({ "flushed": true }))
}

pub fn compact(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = args.get("collection").and_then(Value::as_str);
    engine.compact(collection)?;
    let target = arg_str_or(args, "collection", "*")?;
    state.audit.record(op::OPS_COMPACT, target, true, "");
    Ok(serde_json::json!({ "compacted": target }))
}

pub fn vacuum(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    engine.vacuum(collection)?;
    state.audit.record(op::OPS_VACUUM, collection, true, "");
    Ok(serde_json::json!({ "vacuumed": collection }))
}
