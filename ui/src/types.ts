export type AppTab =
  | 'workspace'
  | 'collections'
  | 'documents'
  | 'query'
  | 'console'
  | 'indexes'
  | 'vector'
  | 'graph'
  | 'ops'
  | 'sync'
  | 'watch'
  | 'settings';

export interface Request {
  op: string;
  args: unknown;
}

export interface ConsoleRow {
  command: string;
  result: unknown;
  error: string | null;
  at: string;
}

export interface PersistedSession {
  activeTab: AppTab;
  activeProfileId: string | null;
  activeCollection: string | null;
  databases: Array<{
    path: string;
    name: string;
    readOnly: boolean;
    encrypted: boolean;
  }>;
}

const SESSION_KEY = 'hakomanager.session.v1';
const CONSOLE_INPUT_KEY = 'hakomanager.console.input';
const CONSOLE_ROWS_KEY = 'hakomanager.console.rows';
const MAX_CONSOLE_ROWS = 12;

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      activeTab: parsed.activeTab ?? 'workspace',
      activeProfileId: parsed.activeProfileId ?? null,
      activeCollection: parsed.activeCollection ?? null,
      databases: Array.isArray(parsed.databases) ? parsed.databases : [],
    };
  } catch {
    return null;
  }
}

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Quota / privacy mode: session stays in-memory for this run.
  }
}

export function loadConsoleState(): { input: string; rows: ConsoleRow[] } {
  try {
    const input = localStorage.getItem(CONSOLE_INPUT_KEY) ?? '';
    const raw = localStorage.getItem(CONSOLE_ROWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const rows: ConsoleRow[] = Array.isArray(parsed)
      ? parsed.filter(
          (row): row is ConsoleRow =>
            typeof row === 'object' && row !== null && typeof row.command === 'string',
        )
      : [];
    return { input, rows: rows.slice(0, MAX_CONSOLE_ROWS) };
  } catch {
    return { input: '', rows: [] };
  }
}

export function saveConsoleState(input: string, rows: ConsoleRow[]): void {
  const trimmed = rows.slice(0, MAX_CONSOLE_ROWS);
  try {
    localStorage.setItem(CONSOLE_INPUT_KEY, input);
    // Cap payload: huge result sets must not blow the localStorage quota.
    let payload = JSON.stringify(trimmed);
    while (payload.length > 500_000 && trimmed.length > 1) {
      trimmed.pop();
      payload = JSON.stringify(trimmed);
    }
    localStorage.setItem(CONSOLE_ROWS_KEY, payload);
  } catch {
    // Ignore: console history is best-effort.
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ResponseError {
  kind: string;
  message: string;
}

export interface ResponseEnvelope {
  ok: boolean;
  data?: unknown;
  error?: ResponseError;
}

export interface DatabaseProfile {
  id: string;
  name: string;
  path: string;
  read_only: boolean;
  durability: string;
  /** Directory held by another HakoDB instance; browse-only fallback. */
  shared?: boolean;
  /** A session encryption key was supplied at open time (never stored). */
  encryption_configured?: boolean;
}

export interface CollectionInfo {
  name: string;
  doc_count: number;
  live_bytes: number;
  total_bytes: number;
  segment_count: number;
  wal_bytes: number;
  blob_bytes: number;
  tombstone_count: number;
  unloaded: boolean;
}

export interface DocumentView {
  collection: string;
  id: string;
  data: unknown;
}

export function isResponseEnvelope(value: unknown): value is ResponseEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ok === 'boolean';
}

export function isDatabaseProfile(value: unknown): value is DatabaseProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.read_only === 'boolean' &&
    typeof candidate.durability === 'string'
  );
}

export function isCollectionInfo(value: unknown): value is CollectionInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.doc_count === 'number' &&
    typeof candidate.live_bytes === 'number' &&
    typeof candidate.total_bytes === 'number' &&
    typeof candidate.segment_count === 'number' &&
    typeof candidate.wal_bytes === 'number' &&
    typeof candidate.blob_bytes === 'number' &&
    typeof candidate.tombstone_count === 'number' &&
    typeof candidate.unloaded === 'boolean'
  );
}

export function isDocumentView(value: unknown): value is DocumentView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.collection === 'string' &&
    typeof candidate.id === 'string' &&
    'data' in candidate
  );
}
