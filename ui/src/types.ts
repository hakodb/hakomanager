export type AppTab =
  | 'workspace'
  | 'collections'
  | 'documents'
  | 'query'
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
