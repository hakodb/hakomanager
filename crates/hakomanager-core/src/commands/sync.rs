use super::{arg_str, engine};
use crate::error::Result;
use crate::state::ManagerState;
use serde_json::Value;

pub fn start(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.sync_start(arg_str(args, "plane")?, args)
}

pub fn stop(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.sync_stop(arg_str(args, "plane")?)
}

pub fn status(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.sync_status(arg_str(args, "plane")?)
}

pub fn peers(args: &Value, state: &ManagerState) -> Result<Value> {
    engine(args, state)?.sync_peers(arg_str(args, "plane")?)
}
