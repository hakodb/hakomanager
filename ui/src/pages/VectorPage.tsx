import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar, Glyph, Segmented } from '../components/ActionBar';
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
    return JSON.stringify(value) ?? '';
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
  const values = text.split(',').map((part) => part.trim()).filter(Boolean).map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Vector must be a comma-separated list of numbers.');
  }
  if (values.length === 0) throw new Error('Enter at least one number.');
  return values;
}

function normalizeHits(raw: unknown): Record<string, unknown>[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const source = raw as Record<string, unknown>;
    for (const key of ['hits', 'results', 'rows', 'items', 'matches']) {
      if (Array.isArray(source[key])) {
        list = source[key] as unknown[];
        break;
      }
    }
  }
  return list.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return { id: '', score: '', data: serialize(entry) };
    }
    const source = entry as Record<string, unknown>;
    const data = source.data ?? source.document ?? ('doc' in source ? source.doc : source);
    return {
      id: source.id ?? source.docId ?? source.key ?? '',
      score: source.score ?? source.rrfScore ?? source.rrf_score ?? source.distance ?? '',
      data: serialize(data),
    };
  });
}

export function VectorPage({ profileId, collection, collections, onStatus }: VectorPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [field, setField] = useState('');
  const [vectorText, setVectorText] = useState('');
  const [k, setK] = useState(10);
  const [textField, setTextField] = useState('content');
  const [textQuery, setTextQuery] = useState('');
  const [rrfK, setRrfK] = useState(60);
  const [dim, setDim] = useState(128);
  const [metric, setMetric] = useState('cosine');
  const [mode, setMode] = useState<'search' | 'hybrid' | 'index'>('search');
  const [searchRows, setSearchRows] = useState<Record<string, unknown>[]>([]);
  const [hybridRows, setHybridRows] = useState<Record<string, unknown>[]>([]);
  const [info, setInfo] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (collection) setCollectionName(collection);
  }, [collection]);

  function requireProfile(): boolean {
    if (!profileId) {
      setError('Open a database first.');
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
    const vector = readVector();
    if (!vector || !requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      setSearchRows(normalizeHits(await invoke<unknown>('vector.searchScored', {
        profileId, collection: collectionName.trim(), field: field.trim(), vector, k,
      })));
      onStatus('Vector search completed.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function indexInfo() {
    if (!requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      setInfo(await invoke<unknown>('vector.info', { profileId, collection: collectionName.trim(), field: field.trim() }));
      onStatus('Vector index info loaded.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function hybrid() {
    const vector = readVector();
    if (!vector || !requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      setHybridRows(normalizeHits(await invoke<unknown>('vector.hybrid', {
        profileId, collection: collectionName.trim(), textField: textField.trim(), textQuery,
        vectorField: field.trim(), vector, k, rrfK,
      })));
      onStatus('Hybrid search completed.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function createIndex() {
    if (!requireProfile()) return;
    if (!collectionName.trim() || !field.trim()) {
      setError('Enter a collection and a vector field.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await invoke('index.create', {
        profileId, kind: 'vector',
        args: { collection: collectionName.trim(), field: field.trim(), dim, metric },
      });
      onStatus(`Created vector index on ${collectionName.trim()}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {!profileId && <div className="inline-note">Open a database first.</div>}

      <section className="page-section">
        <Segmented
          label="Mode"
          value={mode}
          options={[
            { value: 'search', label: 'Vector search', icon: 'vector' },
            { value: 'hybrid', label: 'Hybrid', icon: 'search' },
            { value: 'index', label: 'Create index', icon: 'plus' },
          ]}
          onChange={setMode}
        />
        <ActionBar
          label="Vector actions"
          items={[
            { id: 'search', label: 'Search', icon: <Glyph name="search" />, active: mode === 'search', onClick: () => { setMode('search'); void search(); }, disabled: busy || !profileId },
            { id: 'hybrid', label: 'Hybrid search', icon: <Glyph name="layers" />, active: mode === 'hybrid', onClick: () => { setMode('hybrid'); void hybrid(); }, disabled: busy || !profileId },
            { id: 'info', label: 'Index info', icon: <Glyph name="info" />, onClick: () => void indexInfo(), disabled: busy || !profileId },
            { id: 'create', label: 'Create index', icon: <Glyph name="plus" />, active: mode === 'index', onClick: () => { setMode('index'); void createIndex(); }, disabled: busy || !profileId, primary: true },
          ]}
        />
        <div className="options-strip">
          <label className="option-field">
            <span>Collection</span>
            <select className="field-select" value={collectionName} onChange={(event) => setCollectionName(event.target.value)}>
              <option value="">Select</option>
              {collections.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="option-field">
            <span>Vector field</span>
            <input className="field-input field-small" value={field} placeholder="embedding" onChange={(event) => setField(event.target.value)} />
          </label>
          <label className="option-field">
            <span>k</span>
            <input className="field-input field-number" type="number" min={1} value={k} onChange={(event) => setK(Number(event.target.value))} />
          </label>
          <label className="option-field option-field-grow">
            <span>Vector</span>
            <input className="field-input" value={vectorText} placeholder="0.1, 0.2, 0.3, ..." onChange={(event) => setVectorText(event.target.value)} />
          </label>
        </div>
        {mode === 'hybrid' && (
          <div className="options-strip">
            <label className="option-field"><span>Text field</span><input className="field-input field-small" value={textField} onChange={(event) => setTextField(event.target.value)} /></label>
            <label className="option-field option-field-grow"><span>Text query</span><input className="field-input" value={textQuery} placeholder="Search terms" onChange={(event) => setTextQuery(event.target.value)} /></label>
            <label className="option-field"><span>RRF k</span><input className="field-input field-number" type="number" min={1} value={rrfK} onChange={(event) => setRrfK(Number(event.target.value))} /></label>
          </div>
        )}
        {mode === 'index' && (
          <div className="options-strip">
            <label className="option-field"><span>Dimensions</span><input className="field-input field-number" type="number" min={1} value={dim} onChange={(event) => setDim(Number(event.target.value))} /></label>
            <label className="option-field"><span>Metric</span><select className="field-select" value={metric} onChange={(event) => setMetric(event.target.value)}>{METRICS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
        )}
      </section>

      <section className="page-section">
        <div className="two-column">
          <div className="panel">
            <div className="panel-header">Search results</div>
            <div className="panel-body"><div className="grid-scroll"><DataGrid columns={hitColumns} rows={searchRows} /></div></div>
          </div>
          <div className="panel">
            <div className="panel-header">Hybrid results</div>
            <div className="panel-body"><div className="grid-scroll"><DataGrid columns={hitColumns} rows={hybridRows} /></div></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">Index info</div>
          <div className="panel-body"><div className="json-view"><JsonEditor value={pretty(info)} onChange={() => undefined} readOnly /></div></div>
        </div>
      </section>
    </div>
  );
}
