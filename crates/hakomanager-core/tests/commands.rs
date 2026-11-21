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
fn destructive_ops_snapshot_first() {
    let path = temp_path();
    let id = open(&path);

    call(json!({
        "op": "document.put",
        "args": { "profileId": id, "collection": "logs", "id": "1", "data": { "line": "x" } }
    }));

    let result = call(json!({
        "op": "ops.compact",
        "args": { "profileId": id, "collection": "logs" }
    }));
    let backup = result["backup"].as_str().expect("compact must report its pre-backup");
    assert!(std::path::Path::new(backup).exists(), "pre-op backup must exist: {backup}");
    assert!(backup.contains("pre-compact"));

    let raw = dispatch_drop(&id, "logs");
    let response: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(response["ok"], true, "drop failed: {raw}");
    let backup = response["data"]["backup"].as_str().expect("drop must report its pre-backup");
    assert!(std::path::Path::new(backup).exists(), "pre-drop backup must exist: {backup}");
    assert!(backup.contains("pre-drop"));

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}

fn dispatch_drop(profile_id: &str, collection: &str) -> String {
    hakomanager_core::dispatch_json(
        &json!({
            "op": "collection.drop",
            "args": { "profileId": profile_id, "collection": collection }
        })
        .to_string(),
    )
}

#[test]
fn exclusive_open_blocks_second_writer() {
    let path = temp_path();
    let first = open(&path);

    // A second writable open under a DIFFERENT profile id (same dir) must be
    // refused loudly by the engine's exclusive data-dir lock. (Same-id opens
    // dedupe to the existing profile before any engine call.)
    let raw = hakomanager_core::dispatch_json(
        &json!({
            "op": "workspace.open",
            "args": { "path": path, "id": "second-writer", "name": "second", "readOnly": false }
        })
        .to_string(),
    );
    let response: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(response["ok"], false, "second writable open must fail: {raw}");

    // ...and a read-only open falls back to a shared browse-only session.
    let data = call(json!({
        "op": "workspace.open",
        "args": { "path": path, "id": "browser", "name": "browser", "readOnly": true }
    }));
    assert_eq!(data["shared"], true, "shared fallback must be flagged");
    assert_eq!(data["read_only"], true);

    let info = call(json!({
        "op": "workspace.info",
        "args": { "profileId": "browser" }
    }));
    assert_eq!(info["shared"], true);

    // Cleanup the first holder so later tests are unaffected.
    call(json!({ "op": "workspace.close", "args": { "profileId": first } }));
    call(json!({ "op": "workspace.close", "args": { "profileId": "browser" } }));
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
    assert!(collections.as_array().unwrap().iter().any(|entry| entry["name"] == "products"));

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

#[test]
fn console_fluent_query_and_ops() {
    let path = temp_path();
    let id = open(&path);

    call(json!({
        "op": "document.put",
        "args": { "profileId": id, "collection": "products", "id": "p1", "data": { "name": "Kopi", "price": 12000 } }
    }));
    call(json!({
        "op": "document.put",
        "args": { "profileId": id, "collection": "products", "id": "p2", "data": { "name": "Teh", "price": 5000 } }
    }));
    call(json!({
        "op": "document.put",
        "args": { "profileId": id, "collection": "products", "id": "p3", "data": { "name": "Gula", "price": 18000 } }
    }));

    let console = |input: &str| -> Value {
        let raw = dispatch_json(&json!({
            "op": "query.console",
            "args": { "profileId": id, "input": input }
        }).to_string());
        let response: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(response["ok"], true, "console '{input}' failed: {raw}");
        response["data"].clone()
    };

    // Fluent: filter + orderBy + limit + select.
    let rows = console("products.where(price,gte,6000).orderBy(price:desc).limit(2).select(name,price)");
    let list = rows.as_array().expect("rows array");
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["data"]["name"], "Gula");
    assert_eq!(list[0]["data"]["price"], 18000);
    assert!(list[0].get("id").is_some());
    assert_eq!(list[1]["data"]["name"], "Kopi");

    // OR-group: alternatives within ONE or() call (a;b) are OR'd together,
    // then ANDed with the where() filters (engine semantics).
    let count = console("products.or(price,gte,6000;price,lte,5000).count()");
    assert_eq!(count["result"].as_f64(), Some(3.0));

    // Bare ops.
    let collections = console("collections");
    assert!(collections.as_array().unwrap().iter().any(|c| c["name"] == "products"));

    let stats = console("stats products");
    assert_eq!(stats["doc_count"], 3);

    let docs = console("docs products 2");
    assert_eq!(docs.as_array().unwrap().len(), 2);

    let got = console("get products p1");
    assert_eq!(got["data"]["name"], "Kopi");

    let indexes = console("indexes products");
    assert!(indexes.is_array() || indexes.is_object());

    // Quoted value containing a dot survives the chain split.
    let quoted = console(r#"products.where(name,eq,"Teh.Halus")"#);
    assert!(quoted.as_array().unwrap().is_empty());

    // Errors surface as validation failures.
    let bad = dispatch_json(&json!({
        "op": "query.console",
        "args": { "profileId": id, "input": "products.frobnicate(1)" }
    }).to_string());
    let bad: Value = serde_json::from_str(&bad).unwrap();
    assert_eq!(bad["ok"], false, "expected failure: {bad}");

    let bad2 = dispatch_json(&json!({
        "op": "query.console",
        "args": { "profileId": id, "input": "products.where(price,gte,6000" }
    }).to_string());
    let bad2: Value = serde_json::from_str(&bad2).unwrap();
    assert_eq!(bad2["ok"], false, "expected failure: {bad2}");

    call(json!({ "op": "workspace.close", "args": { "profileId": id } }));
}
#[test]
fn query_select_returns_only_projected_fields() {
    let path = temp_path();
    let id = open(&path);
    for (doc_id, name) in [("u1", "alice"), ("u2", "bob")] {
        call(json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "users",
                "id": doc_id,
                "data": { "name": name, "age": 30, "secret": "hidden" }
            }
        }));
    }

    let result = call(json!({
        "op": "query.run",
        "args": {
            "profileId": id,
            "spec": {
                "collection": "users",
                "filters": [],
                "order_by": [],
                "select": ["name"],
                "limit": 10
            }
        }
    }));
    let rows = result.as_array().expect("query rows");
    assert_eq!(rows.len(), 2);
    for row in rows {
        let data = row["data"].as_object().unwrap();
        let name = data.get("name").and_then(Value::as_str).unwrap();
        assert!(name == "alice" || name == "bob", "unexpected name: {name}");
        assert!(!data.contains_key("age"), "select must drop non-selected fields: {row}");
        assert!(!data.contains_key("secret"), "select must drop non-selected fields: {row}");
    }
}

#[test]
fn query_select_keeps_order_by_outside_projection() {
    let path = temp_path();
    let id = open(&path);
    for (doc_id, name, age) in [("u1", "alice", 30), ("u2", "bob", 40)] {
        call(json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "users",
                "id": doc_id,
                "data": { "name": name, "age": age, "secret": "hidden" }
            }
        }));
    }

    // `age` drives the sort but is NOT selected. The native query path keeps
    // ranking on the full document and only prunes the returned fields;
    // the old query_projected_zero_copy workaround sorted on projected
    // fields and got this wrong.
    let rows = call(json!({
        "op": "query.run",
        "args": {
            "profileId": id,
            "spec": {
                "collection": "users",
                "filters": [],
                "order_by": [{ "field": "age", "ascending": false }],
                "select": ["name"],
                "limit": 10
            }
        }
    }));
    let rows = rows.as_array().expect("query rows");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["id"], "u2", "older document must rank first");
    assert_eq!(rows[0]["data"]["name"], "bob");
    for row in rows {
        let data = row["data"].as_object().unwrap();
        assert!(!data.contains_key("age"), "order field must be pruned: {row}");
        assert!(!data.contains_key("secret"), "select must drop non-selected fields: {row}");
    }
}