//! Seed a small local database for manual smoke tests.
//!
//! Usage: cargo run -p hakomanager-core --example seed -- /path/to/db

use hakomanager_core::dispatch_json;
use serde_json::{json, Value};

fn call(request: Value) {
    let raw = dispatch_json(&request.to_string());
    let response: Value = serde_json::from_str(&raw).expect("invalid response");
    assert_eq!(response["ok"], true, "request failed: {raw}");
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "./hakomanager-fixture".to_string());

    let raw = dispatch_json(
        &json!({
            "op": "workspace.open",
            "args": { "path": path, "name": "fixture", "readOnly": false }
        })
        .to_string(),
    );
    let response: Value = serde_json::from_str(&raw).expect("invalid open response");
    let id = response["data"]["id"].as_str().expect("missing profile id");

    for index in 0..10 {
        call(json!({
            "op": "document.put",
            "args": {
                "profileId": id,
                "collection": "users",
                "id": format!("user-{index}"),
                "data": {
                    "name": format!("User {index}"),
                    "age": 20 + index,
                    "active": index % 2 == 0
                }
            }
        }));
    }

    call(json!({
        "op": "index.create",
        "args": {
            "profileId": id,
            "kind": "secondary",
            "args": { "collection": "users", "field": "age" }
        }
    }));
    call(json!({ "op": "ops.flush", "args": { "profileId": id } }));
    println!("seeded fixture at {path}");
}
