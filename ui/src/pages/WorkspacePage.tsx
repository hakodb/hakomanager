import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { errorMessage, isDatabaseProfile, type DatabaseProfile } from '../types';

interface WorkspacePageProps {
  databases: DatabaseProfile[];
  activeProfileId: string | null;
  onActivate: (id: string | null) => void;
  refreshDatabases: () => Promise<DatabaseProfile[]>;
  onStatus: (message: string) => void;
}

export function WorkspacePage({
  databases,
  activeProfileId,
  onActivate,
  refreshDatabases,
  onStatus,
}: WorkspacePageProps) {
  const [path, setPath] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshDatabases();
  }, [refreshDatabases]);

  async function handleOpen() {
    const trimmed = path.trim();
    if (!trimmed) {
      setError('Enter a path to a local database directory.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const opened = await invoke<unknown>('workspace.open', {
        path: trimmed,
        readOnly,
      });
      const updated = await refreshDatabases();
      let nextId = isDatabaseProfile(opened) ? opened.id : '';
      if (!nextId) {
        const match = updated.find((db) => db.path === trimmed);
        nextId = match?.id ?? '';
      }
      if (nextId) {
        onActivate(nextId);
        onStatus(`Opened database at ${trimmed}.`);
      } else {
        onStatus(`Opened database at ${trimmed}. Refresh the list to select it.`);
      }
      setPath('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleWrites(db: DatabaseProfile) {
    setError('');
    try {
      const enabled = db.read_only;
      await invoke('workspace.setWrites', { profileId: db.id, enabled });
      await refreshDatabases();
      onStatus(`${db.name}: writes ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleClose(db: DatabaseProfile) {
    setError('');
    try {
      await invoke('workspace.close', { profileId: db.id });
      await refreshDatabases();
      if (activeProfileId === db.id) {
        onActivate(null);
      }
      onStatus(`Closed database ${db.name}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Open database</h2>
        <div className="field-row">
          <span className="field-label">Directory path</span>
          <input
            className="field-input"
            type="text"
            value={path}
            placeholder="/path/to/local/database"
            onChange={(event) => setPath(event.target.value)}
          />
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void handleOpen()}>
            Open
          </button>
          <label className="field-checkbox">
            <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
            Open read-only
          </label>
        </div>
        {error && <div className="inline-error">{error}</div>}
        <div className="inline-note">
          Click a database row to make it the active profile for the other pages.
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Open databases</h2>
        <div className="grid-scroll">
          <table className="datagrid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Path</th>
                <th scope="col">Mode</th>
                <th scope="col">Profile id</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {databases.length === 0 ? (
                <tr>
                  <td className="datagrid-empty" colSpan={5}>
                    No open databases
                  </td>
                </tr>
              ) : (
                databases.map((db) => (
                  <tr
                    key={db.id}
                    className="datagrid-row-clickable"
                    onClick={() => onActivate(db.id)}
                  >
                    <td>
                      {db.name}
                      {activeProfileId === db.id ? ' (active)' : ''}
                    </td>
                    <td title={db.path}>{db.path}</td>
                    <td>{db.read_only ? 'Read-only' : 'Writable'}</td>
                    <td>{db.id}</td>
                    <td>
                      <button
                        type="button"
                        className="button button-compact"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleWrites(db);
                        }}
                      >
                        {db.read_only ? 'Enable writes' : 'Disable writes'}
                      </button>
                      <button
                        type="button"
                        className="button button-compact"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleClose(db);
                        }}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
