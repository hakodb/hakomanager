use super::{adapter_args, arg_str, engine};
use crate::dto::op;
use crate::error::Result;
use crate::state::ManagerState;
use serde_json::Value;

pub fn list(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = args.get("collection").and_then(Value::as_str);
    engine.list_indexes(collection)
}

pub fn create(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let kind = arg_str(args, "kind")?;
    let detail = adapter_args(args);
    let result = engine.create_index(kind, &detail)?;
    let target = detail
        .get("collection")
        .and_then(Value::as_str)
        .unwrap_or(kind);
    state.audit.record(op::INDEX_CREATE, target, true, kind);
    Ok(result)
}

pub fn drop(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let kind = arg_str(args, "kind")?;
    let detail = adapter_args(args);
    engine.drop_index(kind, &detail)?;
    let target = detail
        .get("collection")
        .and_then(Value::as_str)
        .unwrap_or(kind);
    state.audit.record(op::INDEX_DROP, target, true, kind);
    Ok(serde_json::json!({ "kind": kind, "dropped": true }))
}
