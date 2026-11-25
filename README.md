# HakoManager

Desktop database manager for local [HakoDB](https://github.com/hakodb/hakodb) embedded
database directories. Built with a UI-independent Rust core, a Tauri 2 shell and a
React + TypeScript frontend.

## Status

v0.1 MVP (browse, CRUD, query, indexes) and v0.2 (vector playground, graph
explorer, operations dashboard, sync monitor, live watch) are implemented.
The Tauri shell is scaffolded but desktop testing is deferred to a Windows
machine. See [`PLAN.md`](PLAN.md) for scope and milestones.

## Decisions

- Engine: `hakodb 0.21.0` (Rust crate, used directly; no C ABI in the manager path).
- Target: local embedded database files, not the cloud hub.
- UI: Tauri 2 desktop, React + TypeScript + Vite.
- Style: flat, square corners, professional office-like desktop application.
- All project text is English.

## Layout

```
crates/hakomanager-core   command dispatch, DTOs, engine adapter, watch bridge
crates/hakomanager-tauri  Tauri 2 shell (one hako_exec command gate)
ui/                       React + TypeScript + Vite frontend
```

## Install & updates

Each release ships a Windows `*-setup.exe` (NSIS) and `.msi`, a Linux `.deb` and
`.AppImage`, plus flat zip/tar.gz binaries. Installers carry updater signatures;
the app checks `latest.json` at startup (toggle in Settings) and, with your
approval, downloads and runs a passive setup update, then restarts. Releases
are at <https://github.com/hakodb/hakomanager/releases>.

## Prerequisites

- Rust toolchain with `clippy` and `rustfmt` components.
- **Node.js >= 18** for the frontend (the host used for initial development has
  Node 10, so `bun` was used as the Node shim: create `node -> bun` on `PATH`).
- Linux only: `glib-2.0`, `webkit2gtk-4.1` and `libsoup-3.0` development packages
  are required to compile the Tauri shell. The core crate has no such requirement.

## Build

```sh
# Core (no desktop system libraries required)
cargo test -p hakomanager-core
cargo clippy -p hakomanager-core --all-targets -- -D warnings

# Frontend
cd ui && npm install && npm run typecheck && npm run build
# With the Node->Bun shim on this host:
# PATH=/tmp/opencode/nodebin:$PATH bunx tsc --noEmit && bunx vite build

# Desktop shell (Linux requires webkit2gtk-4.1 and libsoup-3.0 development packages)
cargo tauri dev
```

## Architecture

The frontend sends JSON envelopes through a single Tauri command:

```
{ "op": "collection.list", "args": { "profileId": "..." } }
```

The core answers with:

```
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "kind": "unique|conflict|validation|generic", "message": "..." } }
```

Because the core is UI-independent, an HTTP shell can reuse the same command surface later.

## License

MIT — see [`LICENSE`](LICENSE). This matches the `hakodb` engine license.

## Safety

- Databases open read-only by default; writes require an explicit toggle.
- One open handle per database directory (embedded engines assume a single writer).
- Encryption keys are never persisted by the manager.
- Destructive operations require confirmation and can create a backup first.
- Watch streams are bridged to Tauri events, never exposed as blocking commands.
- Sync credentials are passed per `sync.start` call only; the manager never
  persists room keys or auth tokens. `sync.status` uses the redacted cloud status.

## API guidance: query and write paths

Consumers should not have to guess which execution or write entry point to use. The core exposes one canonical executor plus advisory-deprecated wrappers and several materialization lanes with different costs.

### Execution lanes

| Lane | Returns | Use when |
|---|---|---|
| canonical executor (`hk_query_execute_ex` / SDK default) | JSON documents for an application | ordinary API calls |
| JSON egress (`hk_query_execute_json`) | JSON from pinned bytes, no owned document | wire/egress output |
| handles (`hk_query_execute_to_handles`) | borrowed document handles | engine throughput, caller reads selected fields |
| raw (`hk_query_execute_raw`) | pinned storage bytes | index-satisfied scans, zero decode |
| aggregation / explain | aggregate values or plan report | tuning and aggregate-only queries |

Do not compare a JSON-document lane with an engine-only lane and call it the same benchmark. Mark lanes without an equivalent in another engine as not applicable.

### In this repository

- query/aggregate entry points used by the UI
- durability and maintenance configuration
- batch write and index readiness

### Further reading

- Core decision table: https://github.com/hakodb/hakodb/blob/main/docs/ffi-query-lanes.md
- Manual C ABI chapter: https://hakodb.github.io/manual/sdk-c-abi.html
