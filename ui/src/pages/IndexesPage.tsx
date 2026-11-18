import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo } from '../types';

interface IndexesPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

const INDEX_KINDS = ['secondary', 'fts', 'vector', 'composite', 'traverse', 'edge'];

function parseFields(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed.split(',').map((part) => part.trim()).filter((part) => part !== '');
  }
}

export function IndexesPage({ profileId, collection, collections, onStatus }: IndexesPageProps) {
  const [indexList, setIndexList] = useState<unknown>(null);
  const [createKind, setCreateKind] = useState('secondary');
  const [createCollection, setCreateCollection] = useState(collection ?? '');
  const [createField, setCreateField] = useState('');
  const [dim, setDim] = useState('');
  const [metric, setMetric] = useState('');
  const [fieldsJson, setFieldsJson] = useState('["field1", "field2"]');
  const [dropKind, setDropKind] = useState('secondary');
  const [dropCollection, setDropCollection] = useState(collection ?? '');
  const [dropField, setDropField] = useState('');
  const [dropId, setDropId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (collection) {
      setCreateCollection(collection);
      setDropCollection(collection);
    }
  }, [collection]);

  async function refresh() {
    if (!profileId) {
      setIndexList(null);
      return;
    }
    setError('');
    try {
      const result = await invoke<unknown>('index.list', { profileId });
      setIndexList(result);
      onStatus('Index list refreshed.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  useEffect(() => {
    void refresh();
    // Reload whenever the active profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function createIndex() {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
      return;
    }
    const name = createCollection.trim();
    if (!name) {
      setError('Enter a collection for the new index.');
      return;
    }
    const args: Record<string, unknown> = { collection: name };
    const field = createField.trim();
    if (field) {
      args.field = field;
    }
    if (createKind === 'vector') {
      if (dim.trim()) {
        args.dim = Number(dim);
      }
      if (metric.trim()) {
        args.metric = metric.trim();
      }
    }
    if (createKind === 'composite') {
      args.fields = parseFields(fieldsJson);
    }
    setError('');
    try {
      await invoke('index.create', { profileId, kind: createKind, args });
      onStatus(`Created ${createKind} index on ${name}.`);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function dropIndex() {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
      return;
    }
    const name = dropCollection.trim();
    if (!name) {
      setError('Enter the collection of the index to drop.');
      return;
    }
    const args: Record<string, unknown> = { collection: name };
    const field = dropField.trim();
    const id = dropId.trim();
    if (field) {
      args.field = field;
    }
    if (id) {
      args.id = id;
    }
    setError('');
    try {
      await invoke('index.drop', { profileId, kind: dropKind, args });
      onStatus(`Dropped ${dropKind} index on ${name}.`);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div>
      <datalist id="index-collections">
        {collections.map((item) => (
          <option key={item.name} value={item.name} />
        ))}
      </datalist>
      <section className="page-section">
        <h2 className="section-title">Indexes</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={!profileId} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {!profileId && <div className="inline-note">Open a database on the Workspace tab to manage indexes.</div>}
        <div className="panel">
          <div className="panel-header">index.list</div>
          <div className="panel-body">
            <div className="json-view">
              <JsonEditor
                value={JSON.stringify(indexList, null, 2) ?? 'null'}
                onChange={() => undefined}
                readOnly
              />
            </div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">Create index</div>
          <div className="panel-body">
            <div className="field-row">
              <span className="field-label">Kind</span>
              <select className="field-select" value={createKind} onChange={(event) => setCreateKind(event.target.value)}>
                {INDEX_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <span className="field-label">Collection</span>
              <input
                className="field-input field-small"
                type="text"
                list="index-collections"
                value={createCollection}
                placeholder="Collection name"
                onChange={(event) => setCreateCollection(event.target.value)}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Field</span>
              <input
                className="field-input field-small"
                type="text"
                value={createField}
                placeholder="Field name"
                onChange={(event) => setCreateField(event.target.value)}
              />
            </div>
            {createKind === 'vector' && (
              <div className="field-row">
                <span className="field-label">Dim / metric</span>
                <input
                  className="field-input field-number"
                  type="number"
                  min={1}
                  value={dim}
                  placeholder="dim"
                  onChange={(event) => setDim(event.target.value)}
                />
                <input
                  className="field-input field-small"
                  type="text"
                  value={metric}
                  placeholder="metric (e.g. cosine)"
                  onChange={(event) => setMetric(event.target.value)}
                />
              </div>
            )}
            {createKind === 'composite' && (
              <div className="field-row">
                <span className="field-label">Fields JSON</span>
                <input
                  className="field-input"
                  type="text"
                  value={fieldsJson}
                  placeholder='["a", "b"]'
                  onChange={(event) => setFieldsJson(event.target.value)}
                />
              </div>
            )}
            <div className="field-row">
              <button type="button" className="button button-primary" disabled={!profileId} onClick={() => void createIndex()}>
                Create index
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Drop index</div>
          <div className="panel-body">
            <div className="field-row">
              <span className="field-label">Kind</span>
              <select className="field-select" value={dropKind} onChange={(event) => setDropKind(event.target.value)}>
                {INDEX_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <span className="field-label">Collection</span>
              <input
                className="field-input field-small"
                type="text"
                list="index-collections"
                value={dropCollection}
                placeholder="Collection name"
                onChange={(event) => setDropCollection(event.target.value)}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Field</span>
              <input
                className="field-input field-small"
                type="text"
                value={dropField}
                placeholder="Field name"
                onChange={(event) => setDropField(event.target.value)}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Id</span>
              <input
                className="field-input field-small"
                type="text"
                value={dropId}
                placeholder="Index id"
                onChange={(event) => setDropId(event.target.value)}
              />
            </div>
            <div className="field-row">
              <button type="button" className="button" disabled={!profileId} onClick={() => void dropIndex()}>
                Drop index
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
