import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, isDocumentView, type CollectionInfo, type DocumentView } from '../types';

interface DocumentsPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onCollectionChange: (name: string) => void;
  onStatus: (message: string) => void;
}

const columns: DataGridColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'data', label: 'Data' },
];

function serializeData(data: unknown): string {
  try {
    return JSON.stringify(data) ?? 'null';
  } catch {
    return String(data);
  }
}

export function DocumentsPage({
  profileId,
  collection,
  collections,
  onCollectionChange,
  onStatus,
}: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [idText, setIdText] = useState('');
  const [editorText, setEditorText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ready = Boolean(profileId && collection);

  async function loadDocuments(atOffset = offset) {
    if (!profileId || !collection) {
      setDocuments([]);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const raw = await invoke<unknown>('document.list', {
        profileId,
        collection,
        limit,
        offset: atOffset,
      });
      const list = Array.isArray(raw) ? raw.filter(isDocumentView) : [];
      setDocuments(list);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedId(null);
    setIdText('');
    setEditorText('');
    void loadDocuments();
    // Reload when the active profile or collection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, collection]);

  const rows: Record<string, unknown>[] = documents.map((document) => ({
    id: document.id,
    data: serializeData(document.data),
  }));

  function handleRowClick(row: Record<string, unknown>) {
    const id = String(row.id);
    const match = documents.find((document) => document.id === id);
    setSelectedId(id);
    setIdText(id);
    setEditorText(match ? serializePretty(match.data) : '');
    setError('');
  }

  function readEditorData(): unknown {
    const text = editorText.trim();
    if (!text) {
      throw new Error('JSON data is empty.');
    }
    return JSON.parse(text) as unknown;
  }

  async function writeDocument(op: 'document.put' | 'document.patch') {
    if (!ready) {
      setError('Select a profile and a collection first.');
      return;
    }
    const id = idText.trim();
    if (!id) {
      setError('Enter a document id.');
      return;
    }
    let data: unknown;
    try {
      data = readEditorData();
    } catch (caught) {
      setError(`Invalid JSON: ${errorMessage(caught)}`);
      return;
    }
    setError('');
    try {
      await invoke(op, { profileId, collection, id, data });
      setSelectedId(id);
      await loadDocuments();
      onStatus(`${op === 'document.put' ? 'Saved' : 'Patched'} document ${id}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function deleteDocument(force: boolean) {
    if (!ready) {
      setError('Select a profile and a collection first.');
      return;
    }
    const id = idText.trim() || selectedId;
    if (!id) {
      setError('Select a document or enter an id to delete.');
      return;
    }
    if (force && !window.confirm(`Force delete document "${id}"? This cannot be undone.`)) {
      return;
    }
    setError('');
    try {
      await invoke('document.delete', { profileId, collection, id, force });
      setSelectedId(null);
      setIdText('');
      setEditorText('');
      await loadDocuments();
      onStatus(`${force ? 'Force deleted' : 'Deleted'} document ${id}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function newDocument() {
    setSelectedId(null);
    setIdText('');
    setEditorText('{\n  \n}');
    setError('');
  }

  function pageBy(delta: number) {
    const next = Math.max(0, offset + delta);
    setOffset(next);
    void loadDocuments(next);
  }

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Browse documents</h2>
        <div className="field-row">
          <span className="field-label">Collection</span>
          <select
            className="field-select"
            value={collection ?? ''}
            onChange={(event) => onCollectionChange(event.target.value)}
          >
            <option value="">Select collection</option>
            {collections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="field-label">Limit</span>
          <input
            className="field-input field-number"
            type="number"
            min={1}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <span className="field-label">Offset</span>
          <input
            className="field-input field-number"
            type="number"
            min={0}
            value={offset}
            onChange={(event) => setOffset(Number(event.target.value))}
          />
          <button type="button" className="button" disabled={!ready || loading} onClick={() => void loadDocuments()}>
            Load
          </button>
          <button
            type="button"
            className="button"
            disabled={!ready || loading || offset === 0}
            onClick={() => pageBy(-limit)}
          >
            Previous
          </button>
          <button
            type="button"
            className="button"
            disabled={!ready || loading}
            onClick={() => pageBy(limit)}
          >
            Next
          </button>
          <button type="button" className="button" onClick={newDocument}>
            New document
          </button>
        </div>
        {!ready && <div className="inline-note">Open a database and select a collection to load documents.</div>}
        {error && <div className="inline-error">{error}</div>}
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            Documents{selectedId ? `: ${selectedId}` : ''}
          </div>
          <div className="panel-body">
            <div className="grid-scroll">
              <DataGrid columns={columns} rows={rows} onRowClick={handleRowClick} />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Document editor</div>
          <div className="panel-body">
            <div className="field-row">
              <span className="field-label">Id</span>
              <input
                className="field-input field-small"
                type="text"
                value={idText}
                placeholder="Document id"
                onChange={(event) => setIdText(event.target.value)}
              />
            </div>
            <div className="editor-pane">
              <JsonEditor value={editorText} onChange={setEditorText} />
            </div>
            <div className="field-row">
              <button type="button" className="button button-primary" disabled={!ready} onClick={() => void writeDocument('document.put')}>
                Save
              </button>
              <button type="button" className="button" disabled={!ready} onClick={() => void writeDocument('document.patch')}>
                Patch
              </button>
              <button type="button" className="button" disabled={!ready} onClick={() => void deleteDocument(false)}>
                Delete soft
              </button>
              <button type="button" className="button" disabled={!ready} onClick={() => void deleteDocument(true)}>
                Delete force
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function serializePretty(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2) ?? 'null';
  } catch {
    return String(data);
  }
}
