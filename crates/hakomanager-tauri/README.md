# HakoManager Tauri shell

Tauri 2 desktop host for HakoManager. It owns the native window and acts as a
thin bridge; all domain logic lives in `hakomanager-core`.

## Architecture

- **One command gate.** The frontend calls `invoke("hako_exec", { requestJson })`
  with a serialized core `Request`. The Rust command `hako_exec` forwards the
  string to `hakomanager_core::dispatch_json` and returns the serialized
  `ResponseEnvelope`. No per-feature handlers are added here.
- **Push-based watching.** Core notifications are received on a background
  thread (`src/watch_bridge.rs`) and emitted to the webview as the
  `hako://change` event. Watching is deliberately not a blocking invoke: a
  command that waited on the watch receiver would stall the app.
- **Plugins.** `tauri-plugin-dialog` provides native open/save dialogs and
  `tauri-plugin-fs` provides sandboxed file access. Both are granted in
  `capabilities/default.json` and scoped to `$HOME/**`.

## Development

Run from the workspace root via the Tauri CLI (e.g. `npm run tauri -- dev` in
`ui/`), or build this crate directly with Cargo. `tauri.conf.json` starts the
Vite dev server on `http://localhost:1420` and loads `../ui/dist` for release
builds.

### Linux prerequisites

Building on Linux requires the WebKitGTK and Soup development packages:

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev libgtk-3-dev librsvg2-dev
```

Without them, `cargo build` fails while compiling `webkit2gtk-sys` /
`soup3-sys`, even for a check-only build.

## UI design

The HakoManager UI is a **flat office-style design**: restrained neutral
surfaces, compact toolbars/tables, clear typography and no skeuomorphic
shadows or gradients. Visual work belongs in `ui/`; this crate only supplies
the native shell.
