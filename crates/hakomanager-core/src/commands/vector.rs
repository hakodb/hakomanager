use super::{arg_str, arg_usize_or, engine};
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use hakodb::query::filter::{Filter, Operator};
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
    let filters = filters_arg(args)?;
    let hits = if filters.is_empty() {
        engine.vector_search(collection, field, &vector, k, max_distance, scored)?
    } else {
        engine.vector_search_filtered(collection, field, &vector, k, max_distance, &filters)?
    };
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
    let filters = filters_arg(args)?;
    let hits = engine.vector_hybrid(
        collection,
        text_field,
        text_query,
        vector_field,
        &vector,
        k,
        rrf_k,
        &filters,
    )?;
    serde_json::to_value(hits).map_err(ManagerError::from)
}

/// Optional admission filters, same grammar as the engine's C ABI:
/// `[{"field":"tenant","op":"eq","value":"t2"}, ...]`. Absent or empty
/// array = unfiltered (byte-identical to the unfiltered call).
fn filters_arg(args: &Value) -> Result<Vec<Filter>> {
    let Some(raw) = args.get("filters") else {
        return Ok(Vec::new());
    };
    let Value::Null = raw else {
        let entries = raw
            .as_array()
            .ok_or_else(|| ManagerError::Validation("filters must be a JSON array".into()))?;
        return entries
            .iter()
            .map(|entry| {
                let obj = entry.as_object().ok_or_else(|| {
                    ManagerError::Validation("each filter must be an object".into())
                })?;
                let field = obj
                    .get("field")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ManagerError::Validation("filter.field must be a string".into()))?;
                let op = obj
                    .get("op")
                    .and_then(Value::as_str)
                    .ok_or_else(|| ManagerError::Validation("filter.op must be a string".into()))?;
                let value = obj
                    .get("value")
                    .ok_or_else(|| ManagerError::Validation("filter.value is required".into()))?;
                Ok(Filter {
                    field: field.to_string(),
                    op: parse_op(op)?,
                    value: json_to_value(value),
                })
            })
            .collect();
    };
    Ok(Vec::new())
}

fn parse_op(name: &str) -> Result<Operator> {
    Ok(match name {
        "eq" => Operator::Eq,
        "ne" => Operator::Ne,
        "gt" => Operator::Gt,
        "gte" => Operator::Gte,
        "lt" => Operator::Lt,
        "lte" => Operator::Lte,
        "match" => Operator::Match,
        "match_prefix" | "matchPrefix" => Operator::MatchPrefix,
        "contains" => Operator::Contains,
        "starts_with" | "startsWith" => Operator::StartsWith,
        "in" => Operator::In,
        "array_contains" | "arrayContains" => Operator::ArrayContains,
        "array_contains_any" | "arrayContainsAny" => Operator::ArrayContainsAny,
        "array_all_eq" | "arrayAllEq" => Operator::ArrayAllEq,
        "not_in" | "notIn" => Operator::NotIn,
        other => {
            return Err(ManagerError::Validation(format!(
                "unknown filter op '{other}'"
            )))
        }
    })
}

fn json_to_value(value: &Value) -> hakodb::document::value::Value {
    match value {
        Value::Null => hakodb::document::value::Value::Null,
        Value::Bool(b) => hakodb::document::value::Value::Bool(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                hakodb::document::value::Value::Int(i)
            } else {
                hakodb::document::value::Value::Float(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => hakodb::document::value::Value::String(s.clone()),
        other => hakodb::document::value::Value::String(other.to_string()),
    }
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
