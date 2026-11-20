import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '../api/client';
import { Glyph } from '../components/ActionBar';
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
  const [encryptionKey, setEncryptionKey] = useState('');
  const [encryptedCollections, setEncryptedCollections] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshDatabases();
  }, [refreshDatabases]);

  async function browsePath() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select a HakoDB database directory',
      });
      if (typeof selected === 'string' && selected) {
        setPath(selected);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

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
        // Encryption keys are never persisted; this lives only in the open
        // engine session.
        ...(encryptionKey.trim() ? { encryptionKey: encryptionKey.trim() } : {}),
        ...(encryptedCollections.trim() ? { encryptedCollections: encryptedCollections.trim() } : {}),
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
      setEncryptionKey('');
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
          <button type="button" className="button" title="Browse for a directory" aria-label="Browse" onClick={() => void browsePath()}>
            <Glyph name="layers" /> Browse
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void handleOpen()}>
            Open
          </button>
          <label className="field-checkbox">
            <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
            Open read-only
          </label>
        </div>
        <div className="field-row">
          <span className="field-label">Encryption key</span>
          <input
            className="field-input"
            type="password"
            value={encryptionKey}
            placeholder="optional - only for encrypted databases"
            onChange={(event) => setEncryptionKey(event.target.value)}
          />
        </div>
        {error && <div className="inline-error">{error}</div>}
        <div className="field-row">
          <span className="field-label">Encrypted collections</span>
          <input
            className="field-input"
            type="text"
            value={encryptedCollections}
            placeholder="e.g. app_state, secrets (leave empty to apply key to all)"
            onChange={(event) => setEncryptedCollections(event.target.value)}
          />
        </div>
        <div className="inline-note">
          Click a database row to make it the active profile for the other pages. The encryption
          key is kept in memory for this session only and is never stored.
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
                      {db.shared ? ' [shared: another instance holds this directory]' : ''}
                      {db.encryption_configured ? ' [encrypted]' : ''}
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
