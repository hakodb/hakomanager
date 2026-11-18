use super::{arg_str_or, engine};
use crate::dto::TraverseSpecInput;
use crate::error::{ManagerError, Result};
use crate::state::ManagerState;
use serde_json::Value;

pub fn paths(args: &Value, state: &ManagerState, simple: bool) -> Result<Value> {
    let engine = engine(args, state)?;
    let mut spec = traverse_spec(args)?;
    if spec.collection.is_empty() {
        spec.collection = arg_str_or(args, "collection", "")?.to_string();
    }
    let simple = args
        .get("simple")
        .and_then(Value::as_bool)
        .unwrap_or(simple);
    let hits = engine.graph_paths(&spec, simple)?;
    serde_json::to_value(hits).map_err(ManagerError::from)
}

pub fn components(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_components(&collection, &spec)
}

pub fn communities(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_communities(&collection, &spec)
}

pub fn pagerank(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    let seeds: Vec<(String, String)> = args
        .get("seeds")
        .and_then(Value::as_array)
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|seed| {
            let path = seed.as_str()?;
            path.split_once('/')
                .map(|(collection, id)| (collection.to_string(), id.to_string()))
        })
        .collect();
    let damping = args.get("damping").and_then(Value::as_f64).unwrap_or(0.85);
    let top = args
        .get("top")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(20);
    engine.graph_pagerank(&collection, &seeds, &spec, damping, top)
}

pub fn cycle(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_cycle(&collection, &spec)
}

pub fn topo(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_topo(&collection, &spec)
}

pub fn degree(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_degree(&collection, &spec)
}

pub fn subgraph(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let mut spec = traverse_spec(args)?;
    if spec.collection.is_empty() {
        spec.collection = arg_str_or(args, "collection", "")?.to_string();
    }
    let fields: Option<Vec<String>> = args.get("fields").and_then(Value::as_array).map(|values| {
        values
            .iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect()
    });
    engine.graph_subgraph(&spec, fields.as_deref())
}

pub fn export(args: &Value, state: &ManagerState) -> Result<Value> {
    let engine = engine(args, state)?;
    let (collection, spec) = collection_and_spec(args)?;
    engine.graph_export(&collection, &spec)
}

fn traverse_spec(args: &Value) -> Result<TraverseSpecInput> {
    let source = args.get("spec").unwrap_or(args);
    serde_json::from_value(source.clone()).map_err(ManagerError::from)
}

fn collection_and_spec(args: &Value) -> Result<(String, TraverseSpecInput)> {
    let mut spec = traverse_spec(args)?;
    let collection = if spec.collection.is_empty() {
        arg_str_or(args, "collection", "")?.to_string()
    } else {
        spec.collection.clone()
    };
    spec.collection = collection.clone();
    Ok((collection, spec))
}
