//! JSON-facing data transfer objects and the command envelope.
//!
//! Every command received from a frontend is a `Request` and every answer is a
//! `ResponseEnvelope`. The envelope is intentionally small and stable so the
//! same core can serve a Tauri shell and, later, an HTTP shell.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub op: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorKind {
    Conflict,
    Unique,
    Validation,
    Generic,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorInfo {
    pub kind: ErrorKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResponseEnvelope {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

impl ResponseEnvelope {
    pub fn ok(data: impl Serialize) -> Self {
        let data = match serde_json::to_value(data) {
            Ok(value) => Some(value),
            Err(err) => {
                return Self::err(ErrorKind::Generic, format!("serialization failed: {err}"));
            }
        };
        Self {
            ok: true,
            data,
            error: None,
        }
    }

    pub fn err(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(ErrorInfo {
                kind,
                message: message.into(),
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseProfile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub read_only: bool,
    pub durability: String,
    pub encryption_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionInfo {
    pub name: String,
    pub doc_count: u64,
    pub live_bytes: u64,
    pub total_bytes: u64,
    pub segment_count: u32,
    pub wal_bytes: u64,
    pub blob_bytes: u64,
    pub tombstone_count: u64,
    pub unloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentView {
    pub collection: String,
    pub id: String,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    pub affected: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

impl OperationResult {
    pub fn new(affected: u64) -> Self {
        Self {
            affected,
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterSpec {
    pub field: String,
    pub op: String,
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderSpec {
    pub field: String,
    #[serde(default = "default_ascending")]
    pub ascending: bool,
}

fn default_ascending() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QuerySpec {
    pub collection: String,
    #[serde(default)]
    pub filters: Vec<FilterSpec>,
    #[serde(default)]
    pub or_filters: Vec<FilterSpec>,
    #[serde(default)]
    pub order_by: Vec<OrderSpec>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    #[serde(default)]
    pub select: Vec<String>,
}

/// Operation names. Kept as strings on the wire; constants avoid typos in core.
pub mod op {
    pub const WORKSPACE_LIST: &str = "workspace.list";
    pub const WORKSPACE_OPEN: &str = "workspace.open";
    pub const WORKSPACE_INFO: &str = "workspace.info";
    pub const WORKSPACE_CLOSE: &str = "workspace.close";
    pub const WORKSPACE_SET_WRITES: &str = "workspace.setWrites";

    pub const COLLECTION_LIST: &str = "collection.list";
    pub const COLLECTION_STATS: &str = "collection.stats";
    pub const COLLECTION_DROP: &str = "collection.drop";
    pub const COLLECTION_RENAME: &str = "collection.rename";

    pub const DOCUMENT_GET: &str = "document.get";
    pub const DOCUMENT_LIST: &str = "document.list";
    pub const DOCUMENT_PUT: &str = "document.put";
    pub const DOCUMENT_PATCH: &str = "document.patch";
    pub const DOCUMENT_DELETE: &str = "document.delete";

    pub const QUERY_RUN: &str = "query.run";
    pub const QUERY_EXPLAIN: &str = "query.explain";
    pub const QUERY_AGGREGATE: &str = "query.aggregate";
    pub const QUERY_CONSOLE: &str = "query.console";

    pub const INDEX_LIST: &str = "index.list";
    pub const INDEX_CREATE: &str = "index.create";
    pub const INDEX_DROP: &str = "index.drop";

    pub const OPS_QUIESCENCE: &str = "ops.quiescence";
    pub const OPS_WATCH: &str = "ops.watch";
    pub const OPS_STATS: &str = "ops.stats";
    pub const OPS_BACKUP: &str = "ops.backup";
    pub const OPS_FLUSH: &str = "ops.flush";
    pub const OPS_COMPACT: &str = "ops.compact";
    pub const OPS_VACUUM: &str = "ops.vacuum";

    pub const VECTOR_SEARCH: &str = "vector.search";
    pub const VECTOR_SEARCH_SCORED: &str = "vector.searchScored";
    pub const VECTOR_INFO: &str = "vector.info";
    pub const VECTOR_HYBRID: &str = "vector.hybrid";

    pub const GRAPH_PATHS: &str = "graph.paths";
    pub const GRAPH_SIMPLE_PATHS: &str = "graph.simplePaths";
    pub const GRAPH_COMPONENTS: &str = "graph.components";
    pub const GRAPH_COMMUNITIES: &str = "graph.communities";
    pub const GRAPH_PAGERANK: &str = "graph.pagerank";
    pub const GRAPH_CYCLE: &str = "graph.cycle";
    pub const GRAPH_TOPO: &str = "graph.topo";
    pub const GRAPH_DEGREE: &str = "graph.degree";
    pub const GRAPH_SUBGRAPH: &str = "graph.subgraph";
    pub const GRAPH_EXPORT: &str = "graph.export";

    pub const OPS_SCHEMA_LIST: &str = "ops.schemaList";
    pub const OPS_SCHEMA_SET: &str = "ops.schemaSet";
    pub const OPS_SCHEMA_CLEAR: &str = "ops.schemaClear";
    pub const OPS_AUDIT: &str = "ops.audit";
    pub const OPS_SECURITY_SET: &str = "ops.securitySet";
    pub const OPS_RESTORE_AVAILABLE: &str = "ops.restoreAvailable";
    pub const OPS_DELETE_QUEUE: &str = "ops.deleteQueue";
    pub const OPS_RESTORE: &str = "ops.restore";
    pub const OPS_SWEEP: &str = "ops.sweep";
    pub const OPS_INSPECT_INDEX: &str = "ops.inspectIndex";
    pub const OPS_STORAGE_KEYS: &str = "ops.storageKeys";
    pub const OPS_SNAPSHOT_INDEXES: &str = "ops.snapshotIndexes";
    pub const OPS_VERSIONS: &str = "ops.versions";

    pub const SYNC_START: &str = "sync.start";
    pub const SYNC_STOP: &str = "sync.stop";
    pub const SYNC_STATUS: &str = "sync.status";
    pub const SYNC_PEERS: &str = "sync.peers";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorHit {
    pub id: String,
    pub score: f64,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphHit {
    pub collection: String,
    pub id: String,
    pub depth: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraverseSpecInput {
    #[serde(default)]
    pub collection: String,
    #[serde(default)]
    pub start_id: String,
    #[serde(default = "default_direction")]
    pub direction: u8,
    #[serde(default)]
    pub edge_field: Option<String>,
    #[serde(default)]
    pub via_edge: Option<String>,
    #[serde(default)]
    pub weight_field: Option<String>,
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_direction() -> u8 {
    2
}

fn default_max_depth() -> usize {
    4
}

fn default_limit() -> usize {
    50
}
