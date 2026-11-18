use super::{arg_str, arg_usize_or, engine};
use crate::dto::op;
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use serde_json::Value;

pub fn get(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let id = arg_str(args, "id")?;
    let document = engine.get_document(collection, id)?;
    serde_json::to_value(document).map_err(ManagerError::from)
}

pub fn list(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let limit = arg_usize_or(args, "limit", 100)?;
    let offset = arg_usize_or(args, "offset", 0)?;
    let documents = engine.list_documents(collection, limit, offset)?;
    serde_json::to_value(documents).map_err(ManagerError::from)
}

pub fn put(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let id = arg_str(args, "id")?;
    let data = args
        .get("data")
        .ok_or_else(|| ManagerError::Validation("missing document 'data'".into()))?;
    engine.put_document(collection, id, data)?;
    state
        .audit
        .record(op::DOCUMENT_PUT, &format!("{collection}/{id}"), true, "");
    Ok(serde_json::json!({ "collection": collection, "id": id }))
}

pub fn patch(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let id = arg_str(args, "id")?;
    let data = args
        .get("data")
        .ok_or_else(|| ManagerError::Validation("missing patch 'data'".into()))?;
    engine.patch_document(collection, id, data)?;
    state
        .audit
        .record(op::DOCUMENT_PATCH, &format!("{collection}/{id}"), true, "");
    Ok(serde_json::json!({ "collection": collection, "id": id }))
}

pub fn delete(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let id = arg_str(args, "id")?;
    let force = args.get("force").and_then(Value::as_bool).unwrap_or(false);
    engine.delete_document(collection, id, force)?;
    let mode = if force { "force" } else { "soft" };
    state.audit.record(
        op::DOCUMENT_DELETE,
        &format!("{collection}/{id}"),
        true,
        mode,
    );
    Ok(serde_json::json!({ "collection": collection, "id": id, "mode": mode }))
}
