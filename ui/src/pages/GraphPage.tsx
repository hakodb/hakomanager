import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar, Glyph, Segmented } from '../components/ActionBar';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo } from '../types';

interface GraphPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

const ANALYSIS_OPS = [
  { key: 'components', op: 'graph.components', label: 'Components' },
  { key: 'communities', op: 'graph.communities', label: 'Communities' },
  { key: 'cycle', op: 'graph.cycle', label: 'Cycle' },
  { key: 'topo', op: 'graph.topo', label: 'Topo' },
  { key: 'degree', op: 'graph.degree', label: 'Degree' },
];

const hitColumns: DataGridColumn[] = [
  { key: 'collection', label: 'Collection' },
  { key: 'id', label: 'ID' },
  { key: 'depth', label: 'Depth' },
  { key: 'cost', label: 'Cost' },
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

function normalizeHits(raw: unknown): Record<string, unknown>[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const source = raw as Record<string, unknown>;
    for (const key of ['hits', 'paths', 'results', 'rows', 'items']) {
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
    }
  }
  return list.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return { collection: '', id: '', depth: '', cost: '', data: serialize(entry) };
    }
    const source = entry as Record<string, unknown>;
    return {
      collection: source.collection ?? '',
      id: source.id ?? '',
      depth: source.depth ?? '',
      cost: source.cost ?? '',
      data: serialize(source.data ?? source),
    };
  });
}

function parseSeeds(text: string, defaultCollection: string): Array<{ collection: string; id: string }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const slash = line.indexOf('/');
      return slash > 0
        ? { collection: line.slice(0, slash).trim(), id: line.slice(slash + 1).trim() }
        : { collection: defaultCollection, id: line };
    });
}

export function GraphPage({ profileId, collection, collections, onStatus }: GraphPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [startId, setStartId] = useState('');
  const [direction, setDirection] = useState(2);
  const [edgeField, setEdgeField] = useState('');
  const [viaEdge, setViaEdge] = useState('');
  const [weightField, setWeightField] = useState('');
  const [maxDepth, setMaxDepth] = useState(4);
  const [limit, setLimit] = useState(50);
  const [fieldsText, setFieldsText] = useState('');
  const [seedsText, setSeedsText] = useState('');
  const [damping, setDamping] = useState(0.85);
  const [top, setTop] = useState(20);
  const [mode, setMode] = useState<'paths' | 'analysis'>('paths');
  const [pathRows, setPathRows] = useState<Record<string, unknown>[]>([]);
  const [pathLabel, setPathLabel] = useState('Paths');
  const [jsonResults, setJsonResults] = useState<Record<string, unknown>>({});
  const [exportText, setExportText] = useState('');
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

  function buildSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      collection: collectionName.trim(),
      start_id: startId.trim(),
      direction,
      max_depth: maxDepth,
      limit,
    };
    if (edgeField.trim()) spec.edge_field = edgeField.trim();
    if (viaEdge.trim()) spec.via_edge = viaEdge.trim();
    if (weightField.trim()) spec.weight_field = weightField.trim();
    return spec;
  }

  async function runPaths(op: 'graph.paths' | 'graph.simplePaths') {
    if (!requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>(op, { profileId, spec: buildSpec() });
      setPathRows(normalizeHits(result));
      setPathLabel(op === 'graph.paths' ? 'Paths' : 'Simple paths');
      onStatus(`${op} completed.`);
    } catch (caught) {
      setError(`${op}: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis(key: string, op: string, args: Record<string, unknown>) {
    if (!requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>(op, args);
      setJsonResults((current) => ({ ...current, [key]: result }));
      onStatus(`${op} completed.`);
    } catch (caught) {
      setError(`${op}: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runExport() {
    if (!requireProfile()) return;
    setError('');
    setBusy(true);
    try {
      setExportText(pretty(await invoke<unknown>('graph.export', { profileId, spec: buildSpec() })));
      onStatus('graph.export completed.');
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
            { value: 'paths', label: 'Paths', icon: 'graph' },
            { value: 'analysis', label: 'Analysis', icon: 'gauge' },
          ]}
          onChange={setMode}
        />
        <ActionBar
          label="Graph actions"
          items={[
            { id: 'paths', label: 'Paths', icon: <Glyph name="graph" />, active: mode === 'paths', onClick: () => { setMode('paths'); void runPaths('graph.paths'); }, disabled: busy || !profileId },
            { id: 'simple', label: 'Simple paths', icon: <Glyph name="search" />, onClick: () => void runPaths('graph.simplePaths'), disabled: busy || !profileId },
            { id: 'rank', label: 'PageRank', icon: <Glyph name="gauge" />, onClick: () => void runAnalysis('rank', 'graph.pagerank', { profileId, collection: collectionName.trim(), seeds: parseSeeds(seedsText, collectionName.trim()), spec: buildSpec(), damping, top }), disabled: busy || !profileId },
            { id: 'subgraph', label: 'Subgraph', icon: <Glyph name="layers" />, onClick: () => void runAnalysis('subgraph', 'graph.subgraph', { profileId, spec: { ...buildSpec(), projection: fieldsText.split(',').map((f) => f.trim()).filter(Boolean) } }), disabled: busy || !profileId },
            { id: 'export', label: 'Export', icon: <Glyph name="export" />, onClick: () => void runExport(), disabled: busy || !profileId },
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
            <span>Start id</span>
            <input className="field-input field-small" value={startId} placeholder="Document id" onChange={(event) => setStartId(event.target.value)} />
          </label>
          <label className="option-field">
            <span>Direction</span>
            <Segmented value={direction} options={[{ value: 0, label: 'Out' }, { value: 1, label: 'In' }, { value: 2, label: 'Both' }]} onChange={setDirection} />
          </label>
          <label className="option-field">
            <span>Max depth</span>
            <input className="field-input field-number" type="number" min={1} value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))} />
          </label>
          <label className="option-field">
            <span>Limit</span>
            <input className="field-input field-number" type="number" min={1} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          </label>
        </div>
        <details className="advanced-options">
          <summary>Advanced options (edge field, via, weight, projection, seeds)</summary>
          <div className="options-strip">
            <label className="option-field"><span>Edge field</span><input className="field-input field-small" value={edgeField} placeholder="edges" onChange={(event) => setEdgeField(event.target.value)} /></label>
            <label className="option-field"><span>Via edge</span><input className="field-input field-small" value={viaEdge} placeholder="edge label" onChange={(event) => setViaEdge(event.target.value)} /></label>
            <label className="option-field"><span>Weight field</span><input className="field-input field-small" value={weightField} placeholder="weight" onChange={(event) => setWeightField(event.target.value)} /></label>
            <label className="option-field"><span>Fields</span><input className="field-input field-small" value={fieldsText} placeholder="a, b, c" onChange={(event) => setFieldsText(event.target.value)} /></label>
            <label className="option-field"><span>Seeds</span><input className="field-input field-small" value={seedsText} placeholder="collection/id" onChange={(event) => setSeedsText(event.target.value)} /></label>
            <label className="option-field"><span>Damping</span><input className="field-input field-number" type="number" min={0} max={1} step={0.01} value={damping} onChange={(event) => setDamping(Number(event.target.value))} /></label>
            <label className="option-field"><span>Top</span><input className="field-input field-number" type="number" min={1} value={top} onChange={(event) => setTop(Number(event.target.value))} /></label>
          </div>
        </details>
      </section>

      {mode === 'paths' && (
        <section className="page-section">
          <div className="panel">
            <div className="panel-header">{pathLabel}</div>
            <div className="panel-body">
              <div className="grid-scroll">
                <DataGrid columns={hitColumns} rows={pathRows} />
              </div>
            </div>
          </div>
        </section>
      )}

      {mode === 'analysis' && (
        <section className="page-section">
          <div className="action-bar" role="toolbar" aria-label="Analytics">
            {ANALYSIS_OPS.map((entry) => (
              <button key={entry.key} type="button" className="action-button" disabled={busy || !profileId} onClick={() => void runAnalysis(entry.key, entry.op, { profileId, collection: collectionName.trim(), spec: buildSpec() })}>
                {entry.label}
              </button>
            ))}
          </div>
          <div className="two-column">
            {Object.entries(jsonResults).map(([key, value]) => (
              <div className="panel" key={key}>
                <div className="panel-header">graph.{key}</div>
                <div className="panel-body"><div className="json-view"><JsonEditor value={pretty(value)} onChange={() => undefined} readOnly /></div></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {exportText !== '' && (
        <section className="page-section">
          <div className="panel">
            <div className="panel-header">graph.export</div>
            <div className="panel-body"><div className="json-view"><JsonEditor value={exportText} onChange={() => undefined} readOnly /></div></div>
          </div>
        </section>
      )}
    </div>
  );
}
