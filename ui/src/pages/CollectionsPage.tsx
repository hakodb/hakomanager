import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { errorMessage, type AppTab, type CollectionInfo } from '../types';

interface CollectionStatsView {
  doc_count?: number;
  live_bytes?: number;
  total_bytes?: number;
  wal_bytes?: number;
  blob_bytes?: number;
  tombstone_count?: number;
  segment_count?: number;
  unloaded?: boolean;
}

interface CollectionsPageProps {
  profileId: string | null;
  collections: CollectionInfo[];
  activeCollection: string | null;
  onSelectCollection: (name: string | null) => void;
  onNavigate: (tab: AppTab) => void;
  refreshCollections: () => Promise<CollectionInfo[]>;
  onStatus: (message: string) => void;
}

const columns: DataGridColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'doc_count', label: 'Documents' },
  { key: 'live_bytes', label: 'Live bytes' },
  { key: 'total_bytes', label: 'Total bytes' },
  { key: 'segment_count', label: 'Segments' },
  { key: 'wal_bytes', label: 'WAL bytes' },
  { key: 'blob_bytes', label: 'Blob bytes' },
  { key: 'tombstone_count', label: 'Tombstones' },
  { key: 'unloaded', label: 'Unloaded' },
];

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function normalizeStats(raw: unknown): CollectionStatsView {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const outer = raw as Record<string, unknown>;
  const source =
    typeof outer.stats === 'object' && outer.stats !== null
      ? (outer.stats as Record<string, unknown>)
      : outer;
  return {
    doc_count: numberField(source, 'doc_count'),
    live_bytes: numberField(source, 'live_bytes'),
    total_bytes: numberField(source, 'total_bytes'),
    wal_bytes: numberField(source, 'wal_bytes'),
    blob_bytes: numberField(source, 'blob_bytes'),
    tombstone_count: numberField(source, 'tombstone_count'),
    segment_count: numberField(source, 'segment_count'),
    unloaded: typeof source.unloaded === 'boolean' ? source.unloaded : undefined,
  };
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function CollectionsPage({
  profileId,
  collections,
  activeCollection,
  onSelectCollection,
  onNavigate,
  refreshCollections,
  onStatus,
}: CollectionsPageProps) {
  const [stats, setStats] = useState<CollectionStatsView | null>(null);
  const [error, setError] = useState('');

  const selected = activeCollection ?? collections[0]?.name ?? null;

  useEffect(() => {
    if (!activeCollection && collections.length > 0) {
      onSelectCollection(collections[0].name);
    }
  }, [activeCollection, collections, onSelectCollection]);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError('');
    if (profileId && selected) {
      invoke<unknown>('collection.stats', { profileId, collection: selected })
        .then((raw) => {
          if (!cancelled) {
            setStats(normalizeStats(raw));
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setError(errorMessage(caught));
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [profileId, selected]);

  const rows: Record<string, unknown>[] = collections.map((collection) => ({
    name: collection.name,
    doc_count: collection.doc_count,
    live_bytes: formatBytes(collection.live_bytes),
    total_bytes: formatBytes(collection.total_bytes),
    segment_count: collection.segment_count,
    wal_bytes: formatBytes(collection.wal_bytes),
    blob_bytes: formatBytes(collection.blob_bytes),
    tombstone_count: collection.tombstone_count,
    unloaded: collection.unloaded ? 'yes' : 'no',
  }));

  async function handleRefresh() {
    setError('');
    try {
      await refreshCollections();
      onStatus('Collection list refreshed.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleDrop() {
    if (!profileId || !selected) {
      return;
    }
    if (!window.confirm(`Drop collection "${selected}"? This cannot be undone.`)) {
      return;
    }
    setError('');
    try {
      await invoke('collection.drop', { profileId, collection: selected });
      const remaining = await refreshCollections();
      onSelectCollection(remaining.length > 0 ? remaining[0].name : null);
      onStatus(`Dropped collection ${selected}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleRename() {
    if (!profileId || !selected) {
      return;
    }
    const answer = window.prompt('New collection name:', selected);
    const to = answer?.trim() ?? '';
    if (!to || to === selected) {
      return;
    }
    setError('');
    try {
      await invoke('collection.rename', { profileId, from: selected, to });
      await refreshCollections();
      onSelectCollection(to);
      onStatus(`Renamed collection ${selected} to ${to}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function navigateTo(tab: AppTab) {
    if (selected) {
      onSelectCollection(selected);
    }
    onNavigate(tab);
  }

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Collections</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={!profileId} onClick={() => void handleRefresh()}>
            Refresh
          </button>
          <button type="button" className="button" disabled={!profileId || !selected} onClick={() => void handleDrop()}>
            Drop collection
          </button>
          <button type="button" className="button" disabled={!profileId || !selected} onClick={() => void handleRename()}>
            Rename collection
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {!profileId && <div className="inline-note">Open a database on the Workspace tab to list collections.</div>}
        <div className="grid-scroll">
          <DataGrid
            columns={columns}
            rows={rows}
            onRowClick={(row) => onSelectCollection(String(row.name))}
          />
        </div>
      </section>

      <section className="page-section">
        <div className="field-row">
          <button type="button" className="button" disabled={!profileId || !selected} onClick={() => navigateTo('documents')}>
            Documents
          </button>
          <button type="button" className="button" disabled={!profileId || !selected} onClick={() => navigateTo('query')}>
            Query
          </button>
          <button type="button" className="button" disabled={!profileId || !selected} onClick={() => navigateTo('indexes')}>
            Indexes
          </button>
        </div>

        <div className="panel">
          <div className="panel-header">Statistics: {selected ?? 'none'}</div>
          <div className="panel-body">
            <table className="kv-table">
              <tbody>
                <tr>
                  <td>Documents</td>
                  <td>{stats?.doc_count ?? '-'}</td>
                </tr>
                <tr>
                  <td>Live bytes</td>
                  <td>{formatBytes(stats?.live_bytes)}</td>
                </tr>
                <tr>
                  <td>Total bytes</td>
                  <td>{formatBytes(stats?.total_bytes)}</td>
                </tr>
                <tr>
                  <td>WAL bytes</td>
                  <td>{formatBytes(stats?.wal_bytes)}</td>
                </tr>
                <tr>
                  <td>Blob bytes</td>
                  <td>{formatBytes(stats?.blob_bytes)}</td>
                </tr>
                <tr>
                  <td>Tombstones</td>
                  <td>{stats?.tombstone_count ?? '-'}</td>
                </tr>
                <tr>
                  <td>Segments</td>
                  <td>{stats?.segment_count ?? '-'}</td>
                </tr>
                <tr>
                  <td>Unloaded</td>
                  <td>{stats?.unloaded === undefined ? '-' : stats.unloaded ? 'yes' : 'no'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
