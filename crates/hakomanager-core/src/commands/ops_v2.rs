use super::{arg_str, engine};
use crate::dto::op;
use crate::error::Result;
use crate::state::ManagerState;
use serde_json::Value;

pub fn schema_list(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.schema_list()
}

pub fn schema_set(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let schema = args
        .get("schema")
        .ok_or_else(|| crate::error::ManagerError::Validation("missing 'schema'".into()))?;
    let result = engine.schema_set(collection, schema)?;
    state.audit.record(op::OPS_SCHEMA_SET, collection, true, "");
    Ok(result)
}

pub fn schema_clear(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let result = engine.schema_clear(collection)?;
    state
        .audit
        .record(op::OPS_SCHEMA_CLEAR, collection, true, "");
    Ok(result)
}

pub fn audit(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.audit()
}

pub fn security_set(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let rules = args
        .get("rules")
        .unwrap_or(args.get("args").unwrap_or(&Value::Null));
    let result = engine.security_set(rules)?;
    state.audit.record(op::OPS_SECURITY_SET, "*", true, "");
    Ok(result)
}

pub fn restore_available(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    engine.restore_available(args.get("collection").and_then(Value::as_str))
}

pub fn delete_queue(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    engine.delete_queue(args.get("collection").and_then(Value::as_str))
}

pub fn restore(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let id = arg_str(args, "id")?;
    let result = engine.restore(collection, id)?;
    state
        .audit
        .record(op::OPS_RESTORE, &format!("{collection}/{id}"), true, "");
    Ok(result)
}

pub fn sweep(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let result = engine.sweep()?;
    state.audit.record(op::OPS_SWEEP, "*", true, "");
    Ok(result)
}

pub fn inspect_index(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    engine.inspect_index(arg_str(args, "collection")?, arg_str(args, "field")?)
}

pub fn storage_keys(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    engine.storage_keys(arg_str(args, "collection")?)
}

pub fn snapshot_indexes(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.snapshot_indexes()
}

pub fn versions(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.versions()
}
