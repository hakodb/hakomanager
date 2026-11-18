import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo } from '../types';

interface VectorPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

const METRICS = ['cosine', 'l2', 'inner-product'];

const hitColumns: DataGridColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'score', label: 'Score' },
  { key: 'data', label: 'Data' },
];

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

function parseVector(text: string): number[] {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Vector must be a comma-separated list of numbers.');
  }
  if (values.length === 0) {
    throw new Error('Enter at least one number for the vector.');
  }
  return values;
}

function normalizeHits(raw: unknown): Record<string, unknown>[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const source = raw as Record<string, unknown>;
    for (const key of ['hits', 'results', 'rows', 'items', 'matches']) {
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
    }
  }
  return list.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return { id: '', score: '', data: serialize(entry) };
    }
    const source = entry as Record<string, unknown>;
    const id = source.id ?? source.docId ?? source.key ?? '';
    const score = source.score ?? source.rrfScore ?? source.rrf_score ?? source.distance ?? '';
    const data =
      source.data ?? source.document ?? ('doc' in source ? source.doc : source);
    return { id, score, data: serialize(data) };
  });
}

export function VectorPage({ profileId, collection, collections, onStatus }: VectorPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [field, setField] = useState('');
  const [vectorText, setVectorText] = useState('');
  const [k, setK] = useState(10);
  const [textField, setTextField] = useState('');
  const [textQuery, setTextQuery] = useState('');
  const [rrfK, setRrfK] = useState(60);
  const [indexCollection, setIndexCollection] = useState(collection ?? '');
  const [indexField, setIndexField] = useState('');
  const [dim, setDim] = useState(128);
  const [metric, setMetric] = useState('cosine');
  const [searchRows, setSearchRows] = useState<Record<string, unknown>[]>([]);
  const [hybridRows, setHybridRows] = useState<Record<string, unknown>[]>([]);
  const [info, setInfo] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (collection) {
      setCollectionName(collection);
      setIndexCollection(collection);
    }
  }, [collection]);

  function requireProfile(): boolean {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
      return false;
    }
    return true;
  }

  function readVector(): number[] | null {
    try {
      return parseVector(vectorText);
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    }
  }

  async function search() {
    if (!requireProfile()) {
      return;
    }
    const vector = readVector();
    if (!vector) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>('vector.searchScored', {
        profileId,
        collection: collectionName.trim(),
        field: field.trim(),
        vector,
        k,
      });
      setSearchRows(normalizeHits(result));
      onStatus('Vector search completed.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function indexInfo() {
    if (!requireProfile()) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>('vector.info', {
        profileId,
        collection: collectionName.trim(),
        field: field.trim(),
      });
      setInfo(result);
      onStatus('Vector index info loaded.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function hybrid() {
    if (!requireProfile()) {
      return;
    }
    const vector = readVector();
    if (!vector) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>('vector.hybrid', {
        profileId,
        collection: collectionName.trim(),
        textField: textField.trim(),
        textQuery,
        vectorField: field.trim(),
        vector,
        k,
        rrfK,
      });
      setHybridRows(normalizeHits(result));
      onStatus('Hybrid search completed.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function createIndex() {
    if (!requireProfile()) {
      return;
    }
    if (!indexCollection.trim() || !indexField.trim()) {
      setError('Enter a collection and a vector field for the new index.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await invoke('index.create', {
        profileId,
        kind: 'vector',
        args: {
          collection: indexCollection.trim(),
          field: indexField.trim(),
          dim,
          metric,
        },
      });
      onStatus(`Created vector index on ${indexCollection.trim()}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {!profileId && (
        <div className="inline-note">Open a database on the Workspace tab to run vector operations.</div>
      )}

      <section className="page-section">
        <h2 className="section-title">Vector search</h2>
        <div className="field-row">
          <span className="field-label">Collection</span>
          <select
            className="field-select"
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
          >
            <option value="">Select collection</option>
            {collections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="field-label">Vector field</span>
          <input
            className="field-input field-small"
            type="text"
            value={field}
            placeholder="embedding"
            onChange={(event) => setField(event.target.value)}
          />
          <span className="field-label">k</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={k}
            onChange={(event) => setK(Number(event.target.value))}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Vector</span>
          <input
            className="field-input"
            type="text"
            value={vectorText}
            placeholder="0.1, 0.2, 0.3, ..."
            onChange={(event) => setVectorText(event.target.value)}
          />
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void search()}>
            Search
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void indexInfo()}>
            Index info
          </button>
        </div>
        <div className="two-column">
          <div className="panel">
            <div className="panel-header">Search results</div>
            <div className="panel-body">
              <div className="grid-scroll">
                <DataGrid columns={hitColumns} rows={searchRows} />
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">Index info (vector.info)</div>
            <div className="panel-body">
              <div className="json-view">
                <JsonEditor value={pretty(info)} onChange={() => undefined} readOnly />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Hybrid search</h2>
        <div className="field-row">
          <span className="field-label">Text field</span>
          <input
            className="field-input field-small"
            type="text"
            value={textField}
            placeholder="content"
            onChange={(event) => setTextField(event.target.value)}
          />
          <span className="field-label">Text query</span>
          <input
            className="field-input"
            type="text"
            value={textQuery}
            placeholder="Search terms"
            onChange={(event) => setTextQuery(event.target.value)}
          />
          <span className="field-label">RRF k</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={rrfK}
            onChange={(event) => setRrfK(Number(event.target.value))}
          />
          <button type="button" className="button" disabled={busy} onClick={() => void hybrid()}>
            Hybrid search
          </button>
        </div>
        <div className="inline-note">
          Hybrid search reuses the collection, vector field, vector and k values from the section above.
        </div>
        <div className="panel">
          <div className="panel-header">Hybrid results</div>
          <div className="panel-body">
            <div className="grid-scroll">
              <DataGrid columns={hitColumns} rows={hybridRows} />
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Create vector index</h2>
        <div className="field-row">
          <span className="field-label">Collection</span>
          <input
            className="field-input field-small"
            type="text"
            value={indexCollection}
            placeholder="Collection name"
            onChange={(event) => setIndexCollection(event.target.value)}
          />
          <span className="field-label">Field</span>
          <input
            className="field-input field-small"
            type="text"
            value={indexField}
            placeholder="embedding"
            onChange={(event) => setIndexField(event.target.value)}
          />
          <span className="field-label">Dim</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={dim}
            onChange={(event) => setDim(Number(event.target.value))}
          />
          <span className="field-label">Metric</span>
          <select className="field-select" value={metric} onChange={(event) => setMetric(event.target.value)}>
            {METRICS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void createIndex()}>
            Create vector index
          </button>
        </div>
      </section>
    </div>
  );
}
