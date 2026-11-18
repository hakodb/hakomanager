//! Global manager state: open databases and the audit log.

use crate::adapter_v2::AdvancedAdapter;
use crate::audit::AuditLog;
use crate::dto::DatabaseProfile;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

pub struct OpenDatabase {
    pub profile: DatabaseProfile,
    pub engine: Arc<dyn AdvancedAdapter>,
}

pub struct ManagerState {
    pub databases: HashMap<String, OpenDatabase>,
    pub audit: Arc<AuditLog>,
}

impl ManagerState {
    fn new() -> Self {
        let audit_path = app_dir().map(|dir| dir.join("audit.jsonl"));
        Self {
            databases: HashMap::new(),
            audit: Arc::new(AuditLog::new(audit_path)),
        }
    }
}

fn app_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("HAKOMANAGER_APP_DIR") {
        return Some(PathBuf::from(dir));
    }
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".hakomanager"))
}

static STATE: OnceLock<Mutex<ManagerState>> = OnceLock::new();

pub fn state() -> &'static Mutex<ManagerState> {
    STATE.get_or_init(|| Mutex::new(ManagerState::new()))
}
