//! Tauri 2 desktop shell for HakoManager.
//!
//! The webview never calls dozens of narrow Rust handlers. Instead it sends a
//! JSON request through one gate, [`hako_exec`], which delegates the whole
//! request to `hakomanager_core::dispatch_json`. State changes coming from the
//! core are pushed back to the UI as `hako://change` events by [`watch_bridge`].

use hakomanager_core::dispatch_json;

mod watch_bridge;

/// The single invoke gate between the UI and the core.
///
/// `request_json` is a serialized `hakomanager_core::Request` and the returned
/// string is a serialized `ResponseEnvelope`. Deserialization, dispatch and
/// serialization all live in the core; this crate adds no business logic.
#[tauri::command]
async fn hako_exec(request_json: String) -> Result<String, String> {
    // Long operations (backup, compact, vacuum, index rebuild) must not run
    // on the UI thread: move the whole dispatch to a blocking worker.
    tauri::async_runtime::spawn_blocking(move || dispatch_json(&request_json))
        .await
        .map_err(|error| format!("task join failed: {error}"))
}

/// Build and run the HakoManager desktop application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Forward core notifications to the webview. This spawns a worker
            // thread; it never blocks application setup or an invoke handler.
            watch_bridge::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![hako_exec])
        .run(tauri::generate_context!())
        .expect("error while running HakoManager Tauri application");
}
