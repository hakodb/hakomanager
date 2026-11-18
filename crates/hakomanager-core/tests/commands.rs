use hakomanager_core::dispatch_json;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn call(request: Value) -> Value {
    let raw = dispatch_json(&request.to_string());
    let response: Value = serde_json::from_str(&raw).unwrap_or_else(|error| {
        panic!("invalid response '{raw}': {error}");
    });
    assert_eq!(response["ok"], true, "request failed: {raw}");
    response["data"].clone()
}

fn temp_path() -> String {
    let sequence = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "hakomanager-test-{}-{sequence}",
        std::process::id()
    ));
    path.to_string_lossy().to_string()
}

fn open(path: &str) -> String {
    let data = call(json!({
        "op": "workspace.open",
        "args": { "path": path, "name": "fixture", "readOnly": false }
    }));
    data["id"].as_str().unwrap().to_string()
}

#[test]
fn document_crud_round_trip() {
    let path = temp_path();
    let id = open(&path);

    call(json!({
        "op": "document.put",
        "args": {
            "profileId": id,
            "collection": "users",
            "id": "alice",
            "data": { "name": "Alice", "age": 30, "active": true }
        }
    }));

    let document = call(json!({
        "op": "document.get",
        "args": { "profileId": id, "collection": "users", "id": "alice" }
    }));
    assert_eq!(document["data"]["name"], "Alice");
    assert_eq!(document["data"]["age"], 30);

    call(json!({
        "op": "document.patch",
        "args": {
            "profileId": id,
            "collection": "users",
            "id": "alice",
            "data": { "age": 31 }
        }
    }));
    let document = call(json!({
        "op": "document.get",
        "args": { "profileId": id, "collection": "users", "id": "alice" }
    }));
    assert_eq!(document["data"]["age"], 31);

    let rows = call(json!({
        "op": "query.run",
        "args": {
            "profileId": id,
            "spec": {
                "collection": "users",
                "filters": [{ "field": "active", "op": "eq", "value": true }]
            }
        }
    }));
    assert_eq!(rows.as_array().unwrap().len(), 1);

    let call_result = call(json!({
        "op": "document.delete",
        "args": { "profileId": id, "collection": "users", "id": "alice" }
    }));
    assert_eq!(call_result["mode"], "soft");

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}

#[test]
fn collection_and_index_commands() {
    let path = temp_path();
    let id = open(&path);

    call(json!({
        "op": "document.put",
        "args": {
            "profileId": id,
            "collection": "products",
            "id": "p1",
            "data": { "name": "Kopi", "price": 12000 }
        }
    }));

    let collections = call(json!({
        "op": "collection.list",
        "args": { "profileId": id }
    }));
    assert!(collections["collections"]
        .as_array()
        .unwrap()
        .contains(&json!("products")));

    let stats = call(json!({
        "op": "collection.stats",
        "args": { "profileId": id, "collection": "products" }
    }));
    assert_eq!(stats["doc_count"], 1);

    call(json!({
        "op": "index.create",
        "args": {
            "profileId": id,
            "kind": "secondary",
            "args": { "collection": "products", "field": "price" }
        }
    }));
    let indexes = call(json!({
        "op": "index.list",
        "args": { "profileId": id, "collection": "products" }
    }));
    assert!(indexes.to_string().contains("price"));

    call(json!({
        "op": "index.drop",
        "args": {
            "profileId": id,
            "kind": "secondary",
            "args": { "collection": "products", "field": "price" }
        }
    }));

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}

#[test]
fn read_only_blocks_writes() {
    let path = temp_path();
    let data = call(json!({
        "op": "workspace.open",
        "args": { "path": path, "name": "readonly", "readOnly": true }
    }));
    let id = data["id"].as_str().unwrap();

    let raw = dispatch_json(
        &json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "users",
                "id": "alice",
                "data": { "name": "Alice" }
            }
        })
        .to_string(),
    );
    let response: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["kind"], "validation");

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}

#[test]
fn binary_value_round_trip() {
    let path = temp_path();
    let id = open(&path);
    let binary = json!({ "__binary__": "AAEC/w==" });

    call(json!({
        "op": "document.put",
        "args": {
            "profileId": id,
            "collection": "blobs",
            "id": "b1",
            "data": { "payload": binary }
        }
    }));

    let document = call(json!({
        "op": "document.get",
        "args": { "profileId": id, "collection": "blobs", "id": "b1" }
    }));
    assert_eq!(document["data"]["payload"]["__binary__"], "AAEC/w==");

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}
