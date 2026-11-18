//! Extended adapter surface used by the v0.2 screens: vector search, graph
//! exploration, operations and sync control.
//!
//! It is a separate trait so the MVP commands keep a small dependency surface.
//! `LocalHakoAdapter` implements both traits; the manager state stores the
//! extended trait object.

use crate::adapter::{doc_to_json, engine_error, LocalHakoAdapter};
use crate::dto::{GraphHit, TraverseSpecInput, VectorHit};
use crate::error::{ManagerError, Result};
use hakodb::cloud_sync::CloudSync;
use hakodb::engine::{AccessOp, SecurityRule};
use hakodb::index::traverse::{TraverseDir, TraverseSpec};
use hakodb::net_sync::{DiscoveryMode, NetSyncer};
#[cfg(unix)]
use hakodb::socket_sync::SocketSync;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Default)]
pub(crate) struct SyncHandles {
    pub(crate) net: Option<Arc<NetSyncer>>,
    pub(crate) cloud: Option<Arc<CloudSync>>,
    /// Unix-only in hakodb 0.21.0 (the module is `#[cfg(all(unix, feature =
    /// "socket-sync"))]`); on Windows the plane reports a validation error.
    #[cfg(unix)]
    pub(crate) socket: Option<Arc<SocketSync>>,
}

pub trait AdvancedAdapter: crate::adapter::EngineAdapter {
    fn vector_search(
        &self,
        collection: &str,
        field: &str,
        vector: &[f32],
        k: usize,
        max_distance: Option<f64>,
        scored: bool,
    ) -> Result<Vec<VectorHit>>;
    fn vector_info(&self, collection: &str, field: &str) -> Result<Value>;
    #[allow(clippy::too_many_arguments)]
    fn vector_hybrid(
        &self,
        collection: &str,
        text_field: &str,
        text_query: &str,
        vector_field: &str,
        vector: &[f32],
        k: usize,
        rrf_k: usize,
        filters: &[hakodb::query::filter::Filter],
    ) -> Result<Vec<VectorHit>>;
    /// Scored KNN with admission filters (empty slice = unfiltered).
    fn vector_search_filtered(
        &self,
        collection: &str,
        field: &str,
        vector: &[f32],
        k: usize,
        max_distance: Option<f64>,
        filters: &[hakodb::query::filter::Filter],
    ) -> Result<Vec<VectorHit>>;

    fn graph_paths(&self, input: &TraverseSpecInput, simple: bool) -> Result<Vec<GraphHit>>;
    fn graph_components(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;
    fn graph_communities(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;
    fn graph_pagerank(
        &self,
        collection: &str,
        seeds: &[(String, String)],
        input: &TraverseSpecInput,
        damping: f64,
        top: usize,
    ) -> Result<Value>;
    fn graph_cycle(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;
    fn graph_topo(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;
    fn graph_degree(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;
    fn graph_subgraph(&self, input: &TraverseSpecInput, fields: Option<&[String]>)
        -> Result<Value>;
    fn graph_export(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value>;

    fn schema_list(&self) -> Result<Value>;
    fn schema_set(&self, collection: &str, schema: &Value) -> Result<Value>;
    fn schema_clear(&self, collection: &str) -> Result<Value>;
    fn audit(&self) -> Result<Value>;
    fn security_set(&self, rules: &Value) -> Result<Value>;
    fn restore_available(&self, collection: Option<&str>) -> Result<Value>;
    fn delete_queue(&self, collection: Option<&str>) -> Result<Value>;
    fn restore(&self, collection: &str, id: &str) -> Result<Value>;
    fn sweep(&self) -> Result<Value>;
    fn inspect_index(&self, collection: &str, field: &str) -> Result<Value>;
    fn storage_keys(&self, collection: &str) -> Result<Value>;
    fn snapshot_indexes(&self) -> Result<Value>;
    fn versions(&self) -> Result<Value>;

    fn sync_start(&self, plane: &str, args: &Value) -> Result<Value>;
    fn sync_stop(&self, plane: &str) -> Result<Value>;
    fn sync_status(&self, plane: &str) -> Result<Value>;
    fn sync_peers(&self, plane: &str) -> Result<Value>;
}

impl AdvancedAdapter for LocalHakoAdapter {
    fn vector_search(
        &self,
        collection: &str,
        field: &str,
        vector: &[f32],
        k: usize,
        max_distance: Option<f64>,
        scored: bool,
    ) -> Result<Vec<VectorHit>> {
        if scored {
            let rows = self
                .db
                .find_near_scored(collection, field, vector, k, max_distance)
                .map_err(engine_error)?;
            Ok(rows
                .into_iter()
                .map(|(id, score, doc)| VectorHit {
                    id,
                    score,
                    data: doc_to_json(&doc),
                })
                .collect())
        } else {
            let rows = self
                .db
                .find_near(collection, field, vector, k)
                .map_err(engine_error)?;
            Ok(rows
                .into_iter()
                .map(|(id, doc)| VectorHit {
                    id,
                    score: 0.0,
                    data: doc_to_json(&doc),
                })
                .collect())
        }
    }

    fn vector_search_filtered(
        &self,
        collection: &str,
        field: &str,
        vector: &[f32],
        k: usize,
        max_distance: Option<f64>,
        filters: &[hakodb::query::filter::Filter],
    ) -> Result<Vec<VectorHit>> {
        let rows = self
            .db
            .find_near_scored_filtered(collection, field, vector, k, max_distance, filters)
            .map_err(engine_error)?;
        Ok(rows
            .into_iter()
            .map(|(id, score, doc)| VectorHit {
                id,
                score,
                data: doc_to_json(&doc),
            })
            .collect())
    }

    fn vector_info(&self, collection: &str, field: &str) -> Result<Value> {
        let indexes = self.db.list_indexes(Some(collection));
        Ok(json!({
            "collection": collection,
            "field": field,
            "metric": self.db.vector_metric(collection, field).map(|metric| format!("{metric:?}")),
            "graph_len": self.db.vector_graph_len(collection, field),
            "indexes": serde_json::to_value(indexes).map_err(ManagerError::from)?,
        }))
    }

    #[allow(clippy::too_many_arguments)]
    fn vector_hybrid(
        &self,
        collection: &str,
        text_field: &str,
        text_query: &str,
        vector_field: &str,
        vector: &[f32],
        k: usize,
        rrf_k: usize,
        filters: &[hakodb::query::filter::Filter],
    ) -> Result<Vec<VectorHit>> {
        let rows = self
            .db
            .hybrid_search_filtered(
                collection,
                text_field,
                text_query,
                vector_field,
                vector,
                k,
                rrf_k,
                filters,
            )
            .map_err(engine_error)?;
        Ok(rows
            .into_iter()
            .map(|(id, score, doc)| VectorHit {
                id,
                score,
                data: doc_to_json(&doc),
            })
            .collect())
    }

    fn graph_paths(&self, input: &TraverseSpecInput, simple: bool) -> Result<Vec<GraphHit>> {
        let spec = traverse_spec(input)?;
        let hits = if simple {
            self.db
                .find_simple_paths(&input.collection, &input.start_id, &spec)
        } else {
            self.db
                .find_paths(&input.collection, &input.start_id, &spec)
        }
        .map_err(engine_error)?;
        Ok(hits
            .into_iter()
            .map(|hit| GraphHit {
                collection: hit.collection,
                id: hit.id,
                depth: hit.depth,
                cost: spec.weight_field.as_ref().map(|_| hit.cost),
                data: doc_to_json(&hit.doc),
            })
            .collect())
    }

    fn graph_components(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let rows = self
            .db
            .graph_components(collection, &spec)
            .map_err(engine_error)?;
        serde_json::to_value(rows).map_err(ManagerError::from)
    }

    fn graph_communities(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let rows = self
            .db
            .graph_communities(collection, &spec)
            .map_err(engine_error)?;
        serde_json::to_value(rows).map_err(ManagerError::from)
    }

    fn graph_pagerank(
        &self,
        collection: &str,
        seeds: &[(String, String)],
        input: &TraverseSpecInput,
        damping: f64,
        top: usize,
    ) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let rows = self
            .db
            .graph_pagerank(collection, seeds, &spec, damping, top)
            .map_err(engine_error)?;
        serde_json::to_value(rows).map_err(ManagerError::from)
    }

    fn graph_cycle(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let row = self
            .db
            .graph_find_cycle(collection, &spec)
            .map_err(engine_error)?;
        serde_json::to_value(row).map_err(ManagerError::from)
    }

    fn graph_topo(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let row = self
            .db
            .graph_topo_sort(collection, &spec)
            .map_err(engine_error)?;
        serde_json::to_value(row).map_err(ManagerError::from)
    }

    fn graph_degree(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let rows = self
            .db
            .graph_degree_centrality(collection, &spec)
            .map_err(engine_error)?;
        serde_json::to_value(rows).map_err(ManagerError::from)
    }

    fn graph_subgraph(
        &self,
        input: &TraverseSpecInput,
        fields: Option<&[String]>,
    ) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let raw = self
            .db
            .subgraph_json_projected(&input.collection, &input.start_id, &spec, fields)
            .map_err(engine_error)?;
        Ok(parse_json(raw))
    }

    fn graph_export(&self, collection: &str, input: &TraverseSpecInput) -> Result<Value> {
        let spec = traverse_spec(input)?;
        let raw = self
            .db
            .export_graph_json(collection, &spec)
            .map_err(engine_error)?;
        Ok(parse_json(raw))
    }

    fn schema_list(&self) -> Result<Value> {
        serde_json::to_value(self.db.list_schemas()).map_err(ManagerError::from)
    }

    fn schema_set(&self, collection: &str, schema: &Value) -> Result<Value> {
        self.gate.require()?;
        let schema = serde_json::from_value(schema.clone()).map_err(ManagerError::from)?;
        self.db
            .set_schema(collection, schema)
            .map_err(engine_error)?;
        Ok(json!({ "collection": collection, "schema": true }))
    }

    fn schema_clear(&self, collection: &str) -> Result<Value> {
        self.gate.require()?;
        self.db.clear_schema(collection).map_err(engine_error)?;
        Ok(json!({ "collection": collection, "schema": false }))
    }

    fn audit(&self) -> Result<Value> {
        serde_json::to_value(self.db.audit_entries()).map_err(ManagerError::from)
    }

    fn security_set(&self, rules: &Value) -> Result<Value> {
        self.gate.require()?;
        let entries = rules
            .as_array()
            .ok_or_else(|| ManagerError::Validation("rules must be an array".into()))?;
        let mut parsed = Vec::with_capacity(entries.len());
        for entry in entries {
            let prefix = entry
                .get("collectionPrefix")
                .and_then(Value::as_str)
                .ok_or_else(|| ManagerError::Validation("collectionPrefix required".into()))?;
            let op = match entry.get("op").and_then(Value::as_str) {
                Some("get") => AccessOp::Get,
                Some("put") => AccessOp::Put,
                Some("delete") => AccessOp::Delete,
                Some("query") => AccessOp::Query,
                Some("batch") => AccessOp::Batch,
                other => {
                    return Err(ManagerError::Validation(format!(
                        "invalid access op '{:?}'",
                        other
                    )));
                }
            };
            let allow = entry.get("allow").and_then(Value::as_bool).unwrap_or(true);
            parsed.push(SecurityRule {
                collection_prefix: prefix.to_string(),
                op,
                allow,
            });
        }
        let count = parsed.len();
        self.db.set_security_rules(parsed);
        Ok(json!({ "rules": count }))
    }

    fn restore_available(&self, collection: Option<&str>) -> Result<Value> {
        serde_json::to_value(
            self.db
                .restore_available(collection)
                .map_err(engine_error)?,
        )
        .map_err(ManagerError::from)
    }

    fn delete_queue(&self, collection: Option<&str>) -> Result<Value> {
        serde_json::to_value(self.db.delete_queue(collection).map_err(engine_error)?)
            .map_err(ManagerError::from)
    }

    fn restore(&self, collection: &str, id: &str) -> Result<Value> {
        self.gate.require()?;
        self.db.restore(collection, id).map_err(engine_error)?;
        Ok(json!({ "collection": collection, "id": id, "restored": true }))
    }

    fn sweep(&self) -> Result<Value> {
        self.gate.require()?;
        let purged = self.db.sweep_now().map_err(engine_error)?;
        Ok(json!({ "purged": purged }))
    }

    fn inspect_index(&self, collection: &str, field: &str) -> Result<Value> {
        serde_json::to_value(self.db.inspect_index(collection, field)).map_err(ManagerError::from)
    }

    fn storage_keys(&self, collection: &str) -> Result<Value> {
        serde_json::to_value(
            self.db
                .list_storage_keys(collection)
                .map_err(engine_error)?,
        )
        .map_err(ManagerError::from)
    }

    fn snapshot_indexes(&self) -> Result<Value> {
        self.db.export_index_snapshot().map_err(engine_error)?;
        Ok(json!({ "snapshot": true }))
    }

    fn versions(&self) -> Result<Value> {
        serde_json::to_value(self.db.get_version_map()).map_err(ManagerError::from)
    }

    fn sync_start(&self, plane: &str, args: &Value) -> Result<Value> {
        let mut handles = self
            .sync
            .lock()
            .map_err(|_| ManagerError::Generic("sync state lock poisoned".into()))?;
        match plane {
            "net" => {
                let name = arg_str_or(args, "name", &self.db.db_name())?.to_string();
                let key = arg_str(args, "roomKey")?;
                let port = arg_u16(args, "port")?;
                let syncer = NetSyncer::new(self.db.clone(), &name, key, Vec::new());
                if let Some(discovery) = args.get("discovery").and_then(Value::as_str) {
                    syncer.set_discovery(match discovery {
                        "broadcast" => DiscoveryMode::Broadcast,
                        "both" => DiscoveryMode::Both,
                        "off" => DiscoveryMode::Off,
                        _ => DiscoveryMode::Mdns,
                    });
                }
                self.runtime
                    .block_on(syncer.start(port))
                    .map_err(engine_error)?;
                handles.net = Some(Arc::new(syncer));
            }
            "cloud" => {
                let mode = arg_str_or(args, "mode", "client")?;
                let id = arg_str(args, "id")?;
                let room = arg_str(args, "roomName")?;
                let key = arg_str(args, "roomKey")?;
                let token = arg_str(args, "token")?;
                let address = arg_str(args, "address")?;
                let cloud = if mode == "server" {
                    CloudSync::server(self.db.clone(), id, token, room, key)
                } else {
                    CloudSync::client(self.db.clone(), id, room, key, token)
                };
                self.runtime
                    .block_on(cloud.start(address))
                    .map_err(engine_error)?;
                handles.cloud = Some(Arc::new(cloud));
            }
            #[cfg(unix)]
            "socket" => {
                let path = arg_str(args, "path")?;
                let socket = SocketSync::new(self.db.clone(), Vec::new());
                if arg_str_or(args, "mode", "serve")? == "dial" {
                    self.runtime
                        .block_on(socket.dial(path))
                        .map_err(engine_error)?;
                } else {
                    self.runtime
                        .block_on(async { socket.serve(path) })
                        .map_err(engine_error)?;
                }
                handles.socket = Some(Arc::new(socket));
            }
            other => {
                return Err(ManagerError::Validation(format!(
                    "unknown sync plane '{other}'"
                )));
            }
        }
        Ok(json!({ "plane": plane, "started": true }))
    }

    fn sync_stop(&self, plane: &str) -> Result<Value> {
        let mut handles = self
            .sync
            .lock()
            .map_err(|_| ManagerError::Generic("sync state lock poisoned".into()))?;
        match plane {
            "net" => {
                if let Some(handle) = handles.net.take() {
                    handle.stop();
                }
            }
            "cloud" => {
                if let Some(handle) = handles.cloud.take() {
                    handle.stop();
                }
            }
            #[cfg(unix)]
            "socket" => {
                if let Some(handle) = handles.socket.take() {
                    handle.stop();
                }
            }
            other => {
                return Err(ManagerError::Validation(format!(
                    "unknown sync plane '{other}'"
                )));
            }
        }
        Ok(json!({ "plane": plane, "stopped": true }))
    }

    fn sync_status(&self, plane: &str) -> Result<Value> {
        let handles = self
            .sync
            .lock()
            .map_err(|_| ManagerError::Generic("sync state lock poisoned".into()))?;
        match plane {
            "net" => match &handles.net {
                Some(syncer) => Ok(json!({
                    "status": syncer.status(),
                    "dials": syncer.mesh_dial_status(),
                    "discovery": format!("{:?}", syncer.discovery_mode()),
                })),
                None => Ok(json!({ "status": "not-started" })),
            },
            "cloud" => match &handles.cloud {
                Some(syncer) => Ok(json!({
                    "status": syncer.status_redacted(),
                    "peers": syncer.peer_list(),
                    "room_versions": syncer.room_versions(),
                })),
                None => Ok(json!({ "status": "not-started" })),
            },
            #[cfg(unix)]
            "socket" => match &handles.socket {
                Some(syncer) => Ok(json!({ "peers": syncer.peer_count() })),
                None => Ok(json!({ "status": "not-started" })),
            },
            #[cfg(not(unix))]
            "socket" => Ok(json!({ "status": "unsupported", "note": "socket sync is unix-only in hakodb 0.21.0" })),
            other => Err(ManagerError::Validation(format!(
                "unknown sync plane '{other}'"
            ))),
        }
    }

    fn sync_peers(&self, plane: &str) -> Result<Value> {
        let handles = self
            .sync
            .lock()
            .map_err(|_| ManagerError::Generic("sync state lock poisoned".into()))?;
        match plane {
            "net" => match &handles.net {
                Some(syncer) => {
                    serde_json::to_value(syncer.status().known_peers).map_err(ManagerError::from)
                }
                None => Ok(json!([])),
            },
            "cloud" => match &handles.cloud {
                Some(syncer) => {
                    serde_json::to_value(syncer.peer_list()).map_err(ManagerError::from)
                }
                None => Ok(json!([])),
            },
            #[cfg(unix)]
            "socket" => match &handles.socket {
                Some(syncer) => Ok(json!({ "peers": syncer.peer_count() })),
                None => Ok(json!([])),
            },
            #[cfg(not(unix))]
            "socket" => Ok(json!([])),
            other => Err(ManagerError::Validation(format!(
                "unknown sync plane '{other}'"
            ))),
        }
    }
}

fn traverse_spec(input: &TraverseSpecInput) -> Result<TraverseSpec> {
    let spec = TraverseSpec {
        direction: match input.direction {
            0 => TraverseDir::Outgoing,
            1 => TraverseDir::Incoming,
            _ => TraverseDir::Both,
        },
        edge_field: input.edge_field.clone(),
        max_depth: input.max_depth,
        limit: input.limit,
        via_edge: input.via_edge.clone(),
        weight_field: input.weight_field.clone(),
        node_match: None,
        edge_type: None,
        edge_match: None,
        include_path: false,
        include_via: false,
    };
    spec.validate().map_err(engine_error)?;
    Ok(spec)
}

fn parse_json(raw: String) -> Value {
    serde_json::from_str(&raw).unwrap_or(Value::String(raw))
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

fn arg_u16(args: &Value, key: &str) -> Result<u16> {
    args.get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u16::try_from(value).ok())
        .ok_or_else(|| ManagerError::Validation(format!("missing u16 argument '{key}'")))
}
