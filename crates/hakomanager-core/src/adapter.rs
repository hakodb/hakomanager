//! Engine-facing abstraction and the local HakoDB implementation.
//!
//! Commands only know the `EngineAdapter` trait. `LocalHakoAdapter` implements
//! it on top of the embedded `hakodb` crate; a future remote adapter can
//! implement the same surface against an HTTP gateway.

use crate::dto::{CollectionInfo, DocumentView, QuerySpec};
use crate::error::{ManagerError, Result};
use base64::Engine as _;
use hakodb::config::{DurabilityMode, HakoConfig};
use hakodb::document::hako_doc::HakoDoc;
use hakodb::document::value::Value as HakoValue;
use hakodb::engine::Hako;
use hakodb::index::composite::definition::SortDirection;
use hakodb::index::vector::Metric;
use hakodb::query::filter::Operator;
use hakodb::query::query::Query;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::adapter_v2::SyncHandles;

pub trait EngineAdapter: Send + Sync {
    fn set_writes(&self, enabled: bool);
    fn writes_enabled(&self) -> bool;

    fn list_collections(&self) -> Result<Vec<String>>;
    fn collection_stats(&self, name: &str) -> Result<CollectionInfo>;
    fn get_document(&self, collection: &str, id: &str) -> Result<Option<DocumentView>>;
    fn list_documents(
        &self,
        collection: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DocumentView>>;
    fn put_document(&self, collection: &str, id: &str, data: &Value) -> Result<()>;
    fn patch_document(&self, collection: &str, id: &str, data: &Value) -> Result<()>;
    fn delete_document(&self, collection: &str, id: &str, force: bool) -> Result<()>;

    fn run_query(&self, spec: &QuerySpec) -> Result<Vec<DocumentView>>;
    fn explain(&self, spec: &QuerySpec) -> Result<Value>;
    fn aggregate(&self, spec: &QuerySpec, op: &str, field: Option<&str>) -> Result<Value>;

    fn list_indexes(&self, collection: Option<&str>) -> Result<Value>;
    fn create_index(&self, kind: &str, args: &Value) -> Result<Value>;
    fn drop_index(&self, kind: &str, args: &Value) -> Result<()>;

    fn drop_collection(&self, name: &str) -> Result<Value>;
    fn rename_collection(&self, from: &str, to: &str) -> Result<()>;

    fn quiescence(&self) -> Value;
    fn watch(&self, collection: Option<&str>) -> Result<()>;
    /// Whether this open fell back to a plain read-only open because the
    /// directory is already held by another HakoDB instance.
    fn shared_open(&self) -> bool;
    /// Filesystem path of the open database directory (for backups).
    fn db_path(&self) -> String;

    fn stats(&self) -> Result<Value>;
    fn backup(&self, path: &str) -> Result<()>;
    fn flush(&self) -> Result<()>;
    fn compact(&self, collection: Option<&str>) -> Result<()>;
    fn vacuum(&self, collection: &str) -> Result<()>;
}

/// Shared write gate. Read-only is the default: browsing a database must
/// never mutate it without an explicit user action.
#[derive(Debug, Default)]
pub struct WriteGate {
    enabled: AtomicBool,
}

impl WriteGate {
    pub fn set(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Release);
    }

    pub fn get(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    pub fn require(&self) -> Result<()> {
        if self.get() {
            Ok(())
        } else {
            Err(ManagerError::Validation(
                "database is open read-only; enable writes to modify it".to_string(),
            ))
        }
    }
}

/// Adapter over a local embedded HakoDB directory.
pub struct LocalHakoAdapter {
    pub(crate) db: Arc<Hako>,
    pub(crate) gate: WriteGate,
    pub(crate) path: String,
    pub(crate) sync: Mutex<SyncHandles>,
    pub(crate) runtime: tokio::runtime::Runtime,
    /// Set when open_exclusive failed and we fell back to a plain
    /// read-only open (directory held by another instance).
    pub(crate) shared: AtomicBool,
}

impl LocalHakoAdapter {
    pub fn open(
        path: &str,
        durability: &str,
        read_only: bool,
        encryption_key: Option<&str>,
    ) -> Result<Self> {
        let mut config = HakoConfig {
            durability_mode: parse_durability(durability)?,
            ..HakoConfig::default()
        };
        if let Some(key) = encryption_key {
            config.encryption_key = Some(key.to_string());
        }
        // Exclusive first (0.21.0 advisory data-dir lock): a second writable
        // holder on one dir is the WAL-corruption class, so refuse it loudly.
        // When the caller only wanted to browse (read-only), fall back to a
        // plain open instead of failing - the other holder keeps writing.
        let (db, effective_read_only, shared) = match Hako::open_exclusive(path, config.clone()) {
            Ok(db) => (db, read_only, false),
            Err(_) if read_only => {
                let db = Hako::open(path, config).map_err(engine_error)?;
                (db, true, true)
            }
            Err(error) => return Err(engine_error(error)),
        };
        let db = Arc::new(db);
        db.set_read_only(effective_read_only);
        let gate = WriteGate::default();
        gate.set(!effective_read_only);
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("hakomanager-sync")
            .enable_all()
            .build()
            .map_err(engine_error)?;
        Ok(Self {
            db,
            gate,
            path: path.to_string(),
            sync: Mutex::new(SyncHandles::default()),
            runtime,
            shared: AtomicBool::new(shared),
        })
    }

    /// True when the open fell back to a plain (lock-free) open because the
    /// directory is held by another instance. Read-only browsing still works;
    /// the UI should show this so the user knows writes are impossible.
    pub fn is_shared_open(&self) -> bool {
        self.shared.load(Ordering::Acquire)
    }

    pub fn path(&self) -> &str {
        &self.path
    }

    pub fn quiescence(&self) -> Value {
        let status = self.db.quiescence_status();
        serde_json::json!({
            "indexes_ready": status.indexes_ready,
            "pending_index_ops": status.pending_index_ops,
            "index_backfills": status.index_backfills,
            "pending_blob_bytes": status.pending_blob_bytes,
            "queued_blob_items": status.queued_blob_items,
            "maintenance_running": status.maintenance_running,
            "quiescent": status.is_quiescent(),
        })
    }

    pub fn change_events(&self, collection: Option<&str>) -> Result<()> {
        // The engine matches subscriptions literally per collection name, so
        // a "*" wildcard never fires; subscribe per collection instead.
        let collections: Vec<String> = match collection {
            Some(name) => vec![name.to_string()],
            None => self.db.list_collections().map_err(engine_error)?,
        };
        for name in collections {
            let receiver = self.db.watch_collection(&name);
            std::thread::spawn(move || {
                while let Ok(event) = receiver.recv() {
                    let path = event.path.to_string();
                    let kind = match event.kind {
                        hakodb::engine::ChangeKind::Put => "put",
                        hakodb::engine::ChangeKind::Delete => "delete",
                    };
                    crate::watch::publish(serde_json::json!({
                        "collection": name,
                        "path": path,
                        "kind": kind,
                    }));
                }
            });
        }
        Ok(())
    }
}

impl EngineAdapter for LocalHakoAdapter {
    fn set_writes(&self, enabled: bool) {
        self.db.set_read_only(!enabled);
        self.gate.set(enabled);
    }

    fn writes_enabled(&self) -> bool {
        self.gate.get()
    }

    fn list_collections(&self) -> Result<Vec<String>> {
        self.db.list_collections().map_err(engine_error)
    }

    fn collection_stats(&self, name: &str) -> Result<CollectionInfo> {
        let stats = self.db.collection_stats(name).map_err(engine_error)?;
        Ok(CollectionInfo {
            name: stats.collection,
            doc_count: stats.doc_count,
            live_bytes: stats.live_bytes,
            total_bytes: stats.total_bytes,
            segment_count: stats.segment_count,
            wal_bytes: stats.wal_bytes,
            blob_bytes: stats.blob_bytes,
            tombstone_count: stats.tombstone_count,
            unloaded: stats.unloaded,
        })
    }

    fn get_document(&self, collection: &str, id: &str) -> Result<Option<DocumentView>> {
        let doc = self.db.get(collection, id).map_err(engine_error)?;
        Ok(doc.map(|doc| DocumentView {
            collection: collection.to_string(),
            id: id.to_string(),
            data: doc_to_json(&doc),
        }))
    }

    fn list_documents(
        &self,
        collection: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DocumentView>> {
        let query = Query::new(collection).limit(limit).offset(offset);
        let rows = self.db.query(query).map_err(engine_error)?;
        Ok(rows
            .into_iter()
            .map(|(id, doc)| DocumentView {
                collection: collection.to_string(),
                id,
                data: doc_to_json(&doc),
            })
            .collect())
    }

    fn put_document(&self, collection: &str, id: &str, data: &Value) -> Result<()> {
        self.gate.require()?;
        let doc = doc_from_json(data)?;
        self.db.put(collection, id, &doc).map_err(engine_error)?;
        Ok(())
    }

    fn patch_document(&self, collection: &str, id: &str, data: &Value) -> Result<()> {
        self.gate.require()?;
        let object = data
            .as_object()
            .ok_or_else(|| ManagerError::Validation("patch data must be an object".into()))?;
        let mut updates = Vec::with_capacity(object.len());
        for (key, value) in object {
            updates.push((key.clone(), value_from_json(value.clone())?));
        }
        self.db
            .patch(collection, id, updates)
            .map_err(engine_error)?;
        Ok(())
    }

    fn delete_document(&self, collection: &str, id: &str, force: bool) -> Result<()> {
        self.gate.require()?;
        if force {
            self.db.delete_force(collection, id).map_err(engine_error)?;
        } else {
            self.db.delete(collection, id).map_err(engine_error)?;
        }
        Ok(())
    }

    fn run_query(&self, spec: &QuerySpec) -> Result<Vec<DocumentView>> {
        let query = build_query(spec)?;
        let rows = self.db.query(query).map_err(engine_error)?;
        Ok(rows
            .into_iter()
            .map(|(id, doc)| DocumentView {
                collection: spec.collection.clone(),
                id,
                data: doc_to_json(&doc),
            })
            .collect())
    }

    fn explain(&self, spec: &QuerySpec) -> Result<Value> {
        let report = self
            .db
            .explain_report(build_query(spec)?)
            .map_err(engine_error)?;
        serde_json::to_value(report).map_err(ManagerError::from)
    }

    fn aggregate(&self, spec: &QuerySpec, op: &str, field: Option<&str>) -> Result<Value> {
        let rows = self.run_query(spec)?;
        let op = op.to_lowercase();
        if op == "count" {
            return Ok(serde_json::json!({ "result": rows.len() as f64 }));
        }
        let field = field.ok_or_else(|| {
            ManagerError::Validation(format!("aggregate '{op}' requires a field"))
        })?;
        let mut values = Vec::new();
        for row in &rows {
            if let Some(number) = row.data.get(field).and_then(Value::as_f64) {
                values.push(number);
            }
        }
        let result = match op.as_str() {
            "sum" => Some(values.iter().sum::<f64>()),
            "avg" if !values.is_empty() => Some(values.iter().sum::<f64>() / values.len() as f64),
            "min" => values
                .iter()
                .copied()
                .fold(None::<f64>, |acc, v| Some(acc.map_or(v, |a| a.min(v)))),
            "max" => values
                .iter()
                .copied()
                .fold(None::<f64>, |acc, v| Some(acc.map_or(v, |a| a.max(v)))),
            "avg" => None,
            other => {
                return Err(ManagerError::Validation(format!(
                    "unknown aggregate '{other}'"
                )));
            }
        };
        Ok(serde_json::json!({ "result": result }))
    }

    fn list_indexes(&self, collection: Option<&str>) -> Result<Value> {
        let indexes = self.db.list_indexes(collection);
        serde_json::to_value(indexes).map_err(ManagerError::from)
    }

    fn create_index(&self, kind: &str, args: &Value) -> Result<Value> {
        self.gate.require()?;
        let collection = arg_str(args, "collection")?;
        let result = match kind {
            "secondary" => {
                let field = arg_str(args, "field")?;
                self.db
                    .create_index(collection, field)
                    .map_err(engine_error)?;
                Value::Null
            }
            "fts" => {
                let field = arg_str(args, "field")?;
                self.db
                    .create_fts_index(collection, field)
                    .map_err(engine_error)?;
                Value::Null
            }
            "vector" => {
                let field = arg_str(args, "field")?;
                let dim = arg_u32(args, "dim")?;
                let metric = parse_metric(arg_str_or(args, "metric", "cosine")?)?;
                self.db
                    .create_vector_index(collection, field, dim, metric)
                    .map_err(engine_error)?;
                Value::Null
            }
            "composite" => {
                let fields = args
                    .get("fields")
                    .and_then(Value::as_array)
                    .ok_or_else(|| ManagerError::Validation("fields must be an array".into()))?;
                let mut parsed = Vec::with_capacity(fields.len());
                for field in fields {
                    let name = field
                        .get("field")
                        .and_then(Value::as_str)
                        .ok_or_else(|| ManagerError::Validation("field name required".into()))?;
                    let descending = field.get("desc").and_then(Value::as_bool).unwrap_or(false);
                    parsed.push((
                        name.to_string(),
                        if descending {
                            SortDirection::Desc
                        } else {
                            SortDirection::Asc
                        },
                    ));
                }
                let id = self
                    .db
                    .create_composite_index(collection, parsed)
                    .map_err(engine_error)?;
                serde_json::json!({ "index_id": id })
            }
            "traverse" => {
                self.db
                    .create_traverse_index(collection)
                    .map_err(engine_error)?;
                Value::Null
            }
            "edge" => {
                self.db
                    .create_edge_index(collection)
                    .map_err(engine_error)?;
                Value::Null
            }
            other => {
                return Err(ManagerError::Validation(format!(
                    "unknown index kind '{other}'"
                )));
            }
        };
        Ok(result)
    }

    fn drop_index(&self, kind: &str, args: &Value) -> Result<()> {
        self.gate.require()?;
        let collection = arg_str(args, "collection")?;
        match kind {
            "secondary" => self
                .db
                .drop_index(collection, arg_str(args, "field")?)
                .map_err(engine_error),
            "fts" => self
                .db
                .drop_fts_index(collection, arg_str(args, "field")?)
                .map_err(engine_error),
            "vector" => self
                .db
                .drop_vector_index(collection, arg_str(args, "field")?)
                .map_err(engine_error),
            "composite" => self
                .db
                .drop_composite_index(collection, arg_u32(args, "id")?)
                .map_err(engine_error),
            "traverse" => self
                .db
                .drop_traverse_index(collection)
                .map_err(engine_error),
            "edge" => self.db.drop_edge_index(collection).map_err(engine_error),
            other => Err(ManagerError::Validation(format!(
                "unknown index kind '{other}'"
            ))),
        }
    }

    fn drop_collection(&self, name: &str) -> Result<Value> {
        self.gate.require()?;
        let report = self.db.drop_collection(name).map_err(engine_error)?;
        serde_json::to_value(report).map_err(ManagerError::from)
    }

    fn rename_collection(&self, from: &str, to: &str) -> Result<()> {
        self.gate.require()?;
        self.db.rename_collection(from, to).map_err(engine_error)?;
        Ok(())
    }

    fn stats(&self) -> Result<Value> {
        let mut stats: serde_json::Map<String, Value> = self
            .db
            .get_stats()
            .into_iter()
            .map(|(key, value)| (key, Value::from(value)))
            .collect();
        stats.insert("quiescence".to_string(), self.quiescence());
        Ok(Value::Object(stats))
    }

    fn backup(&self, path: &str) -> Result<()> {
        self.db.backup(path).map_err(engine_error)
    }

    fn flush(&self) -> Result<()> {
        self.db.flush().map_err(engine_error)
    }

    fn compact(&self, collection: Option<&str>) -> Result<()> {
        match collection {
            Some(name) => self.db.compact_collection(name).map_err(engine_error),
            None => self.db.compact().map_err(engine_error),
        }
    }

    fn quiescence(&self) -> Value {
        LocalHakoAdapter::quiescence(self)
    }

    fn watch(&self, collection: Option<&str>) -> Result<()> {
        self.change_events(collection)
    }

    fn shared_open(&self) -> bool {
        LocalHakoAdapter::is_shared_open(self)
    }

    fn db_path(&self) -> String {
        self.path.clone()
    }

    fn vacuum(&self, collection: &str) -> Result<()> {
        self.gate.require()?;
        self.db.vacuum(collection).map_err(engine_error)
    }
}

pub(crate) fn engine_error<E: std::fmt::Display>(error: E) -> ManagerError {
    ManagerError::classify(error.to_string())
}

fn parse_durability(value: &str) -> Result<DurabilityMode> {
    match value.to_lowercase().replace('-', "_").as_str() {
        "always" => Ok(DurabilityMode::Always),
        "interval" => Ok(DurabilityMode::Interval),
        "manual" => Ok(DurabilityMode::Manual),
        "on_commit" => Ok(DurabilityMode::OnCommit),
        other => Err(ManagerError::Validation(format!(
            "invalid durability mode '{other}'"
        ))),
    }
}

fn parse_metric(value: &str) -> Result<Metric> {
    match value.to_lowercase().replace('-', "_").as_str() {
        "cosine" => Ok(Metric::Cosine),
        "l2" => Ok(Metric::L2),
        "inner_product" => Ok(Metric::InnerProduct),
        other => Err(ManagerError::Validation(format!(
            "invalid metric '{other}'"
        ))),
    }
}

fn parse_operator(value: &str) -> Result<Operator> {
    match value {
        "eq" => Ok(Operator::Eq),
        "ne" => Ok(Operator::Ne),
        "gt" => Ok(Operator::Gt),
        "gte" => Ok(Operator::Gte),
        "lt" => Ok(Operator::Lt),
        "lte" => Ok(Operator::Lte),
        "match" => Ok(Operator::Match),
        "matchPrefix" => Ok(Operator::MatchPrefix),
        "contains" => Ok(Operator::Contains),
        "startsWith" => Ok(Operator::StartsWith),
        "in" => Ok(Operator::In),
        "notIn" => Ok(Operator::NotIn),
        "arrayContains" => Ok(Operator::ArrayContains),
        "arrayContainsAny" => Ok(Operator::ArrayContainsAny),
        other => Err(ManagerError::Validation(format!(
            "unknown operator '{other}'"
        ))),
    }
}

fn build_query(spec: &QuerySpec) -> Result<Query> {
    let mut query = Query::new(&spec.collection);
    for filter in &spec.filters {
        let value = value_from_json(filter.value.clone())?;
        query = query.where_filter(&filter.field, parse_operator(&filter.op)?, value);
    }
    for filter in &spec.or_filters {
        let value = value_from_json(filter.value.clone())?;
        query = query.or_where(&filter.field, parse_operator(&filter.op)?, value);
    }
    for order in &spec.order_by {
        query = query.order_by(&order.field, order.ascending);
    }
    if let Some(limit) = spec.limit {
        query = query.limit(limit);
    }
    if let Some(offset) = spec.offset {
        query = query.offset(offset);
    }
    for field in &spec.select {
        query = query.select(field);
    }
    Ok(query)
}

fn doc_from_json(data: &Value) -> Result<HakoDoc> {
    let object = data
        .as_object()
        .ok_or_else(|| ManagerError::Validation("document must be a JSON object".into()))?;
    let mut doc = HakoDoc::default();
    for (key, value) in object {
        doc.insert(key.as_str(), value_from_json(value.clone())?);
    }
    Ok(doc)
}

pub(crate) fn doc_to_json(doc: &HakoDoc) -> Value {
    let json = doc.to_json();
    match json {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| match doc.get(&key) {
                    Some(hako_value) => (key, value_to_json(hako_value)),
                    None => (key, value),
                })
                .collect(),
        ),
        other => other,
    }
}

/// Convert a Hako value to JSON using explicit markers for values JSON cannot
/// represent natively (binary, references, blob links).
fn value_to_json(value: &HakoValue) -> Value {
    match value {
        HakoValue::Binary(bytes) => serde_json::json!({
            "__binary__": base64::engine::general_purpose::STANDARD.encode(bytes)
        }),
        HakoValue::Reference { collection, doc_id } => serde_json::json!({
            "__ref__": format!("{collection}/{doc_id}")
        }),
        HakoValue::BlobLink { offset, len } => serde_json::json!({
            "__blob__": { "offset": offset, "len": len }
        }),
        HakoValue::ServerTimestamp => serde_json::json!("__server_timestamp__"),
        HakoValue::Map(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, value)| (key.to_string(), value_to_json(value)))
                .collect(),
        ),
        HakoValue::Array(values) => Value::Array(values.iter().map(value_to_json).collect()),
        other => other.to_json(),
    }
}

fn value_from_json(value: Value) -> Result<HakoValue> {
    if let Value::Object(map) = &value {
        if map.len() == 1 {
            if let Some(encoded) = map.get("__binary__").and_then(Value::as_str) {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(|error| ManagerError::Validation(error.to_string()))?;
                return Ok(HakoValue::Binary(bytes));
            }
            if let Some(marker) = map.get("__server_timestamp__") {
                if marker.is_string() {
                    return Ok(HakoValue::ServerTimestamp);
                }
            }
        }
    }
    HakoValue::from_json(value).map_err(ManagerError::Validation)
}

fn arg_str<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| ManagerError::Validation(format!("missing string argument '{key}'")))
}

fn arg_str_or<'a>(args: &'a Value, key: &str, default: &'a str) -> Result<&'a str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(value) => value
            .as_str()
            .ok_or_else(|| ManagerError::Validation(format!("argument '{key}' must be a string"))),
    }
}

fn arg_u32(args: &Value, key: &str) -> Result<u32> {
    args.get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| ManagerError::Validation(format!("missing u32 argument '{key}'")))
}
