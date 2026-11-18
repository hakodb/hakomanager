use super::{arg_str, arg_usize_or, engine};
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use serde_json::Value;

pub fn search(args: &Value, state: &ManagerState, scored: bool) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let field = arg_str(args, "field")?;
    let vector = vector_arg(args)?;
    let k = arg_usize_or(args, "k", 10)?;
    let scored = args
        .get("scored")
        .and_then(Value::as_bool)
        .unwrap_or(scored);
    let max_distance = args.get("maxDistance").and_then(Value::as_f64);
    let hits = engine.vector_search(collection, field, &vector, k, max_distance, scored)?;
    serde_json::to_value(hits).map_err(ManagerError::from)
}

pub fn info(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    engine.vector_info(arg_str(args, "collection")?, arg_str(args, "field")?)
}

pub fn hybrid(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let collection = arg_str(args, "collection")?;
    let text_field = arg_str(args, "textField")?;
    let text_query = arg_str(args, "textQuery")?;
    let vector_field = arg_str(args, "vectorField")?;
    let vector = vector_arg(args)?;
    let k = arg_usize_or(args, "k", 10)?;
    let rrf_k = arg_usize_or(args, "rrfK", 60)?;
    let hits = engine.vector_hybrid(
        collection,
        text_field,
        text_query,
        vector_field,
        &vector,
        k,
        rrf_k,
    )?;
    serde_json::to_value(hits).map_err(ManagerError::from)
}

fn vector_arg(args: &Value) -> Result<Vec<f32>> {
    let values = args
        .get("vector")
        .and_then(Value::as_array)
        .ok_or_else(|| ManagerError::Validation("vector must be an array of numbers".into()))?;
    values
        .iter()
        .map(|value| {
            value
                .as_f64()
                .map(|number| number as f32)
                .ok_or_else(|| ManagerError::Validation("vector values must be numbers".into()))
        })
        .collect()
}
