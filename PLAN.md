# HakoManager — Development Plan

Status: approved for implementation. Language: **English everywhere** (code, identifiers,
comments, docs, UI strings). Chat may remain multilingual.

Progress (2026-11-18): M0-M6 are implemented. The core passes 6 integration
tests (including vector KNN, graph traversal and ops/sync inspection) and clippy
with zero warnings; the React UI passes strict typecheck and production build
with all ten tabs. The Tauri shell is scaffolded; desktop testing is deferred to
a Windows machine because this Linux host lacks the WebKitGTK development
packages.

## Decisions (locked)

| Item | Decision |
| --- | --- |
| Target | Local embedded HakoDB database directories (DBeaver / SQLite-Browser analogue) |
| Engine version | **hakodb 0.21.0** (crates.io, newest; tag `445495d`, verified 2026-11-17) |
| UI shell | **Tauri 2** desktop app |
| Frontend | **React + TypeScript + Vite** |
| Architecture | Core-first, UI-pluggable: `hakomanager-core` is UI-independent and reused by Tauri (and later an Axum web shell) |
| Visual style | **Flat, no rounded corners, professional office-like desktop app** |
| v0.1 MVP | Browse + CRUD + Query + Index |
| v0.2 | Vector playground, graph explorer, ops/maintenance, sync monitor, live watch |

## Why a separate manager

Existing org tooling does not cover this gap:

- `hakocli` — one-shot CLI + REPL; powerful for scripts, not visual.
- `hakocloudserver` — web admin console, but **cloud hub rooms only**, not local embedded files.
- `hakomcp`, `hakobackend`, `hakotauri` — agent/gateway data planes, not a database manager.

HakoManager manages **local embedded DB files** with full engine access. We depend on the
Rust crate directly (not the C ABI): management APIs such as `drop_collection`,
`rename_collection`, `collection_stats`, schema, security rules and audit are Rust-only.

## Project layout

```
/home/riza/hakomanager/
├─ Cargo.toml                    # workspace
├─ crates/
│  ├─ hakomanager-core/          # no UI dependencies
│  │  ├─ src/adapter.rs          # EngineAdapter trait + LocalHakoAdapter (Hako 0.21)
│  │  ├─ src/workspace.rs        # DB profiles, lifecycle, lock, read-only
│  │  ├─ src/commands/           # collection, document, query, index, ops (stubs for v0.2)
│  │  ├─ src/dto.rs              # serde JSON DTOs + request/response envelope
│  │  ├─ src/error.rs            # HakoError -> {none|conflict|unique|generic}
│  │  └─ src/audit.rs
│  ├─ hakomanager-tauri/         # Tauri 2 shell
│  │  ├─ src/lib.rs              # single gate: hako_exec(req_json) -> res_json
│  │  ├─ src/watch_bridge.rs     # Receiver -> app.emit("hako://change", ...)
│  │  └─ tauri.conf.json, capabilities/
│  └─ hakomanager-web/           # optional, later: Axum 127.0.0.1 + SPA, reuses core
├─ ui/                           # React 18 + TypeScript + Vite
│  ├─ src/api/                   # typed client for hako_exec
│  ├─ src/pages/                 # workspace, collections, documents, query, indexes
│  └─ src/components/            # flat design system (square corners)
├─ PLAN.md                       # copy of this plan for contributors
└─ README.md
```

## Engine contract (v0.21.0)

- `hakodb = "0.21"` with default features (sync planes + compression) so status surfaces work.
- Lock precise version in `Cargo.lock`; a v0.21.x patch bump is allowed, minor bump is not.
- The v0.19.6 API map must be re-validated against the v0.21.0 checkout before command
  signatures are frozen (soft-delete/restore/sweep and maintenance changes are expected).
- No C ABI in the manager path; generated `hakodb.h` is not part of the design.

## Command envelope

```
request:  { "op": "collection.list", "args": { ... } }
response: { "ok": true, "data": { ... } }
          { "ok": false, "error": { "kind": "unique|conflict|generic", "message": "..." } }
```

One Tauri `invoke` gate (`hako_exec`) instead of dozens of handlers; the same envelope is
reusable by the future Axum shell. Error kinds mirror `hk_error_last_kind` semantics so the UI
can distinguish retryable conflicts from permanent failures.

## Safety rules

- Read-only by default when opening a DB; explicit "Enable writes" toggle.
- One handle per DB path: lock file, detect a DB already open in another process (embedded = single writer).
- Encryption keys are never persisted: prompt per session / OS keyring / environment only.
- Destructive operations (drop, mass delete, compact, vacuum) require confirmation and offer
  an automatic backup first.
- Room keys, auth tokens and secrets are always redacted in status output.
- Binary values are edited as Base64 with byte-length metadata; all writes go through the engine
  so WAL/sync semantics are preserved.
- `watch_collection` is bridged to Tauri events, never called as a blocking invoke.

## UI style contract (flat, office-like)

- No rounded corners anywhere: `border-radius: 0` globally. No shadows, gradients, glassmorphism.
- Dense, information-first layout: left DB/collection tree, main work area, right inspector.
- Neutral palette (white / light gray / slate), one restrained accent color, hairline 1px borders.
- Toolbars with compact icon+text buttons, tabular data grids, monospace JSON/vector areas.
- Explicit focus and hover states, keyboard navigation, no decorative animation.

## Milestones

| M | Scope | Exit gate |
| --- | --- | --- |
| M0 | Plan + API re-validation against 0.21.0 + DTO/envelope + fixture DB | `cargo test -p hakomanager-core` green |
| M1 | `LocalHakoAdapter`, workspace, lock, read-only, baseline reads (`collections`, `stats`, `quiescence`, `backup`, `flush`) | core reads a fixture DB |
| M2 | Tauri shell + flat design system + collection browser + document CRUD/import-export | doc edited from UI persists on disk |
| M3 | Query workbench + aggregates + cursor paging + EXPLAIN panel | query + plan rendered in UI |
| M4 | Index manager (secondary/composite/FTS/vector/traverse/edge) + packaging | **v0.1 release** |
| M5 | Vector KNN + graph explorer | v0.2 |
| M6 | Ops dashboard + maintenance + sync monitor + watch | v0.2 |
| M7 | Web shell (Axum + React build served from core), release CI | optional |

## Parallel execution strategy

Independent files are built concurrently, shared foundations first:

1. Foundation (serial): workspace `Cargo.toml`, `hakomanager-core` types (`dto`, `error`, `audit`), Tauri config, Vite config, global flat CSS.
2. Parallel wave A: `adapter.rs + workspace.rs` (Rust), `commands/collection.rs + document.rs` (Rust), `commands/query.rs` (Rust), `commands/index.rs` (Rust), `ui/src/api + src/components` (TS).
3. Parallel wave B: Tauri shell + watch bridge (Rust), React pages (TS), tests/fixtures (Rust + shell script).
4. Integration (serial): wire commands into `hako_exec`, run `cargo test` + `cargo clippy --all-targets` (zero warnings), `npm run build`, smoke-test the app against a fixture DB.

## Verification

- `cargo test --workspace` (unit + command tests against a temporary fixture DB).
- `cargo clippy --all-targets -- -D warnings` (zero warnings before release).
- `npm run typecheck && npm run build` in `ui/`.
- Manual smoke: create DB -> put/get/patch/delete doc -> query with filter -> create/drop index -> reopen DB, data intact.
