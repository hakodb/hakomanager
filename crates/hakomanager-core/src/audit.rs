//! Small append-only audit log for manager actions.

use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct AuditRecord {
    pub op: String,
    pub target: String,
    pub ok: bool,
    pub detail: String,
    pub at_ms: u128,
}

pub struct AuditLog {
    path: Option<PathBuf>,
    entries: Mutex<Vec<AuditRecord>>,
}

impl AuditLog {
    pub fn new(path: Option<PathBuf>) -> Self {
        Self {
            path,
            entries: Mutex::new(Vec::new()),
        }
    }

    pub fn record(&self, op: &str, target: &str, ok: bool, detail: &str) {
        let record = AuditRecord {
            op: op.to_string(),
            target: target.to_string(),
            ok,
            detail: detail.to_string(),
            at_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or_default(),
        };

        if let Some(path) = &self.path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                if let Ok(line) = serde_json::to_string(&record) {
                    let _ = writeln!(file, "{line}");
                }
            }
        }

        if let Ok(mut entries) = self.entries.lock() {
            entries.push(record);
        }
    }

    pub fn entries(&self) -> Vec<AuditRecord> {
        self.entries
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default()
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }
}
