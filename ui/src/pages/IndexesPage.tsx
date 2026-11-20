import { useEffect, useMemo, useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar, Glyph, Segmented } from '../components/ActionBar';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { errorMessage, type CollectionInfo } from '../types';

interface IndexesPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

type IndexKind = 'secondary' | 'fts' | 'vector' | 'composite' | 'traverse' | 'edge';
const INDEX_KINDS: IndexKind[] = ['secondary', 'fts', 'vector', 'composite', 'traverse', 'edge'];

interface IndexRow {
  id: string;
  collection: string;
  kind: string;
  field: string;
  detail: string;
}

const columns: DataGridColumn[] = [
  { key: 'collection', label: 'Collection' },
  { key: 'kind', label: 'Type' },
  { key: 'field', label: 'Field' },
  { key: 'detail', label: 'Details' },
];

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** index.list is nested JSON; flatten it into readable table rows. */
function flattenIndexes(raw: unknown): IndexRow[] {
  const rows: IndexRow[] = [];
  let ordinal = 0;
  const walk = (value: unknown, collection: string, kind: string) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => walk(entry, collection, kind));
      return;
    }
    if (typeof value !== 'object' || value === null) {
      rows.push({ id: `row-${++ordinal}`, collection, kind, field: '', detail: String(value) });
      return;
    }
    const source = value as Record<string, unknown>;
    const nextCollection = typeof source.collection === 'string' ? source.collection : collection;
    const nextKind =
      typeof source.kind === 'string'
        ? source.kind
        : typeof source.type === 'string'
          ? source.type
          : kind;
    const field =
      typeof source.field === 'string'
        ? source.field
        : typeof source.name === 'string'
          ? source.name
          : '';
    const id =
      typeof source.id === 'string'
        ? source.id
        : typeof source.index_id === 'string'
          ? source.index_id
          : `row-${++ordinal}`;
    const detail = ['fields', 'dim', 'metric', 'unique', 'sparse', 'status']
      .filter((key) => key in source)
      .map((key) => `${key}: ${serialize(source[key])}`)
      .join(' · ');
    const nested = Object.entries(source).filter(
      ([key, entry]) =>
        !['collection', 'kind', 'type', 'field', 'name', 'id', 'index_id'].includes(key) &&
        (Array.isArray(entry) || (typeof entry === 'object' && entry !== null)),
    );
    if (nested.length === 0 || (field && detail)) {
      rows.push({ id, collection: nextCollection, kind: nextKind, field, detail });
    } else {
      nested.forEach(([key, entry]) => walk(entry, nextCollection, key));
    }
  };
  walk(raw, '', '');
  return rows;
}

function parseFields(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fall through to comma-separated form
  }
  return text.split(',').map((part) => part.trim()).filter(Boolean);
}

export function IndexesPage({ profileId, collection, collections, onStatus }: IndexesPageProps) {
  const [raw, setRaw] = useState<unknown>(null);
  const [kind, setKind] = useState<IndexKind>('secondary');
  const [targetCollection, setTargetCollection] = useState(collection ?? '');
  const [field, setField] = useState('');
  const [dim, setDim] = useState('384');
  const [metric, setMetric] = useState('Cosine');
  const [composite, setComposite] = useState('field1, field2');
  const [selected, setSelected] = useState<IndexRow | null>(null);
  const [error, setError] = useState('');

  const rows = useMemo(() => flattenIndexes(raw), [raw]);

  useEffect(() => {
    if (collection) setTargetCollection(collection);
  }, [collection]);

  async function refresh() {
    if (!profileId) {
      setRaw(null);
      return;
    }
    setError('');
    try {
      setRaw(await invoke<unknown>('index.list', { profileId }));
      onStatus('Index list refreshed.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function createIndex() {
    if (!profileId) {
      setError('Open a database first.');
      return;
    }
    const name = targetCollection.trim();
    if (!name) {
      setError('Enter a collection.');
      return;
    }
    const args: Record<string, unknown> = { collection: name };
    if (field.trim()) args.field = field.trim();
    if (kind === 'vector') {
      args.dim = Number(dim);
      args.metric = metric.trim();
    }
    if (kind === 'composite') args.fields = parseFields(composite);
    setError('');
    try {
      await invoke('index.create', { profileId, kind, args });
      onStatus(`Created ${kind} index on ${name}.`);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function dropSelected() {
    if (!profileId || !selected) return;
    const args: Record<string, unknown> = { collection: selected.collection };
    if (selected.field) args.field = selected.field;
    if (!selected.id.startsWith('row-')) args.id = selected.id;
    setError('');
    try {
      await invoke('index.drop', { profileId, kind: selected.kind || kind, args });
      onStatus(`Dropped index ${selected.id}.`);
      setSelected(null);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div>
      <section className="page-section">
        <ActionBar
          label="Indexes"
          items={[
            { id: 'refresh', label: 'Refresh', icon: <Glyph name="refresh" />, onClick: () => void refresh(), disabled: !profileId },
            { id: 'create', label: 'Create', icon: <Glyph name="plus" />, onClick: () => void createIndex(), disabled: !profileId, primary: true },
            { id: 'drop', label: 'Drop selected', icon: <Glyph name="trash" />, onClick: () => void dropSelected(), disabled: !profileId || !selected },
          ]}
        />
        {error && <div className="inline-error">{error}</div>}
        {!profileId && <div className="inline-note">Open a database first.</div>}
        <div className="panel">
          <div className="panel-header">Index list ({rows.length})</div>
          <div className="panel-body">
            <div className="grid-scroll">
              <DataGrid
                columns={columns}
                rows={rows.map((row) => ({ ...row }))}
                onRowClick={(row) => {
                  setSelected(
                    rows.find((entry) => entry.id === row.id) ?? null,
                  );
                }}
              />
            </div>
            {selected && (
              <div className="inline-note">
                Selected: <code>{selected.collection}/{selected.kind}/{selected.field}</code>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">New index</h2>
        <Segmented
          label="Type"
          value={kind}
          options={INDEX_KINDS.map((item) => ({ value: item, label: item }))}
          onChange={setKind}
        />
        <div className="field-row">
          <span className="field-label">Collection</span>
          <input
            className="field-input field-small"
            list="index-collections"
            value={targetCollection}
            placeholder="Collection"
            onChange={(event) => setTargetCollection(event.target.value)}
          />
          <span className="field-label">Field</span>
          <input
            className="field-input field-small"
            value={field}
            placeholder="Field"
            onChange={(event) => setField(event.target.value)}
          />
        </div>
        {kind === 'vector' && (
          <div className="field-row">
            <span className="field-label">Dimensions</span>
            <input className="field-input field-number" type="number" min={1} value={dim} onChange={(event) => setDim(event.target.value)} />
            <span className="field-label">Metric</span>
            <input className="field-input field-small" value={metric} onChange={(event) => setMetric(event.target.value)} />
          </div>
        )}
        {kind === 'composite' && (
          <div className="field-row">
            <span className="field-label">Fields</span>
            <input className="field-input" value={composite} placeholder="a, b, c" onChange={(event) => setComposite(event.target.value)} />
          </div>
        )}
        <datalist id="index-collections">
          {collections.map((item) => (
            <option key={item.name} value={item.name} />
          ))}
        </datalist>
      </section>
    </div>
  );
}
