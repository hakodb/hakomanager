//! Command dispatch. All frontend operations enter through `dispatch`.

pub(crate) mod collection;
pub(crate) mod document;
mod graph;
pub(crate) mod index;
pub(crate) mod ops;
pub(crate) mod ops_v2;
mod query;
mod sync;
pub(crate) mod vector;
mod workspace;

use crate::adapter_v2::AdvancedAdapter;
use crate::dto::{op, Request, ResponseEnvelope};
use crate::error::{ManagerError, Result};
use crate::state::state;
use serde_json::Value;
use std::sync::Arc;

pub fn dispatch(request: Request) -> ResponseEnvelope {
    let outcome = match state().lock() {
        Ok(mut guard) => handle(&request, &mut guard),
        Err(error) => Err(ManagerError::Generic(format!(
            "state lock poisoned: {error}"
        ))),
    };
    match outcome {
        Ok(data) => ResponseEnvelope::ok(data),
        Err(error) => ResponseEnvelope::err(error.kind(), error.message()),
    }
}

fn handle(request: &Request, state: &mut crate::state::ManagerState) -> Result<Value> {
    let args = &request.args;
    match request.op.as_str() {
        op::WORKSPACE_LIST => workspace::list(state),
        op::WORKSPACE_OPEN => workspace::open(args, state),
        op::WORKSPACE_INFO => workspace::info(args, state),
        op::WORKSPACE_CLOSE => workspace::close(args, state),
        op::WORKSPACE_SET_WRITES => workspace::set_writes(args, state),

        op::COLLECTION_LIST => collection::list(args, state),
        op::COLLECTION_STATS => collection::stats(args, state),
        op::COLLECTION_DROP => collection::drop(args, state),
        op::COLLECTION_RENAME => collection::rename(args, state),

        op::DOCUMENT_GET => document::get(args, state),
        op::DOCUMENT_LIST => document::list(args, state),
        op::DOCUMENT_PUT => document::put(args, state),
        op::DOCUMENT_PATCH => document::patch(args, state),
        op::DOCUMENT_DELETE => document::delete(args, state),

        op::QUERY_RUN => query::run(args, state),
        op::QUERY_EXPLAIN => query::explain(args, state),
        op::QUERY_AGGREGATE => query::aggregate(args, state),
        op::QUERY_CONSOLE => query::console(args, state),

        op::INDEX_LIST => index::list(args, state),
        op::INDEX_CREATE => index::create(args, state),
        op::INDEX_DROP => index::drop(args, state),

        op::OPS_QUIESCENCE => ops::quiescence(args, state),
        op::OPS_WATCH => ops::watch(args, state),
        op::OPS_STATS => ops::stats(args, state),
        op::OPS_BACKUP => ops::backup(args, state),
        op::OPS_FLUSH => ops::flush(args, state),
        op::OPS_COMPACT => ops::compact(args, state),
        op::OPS_VACUUM => ops::vacuum(args, state),

        op::VECTOR_SEARCH => vector::search(args, state, false),
        op::VECTOR_SEARCH_SCORED => vector::search(args, state, true),
        op::VECTOR_INFO => vector::info(args, state),
        op::VECTOR_HYBRID => vector::hybrid(args, state),

        op::GRAPH_PATHS => graph::paths(args, state, false),
        op::GRAPH_SIMPLE_PATHS => graph::paths(args, state, true),
        op::GRAPH_COMPONENTS => graph::components(args, state),
        op::GRAPH_COMMUNITIES => graph::communities(args, state),
        op::GRAPH_PAGERANK => graph::pagerank(args, state),
        op::GRAPH_CYCLE => graph::cycle(args, state),
        op::GRAPH_TOPO => graph::topo(args, state),
        op::GRAPH_DEGREE => graph::degree(args, state),
        op::GRAPH_SUBGRAPH => graph::subgraph(args, state),
        op::GRAPH_EXPORT => graph::export(args, state),

        op::OPS_SCHEMA_LIST => ops_v2::schema_list(args, state),
        op::OPS_SCHEMA_SET => ops_v2::schema_set(args, state),
        op::OPS_SCHEMA_CLEAR => ops_v2::schema_clear(args, state),
        op::OPS_AUDIT => ops_v2::audit(args, state),
        op::OPS_SECURITY_SET => ops_v2::security_set(args, state),
        op::OPS_RESTORE_AVAILABLE => ops_v2::restore_available(args, state),
        op::OPS_DELETE_QUEUE => ops_v2::delete_queue(args, state),
        op::OPS_RESTORE => ops_v2::restore(args, state),
        op::OPS_SWEEP => ops_v2::sweep(args, state),
        op::OPS_INSPECT_INDEX => ops_v2::inspect_index(args, state),
        op::OPS_STORAGE_KEYS => ops_v2::storage_keys(args, state),
        op::OPS_SNAPSHOT_INDEXES => ops_v2::snapshot_indexes(args, state),
        op::OPS_VERSIONS => ops_v2::versions(args, state),

        op::SYNC_START => sync::start(args, state),
        op::SYNC_STOP => sync::stop(args, state),
        op::SYNC_STATUS => sync::status(args, state),
        op::SYNC_PEERS => sync::peers(args, state),

        other => Err(ManagerError::Validation(format!(
            "unknown operation '{other}'"
        ))),
    }
}

pub(crate) fn engine(
    args: &Value,
    state: &crate::state::ManagerState,
) -> Result<Arc<dyn AdvancedAdapter>> {
    let id = arg_str(args, "profileId")?;
    state
        .databases
        .get(id)
        .map(|entry| entry.engine.clone())
        .ok_or_else(|| ManagerError::Validation(format!("unknown database '{id}'")))
}

pub(crate) fn adapter_args(args: &Value) -> Value {
    args.get("args").cloned().unwrap_or_else(|| args.clone())
}

pub(crate) fn arg_str<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| ManagerError::Validation(format!("missing string argument '{key}'")))
}

pub(crate) fn arg_str_or<'a>(args: &'a Value, key: &str, default: &'a str) -> Result<&'a str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(value) => value
            .as_str()
            .ok_or_else(|| ManagerError::Validation(format!("argument '{key}' must be a string"))),
    }
}

pub(crate) fn arg_usize_or(args: &Value, key: &str, default: usize) -> Result<usize> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(value) => value
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| ManagerError::Validation(format!("argument '{key}' must be a number"))),
    }
}
