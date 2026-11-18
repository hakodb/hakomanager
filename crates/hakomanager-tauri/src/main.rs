//! HakoManager desktop entry point.
// Hide the extra Windows console window: the Tauri app is a GUI binary;
// without this attribute Windows also allocates a console (closing it
// killed the app in the field).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hakomanager_tauri::run();
}
