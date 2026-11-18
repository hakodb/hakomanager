//! Core watch -> Tauri event bridge.
//!
//! Watching must **never** be exposed as a blocking `invoke`/`#[tauri::command]`.
//! A command that waits on the core's watch receiver would occupy the command
//! runtime (and, for a synchronous command, the main thread), so the UI would
//! freeze while waiting for a change that may never arrive. Instead we
//! subscribe once on a dedicated background thread and push each update to the
//! webview with `emit`, which the frontend listens for via
//! `listen("hako://change", ...)`.

use tauri::Emitter;

/// Subscribe to the core watch broadcaster and forward every payload to the
/// webview as a `hako://change` event.
///
/// The subscription lives on its own OS thread for the lifetime of the app.
/// Errors are reported on stderr; they never propagate into an invoke result.
pub fn spawn(app: tauri::AppHandle) {
    let result = std::thread::Builder::new()
        .name("hako-watch-bridge".to_string())
        .spawn(move || {
            let receiver = hakomanager_core::watch::watch_events();
            forward_events(app, receiver);
        });
    if let Err(err) = result {
        eprintln!("[hako-watch] failed to spawn watch bridge thread: {err}");
    }
}

fn forward_events(app: tauri::AppHandle, receiver: crossbeam_channel::Receiver<serde_json::Value>) {
    for payload in receiver {
        if let Err(err) = app.emit("hako://change", payload.to_string()) {
            eprintln!("[hako-watch] failed to emit hako://change: {err}");
        }
    }
    eprintln!("[hako-watch] core watch channel closed; bridge stopping");
}
