//! UI-independent core for HakoManager.
//!
//! The frontend never touches the engine directly: it sends a JSON `Request`
//! and receives a JSON `ResponseEnvelope`. The same surface can be exposed by
//! Tauri, an HTTP shell, or tests.

pub mod adapter;
pub mod adapter_v2;
pub mod audit;
pub mod commands;
pub mod dto;
pub mod error;
pub mod state;
pub mod watch;

pub use dto::{ErrorKind, Request, ResponseEnvelope};
pub use error::ManagerError;

pub fn dispatch(request: Request) -> ResponseEnvelope {
    commands::dispatch(request)
}

/// Convenience entry point used by the Tauri command gate.
pub fn dispatch_json(request_json: &str) -> String {
    let response = match serde_json::from_str::<Request>(request_json) {
        Ok(request) => dispatch(request),
        Err(error) => ResponseEnvelope::err(
            ErrorKind::Validation,
            format!("invalid request envelope: {error}"),
        ),
    };
    serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"ok":false,"error":{"kind":"generic","message":"response serialization failed"}}"#
            .to_string()
    })
}
