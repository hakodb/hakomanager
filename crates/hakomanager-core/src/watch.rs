//! Process-wide watch event bridge.
//!
//! Engine watch streams are consumed by a bridge thread and published here;
//! the Tauri shell listens on `watch_events()` and re-emits them as events.

use crossbeam_channel::{unbounded, Receiver, Sender};
use serde_json::Value;
use std::sync::OnceLock;

type Bus = (Sender<Value>, Receiver<Value>);

static BUS: OnceLock<Bus> = OnceLock::new();

fn bus() -> &'static Bus {
    BUS.get_or_init(unbounded)
}

/// Subscribe to the shared event bus. Receivers are competing consumers; the
/// desktop shell installs a single subscriber.
pub fn watch_events() -> Receiver<Value> {
    bus().1.clone()
}

/// Publish an event produced by a watch bridge.
pub fn publish(event: Value) {
    let _ = bus().0.send(event);
}
