use hakomanager_core::dispatch_json;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn call(request: Value) -> Value {
    let raw = dispatch_json(&request.to_string());
    let response: Value = serde_json::from_str(&raw).unwrap_or_else(|error| {
        panic!("invalid response '{raw}': {error}");
    });
    assert_eq!(response["ok"], true, "request failed: {raw}");
    response["data"].clone()
}

fn open() -> String {
    let path = std::env::temp_dir().join(format!(
        "hakomanager-v2-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let data = call(json!({
        "op": "workspace.open",
        "args": { "path": path.to_string_lossy(), "name": "v2", "readOnly": false }
    }));
    data["id"].as_str().unwrap().to_string()
}

fn encoding(vector: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
}

fn wait_quiescent(id: &str) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        let status = call(json!({
            "op": "ops.quiescence",
            "args": { "profileId": id }
        }));
        if status["quiescent"] == true {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    panic!("engine did not become quiescent");
}

#[test]
fn vector_search_scored() {
    let id = open();

    call(json!({
        "op": "index.create",
        "args": {
            "profileId": id,
            "kind": "vector",
            "args": { "collection": "items", "field": "embedding", "dim": 3, "metric": "cosine" }
        }
    }));

    for (doc_id, vector) in [
        ("near", vec![1.0_f32, 0.0, 0.0]),
        ("far", vec![0.0, 1.0, 0.0]),
        ("middle", vec![0.8, 0.2, 0.0]),
    ] {
        call(json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "items",
                "id": doc_id,
                "data": { "name": doc_id, "embedding": { "__binary__": encoding(&vector) } }
            }
        }));
    }
    wait_quiescent(&id);

    let info = call(json!({
        "op": "vector.info",
        "args": { "profileId": id, "collection": "items", "field": "embedding" }
    }));
    assert_eq!(info["metric"], "Cosine");

    let hits = call(json!({
        "op": "vector.searchScored",
        "args": {
            "profileId": id,
            "collection": "items",
            "field": "embedding",
            "vector": [1.0, 0.0, 0.0],
            "k": 3
        }
    }));
    let hits = hits.as_array().unwrap();
    assert_eq!(hits.len(), 3);
    assert_eq!(hits[0]["id"], "near");
    assert!(hits[0]["score"].as_f64().unwrap().is_finite());
}

#[test]
fn graph_traverse_and_inspection() {
    let id = open();

    call(json!({
        "op": "index.create",
        "args": {
            "profileId": id,
            "kind": "traverse",
            "args": { "collection": "nodes" }
        }
    }));

    for (doc_id, target) in [("a", "b"), ("b", "c"), ("c", "")] {
        let mut data = json!({ "label": doc_id });
        if !target.is_empty() {
            data["link"] = json!({ "__ref__": format!("nodes/{target}") });
        }
        call(json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "nodes",
                "id": doc_id,
                "data": data
            }
        }));
    }
    wait_quiescent(&id);

    let spec = json!({
        "collection": "nodes",
        "start_id": "a",
        "direction": 0,
        "edge_field": "link",
        "max_depth": 4,
        "limit": 10
    });
    let hits = call(json!({
        "op": "graph.paths",
        "args": { "profileId": id, "spec": spec }
    }));
    let hits = hits.as_array().unwrap();
    assert!(hits.iter().any(|hit| hit["id"] == "b"));

    let components = call(json!({
        "op": "graph.components",
        "args": { "profileId": id, "collection": "nodes", "spec": { "direction": 2, "max_depth": 4, "limit": 10 } }
    }));
    assert!(components.is_array());

    let audit = call(json!({ "op": "ops.audit", "args": { "profileId": id } }));
    assert!(audit.is_array());
    let versions = call(json!({ "op": "ops.versions", "args": { "profileId": id } }));
    assert!(versions.is_object());
    let storage = call(json!({
        "op": "ops.storageKeys",
        "args": { "profileId": id, "collection": "nodes" }
    }));
    assert!(storage.is_array());

    for plane in ["net", "cloud", "socket"] {
        let status = call(json!({
            "op": "sync.status",
            "args": { "profileId": id, "plane": plane }
        }));
        assert_eq!(status["status"], "not-started");
    }
}
