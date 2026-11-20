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
  fields: string;
  order: string;
  detail: string;
}

const columns: DataGridColumn[] = [
  { key: 'collection', label: 'Collection' },
  { key: 'kind', label: 'Type' },
  { key: 'fields', label: 'Fields' },
  { key: 'order', label: 'Order' },
  { key: 'detail', label: 'Details' },
];

/** Map the engine's index.list shape to one row per collection + index type. */
function flattenIndexes(raw: unknown): IndexRow[] {
  const rows: IndexRow[] = [];
  if (typeof raw !== 'object' || raw === null) return rows;
  const source = raw as Record<string, unknown>;
  let ordinal = 0;
  const push = (collection: string, kind: string, fields: string[], order: string, detail: string) => {
    rows.push({
      id: `${kind}-${collection}-${++ordinal}`,
      collection,
      kind,
      fields: fields.join(', '),
      order: order || '—',
      detail,
    });
  };
  const map = (key: string, kind: string) => {
    const entry = source[key];
    if (typeof entry === 'object' && entry !== null) {
      for (const [collection, fields] of Object.entries(entry as Record<string, unknown>)) {
        if (Array.isArray(fields)) {
          push(collection, kind, fields.map(String), '', '');
        }
      }
    }
  };
  // engine list_indexes(): {simple, secondary, fts, composite, vector, traverse}
  map('secondary', 'secondary');
  map('fts', 'fts');

  const composite = source.composite;
  if (Array.isArray(composite)) {
    for (const entry of composite) {
      if (typeof entry !== 'object' || entry === null) continue;
      const value = entry as Record<string, unknown>;
      const fields = Array.isArray(value.fields)
        ? value.fields.map((field) => {
            if (typeof field === 'object' && field !== null) {
              const item = field as Record<string, unknown>;
              return String(item.field ?? '');
            }
            return String(field);
          })
        : [];
      const order = Array.isArray(value.fields)
        ? value.fields
            .map((field) =>
              typeof field === 'object' && field !== null
                ? String((field as Record<string, unknown>).direction ?? '')
                : '',
            )
            .filter(Boolean)
            .join(', ')
        : '';
      push(
        String(value.collection ?? ''),
        'composite',
        fields,
        order,
        `id: ${String(value.id ?? '')}${value.unique ? ' · unique' : ''}${value.sparse ? ' · sparse' : ''}`,
      );
    }
  }

  const vector = source.vector;
  if (typeof vector === 'object' && vector !== null) {
    for (const [collection, infos] of Object.entries(vector as Record<string, unknown>)) {
      if (!Array.isArray(infos)) continue;
      const fields = infos.map((info) =>
        typeof info === 'object' && info !== null
          ? String((info as Record<string, unknown>).field ?? '')
          : String(info),
      );
      const dims = infos
        .map((info) => (typeof info === 'object' && info !== null ? (info as Record<string, unknown>).dim : undefined))
        .filter((value) => value !== undefined);
      const metrics = infos
        .map((info) => (typeof info === 'object' && info !== null ? (info as Record<string, unknown>).metric : undefined))
        .filter((value) => value !== undefined);
      push(
        collection,
        'vector',
        fields,
        '',
        [dims[0] ? `dim: ${dims[0]}` : '', metrics[0] ? `metric: ${metrics[0]}` : ''].filter(Boolean).join(' · '),
      );
    }
  }

  if (Array.isArray(source.traverse)) {
    for (const collection of source.traverse) {
      push(String(collection), 'traverse', [], '', 'edge tracking');
    }
  }
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
    if (selected.fields) args.field = selected.fields;
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
                Selected: <code>{selected.collection}/{selected.kind}/{selected.fields}</code>
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
