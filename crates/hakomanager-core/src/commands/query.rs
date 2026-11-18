use super::{arg_str, arg_str_or, engine};
use crate::dto::QuerySpec;
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use serde_json::Value;

pub fn run(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    let documents = engine.run_query(&spec)?;
    serde_json::to_value(documents).map_err(ManagerError::from)
}

pub fn explain(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    engine.explain(&spec)
}

pub fn aggregate(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let spec = query_spec(args)?;
    let operation = arg_str_or(args, "aggregate", "count")?;
    let field = args.get("field").and_then(Value::as_str);
    engine.aggregate(&spec, operation, field)
}

fn query_spec(args: &Value) -> Result<QuerySpec> {
    let source = args.get("spec").unwrap_or(args);
    if source.get("collection").is_none() {
        arg_str(args, "collection")?;
    }
    serde_json::from_value(source.clone()).map_err(ManagerError::from)
}
