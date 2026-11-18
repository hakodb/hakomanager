import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo } from '../types';

interface GraphPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

interface Seed {
  collection: string;
  id: string;
}

const ANALYSIS_OPS = [
  { key: 'components', op: 'graph.components' },
  { key: 'communities', op: 'graph.communities' },
  { key: 'cycle', op: 'graph.cycle' },
  { key: 'topo', op: 'graph.topo' },
  { key: 'degree', op: 'graph.degree' },
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

function parseSeeds(text: string, defaultCollection: string): Seed[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const slash = line.indexOf('/');
      if (slash > 0) {
        return { collection: line.slice(0, slash).trim(), id: line.slice(slash + 1).trim() };
      }
      return { collection: defaultCollection, id: line };
    });
}

interface JsonResultPanelProps {
  title: string;
  value: unknown;
}

function JsonResultPanel({ title, value }: JsonResultPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">{title}</div>
      <div className="panel-body">
        <div className="json-view">
          <JsonEditor value={pretty(value)} onChange={() => undefined} readOnly />
        </div>
      </div>
    </div>
  );
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
  const [pathRows, setPathRows] = useState<Record<string, unknown>[]>([]);
  const [pathLabel, setPathLabel] = useState('Paths');
  const [jsonResults, setJsonResults] = useState<Record<string, unknown>>({});
  const [exportText, setExportText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (collection) {
      setCollectionName(collection);
    }
  }, [collection]);

  function requireProfile(): boolean {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
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
    const edge = edgeField.trim();
    const via = viaEdge.trim();
    const weight = weightField.trim();
    if (edge) {
      spec.edge_field = edge;
    }
    if (via) {
      spec.via_edge = via;
    }
    if (weight) {
      spec.weight_field = weight;
    }
    return spec;
  }

  async function runPaths(op: 'graph.paths' | 'graph.simplePaths') {
    if (!requireProfile()) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>(op, { profileId, spec: buildSpec() });
      setPathRows(normalizeHits(result));
      setPathLabel(op === 'graph.paths' ? 'Paths (graph.paths)' : 'Simple paths (graph.simplePaths)');
      onStatus(`${op} completed.`);
    } catch (caught) {
      setError(`${op}: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis(key: string, op: string, args: Record<string, unknown>) {
    if (!requireProfile()) {
      return;
    }
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

  async function runPagerank() {
    await runAnalysis('pagerank', 'graph.pagerank', {
      profileId,
      collection: collectionName.trim(),
      seeds: parseSeeds(seedsText, collectionName.trim()),
      spec: buildSpec(),
      damping,
      top,
    });
  }

  async function runSubgraph() {
    const args: Record<string, unknown> = { profileId, spec: buildSpec() };
    const fields = fieldsText
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field !== '');
    if (fields.length > 0) {
      args.fields = fields;
    }
    await runAnalysis('subgraph', 'graph.subgraph', args);
  }

  async function runExport() {
    if (!requireProfile()) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>('graph.export', { profileId, spec: buildSpec() });
      setExportText(pretty(result));
      onStatus('Graph export completed.');
    } catch (caught) {
      setError(`graph.export: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {!profileId && (
        <div className="inline-note">Open a database on the Workspace tab to explore graphs.</div>
      )}

      <section className="page-section">
        <h2 className="section-title">Traversal specification</h2>
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
          <span className="field-label">Start id</span>
          <input
            className="field-input field-small"
            type="text"
            value={startId}
            placeholder="Document id"
            onChange={(event) => setStartId(event.target.value)}
          />
          <span className="field-label">Direction</span>
          <select
            className="field-select"
            value={direction}
            onChange={(event) => setDirection(Number(event.target.value))}
          >
            <option value={0}>0 - out</option>
            <option value={1}>1 - in</option>
            <option value={2}>2 - both</option>
          </select>
        </div>
        <div className="field-row">
          <span className="field-label">Edge field</span>
          <input
            className="field-input field-small"
            type="text"
            value={edgeField}
            placeholder="edges"
            onChange={(event) => setEdgeField(event.target.value)}
          />
          <span className="field-label">Via edge</span>
          <input
            className="field-input field-small"
            type="text"
            value={viaEdge}
            placeholder="edge label"
            onChange={(event) => setViaEdge(event.target.value)}
          />
          <span className="field-label">Weight field</span>
          <input
            className="field-input field-small"
            type="text"
            value={weightField}
            placeholder="weight"
            onChange={(event) => setWeightField(event.target.value)}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Max depth</span>
          <input
            className="field-input field-number"
            type="number"
            min={0}
            value={maxDepth}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
          />
          <span className="field-label">Limit</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <span className="field-label">Fields (subgraph)</span>
          <input
            className="field-input field-small"
            type="text"
            value={fieldsText}
            placeholder="a, b, c"
            onChange={(event) => setFieldsText(event.target.value)}
          />
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Path finding</h2>
        <div className="field-row">
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void runPaths('graph.paths')}>
            Paths
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void runPaths('graph.simplePaths')}>
            Simple paths
          </button>
        </div>
        <div className="panel">
          <div className="panel-header">{pathLabel}</div>
          <div className="panel-body">
            <div className="grid-scroll">
              <DataGrid columns={hitColumns} rows={pathRows} />
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Graph analysis</h2>
        <div className="field-row">
          {ANALYSIS_OPS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void runAnalysis(entry.key, entry.op, {
                  profileId,
                  collection: collectionName.trim(),
                  spec: buildSpec(),
                })
              }
            >
              {entry.op}
            </button>
          ))}
        </div>
        <div className="field-row">
          <span className="field-label">Seeds</span>
          <textarea
            className="seeds-input"
            value={seedsText}
            placeholder={'collection/id\ndocs/doc-1'}
            onChange={(event) => setSeedsText(event.target.value)}
          />
          <span className="field-label">Damping</span>
          <input
            className="field-input field-number"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={damping}
            onChange={(event) => setDamping(Number(event.target.value))}
          />
          <span className="field-label">Top</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={top}
            onChange={(event) => setTop(Number(event.target.value))}
          />
          <button type="button" className="button" disabled={busy} onClick={() => void runPagerank()}>
            graph.pagerank
          </button>
        </div>
        <div className="field-row">
          <button type="button" className="button" disabled={busy} onClick={() => void runSubgraph()}>
            graph.subgraph
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void runExport()}>
            graph.export
          </button>
        </div>
        <div className="two-column">
          {ANALYSIS_OPS.filter((entry) => entry.key in jsonResults).map((entry) => (
            <JsonResultPanel key={entry.key} title={entry.op} value={jsonResults[entry.key]} />
          ))}
          {'pagerank' in jsonResults && (
            <JsonResultPanel title="graph.pagerank" value={jsonResults.pagerank} />
          )}
          {'subgraph' in jsonResults && (
            <JsonResultPanel title="graph.subgraph" value={jsonResults.subgraph} />
          )}
        </div>
      </section>

      {exportText !== '' && (
        <section className="page-section">
          <div className="panel">
            <div className="panel-header">graph.export</div>
            <div className="panel-body">
              <div className="json-view">
                <JsonEditor value={exportText} onChange={() => undefined} readOnly />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
