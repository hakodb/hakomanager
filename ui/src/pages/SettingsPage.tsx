import { useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar, Glyph } from '../components/ActionBar';
import {
  isAutoUpdateEnabled,
  setAutoUpdateEnabled,
  UpdatePrompt,
  useUpdater,
} from '../updater';

interface SettingsPageProps {
  profileId: string | null;
  collections: string[];
  onStatus: (message: string) => void;
  onRefresh?: () => void;
}

export function SettingsPage({ profileId, collections, onStatus, onRefresh }: SettingsPageProps) {
  const updater = useUpdater();
  const [auto, setAuto] = useState(isAutoUpdateEnabled);
  const [backupPath, setBackupPath] = useState('');
  const [restoreCollection, setRestoreCollection] = useState('');
  const [restoreId, setRestoreId] = useState('');
  const [compactCollection, setCompactCollection] = useState('');
  const [vacuumCollection, setVacuumCollection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleAuto(enabled: boolean) {
    setAuto(enabled);
    setAutoUpdateEnabled(enabled);
    onStatus(enabled ? 'Startup update check enabled.' : 'Startup update check disabled.');
  }

  async function run(op: string, args: Record<string, unknown>, message: string) {
    if (!profileId) {
      setError('Open a database first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await invoke<unknown>(op, { profileId, ...args });
      onStatus(`${message}${result ? `: ${JSON.stringify(result)}` : ''}.`);
      onRefresh?.();
    } catch (caught) {
      setError(`${op}: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {!profileId && <div className="inline-note">Open a database to use maintenance actions.</div>}

      <section className="page-section">
        <h2 className="section-title">Database maintenance</h2>
        <ActionBar
          label="Maintenance"
          items={[
            { id: 'flush', label: 'Flush WAL', icon: <Glyph name="save" />, onClick: () => void run('ops.flush', {}, 'Flushed'), disabled: busy || !profileId },
            { id: 'backup', label: 'Backup', icon: <Glyph name="download" />, onClick: () => void run('ops.backup', { path: backupPath.trim() }, 'Backup created'), disabled: busy || !profileId || !backupPath.trim() },
            { id: 'restore', label: 'Restore doc', icon: <Glyph name="upload" />, onClick: () => void run('ops.restore', { collection: restoreCollection.trim(), id: restoreId.trim() }, 'Restored'), disabled: busy || !profileId || !restoreCollection.trim() || !restoreId.trim() },
            { id: 'compact', label: 'Compact', icon: <Glyph name="layers" />, onClick: () => void run('ops.compact', compactCollection.trim() ? { collection: compactCollection.trim() } : {}, 'Compacted'), disabled: busy || !profileId },
            { id: 'vacuum', label: 'Vacuum', icon: <Glyph name="refresh" />, onClick: () => void run('ops.vacuum', vacuumCollection.trim() ? { collection: vacuumCollection.trim() } : {}, 'Vacuumed'), disabled: busy || !profileId },
          ]}
        />
        <div className="options-strip">
          <label className="option-field option-field-grow"><span>Backup path</span><input className="field-input" value={backupPath} placeholder="/path/to/backup" onChange={(event) => setBackupPath(event.target.value)} /></label>
          <label className="option-field"><span>Compact collection</span><select className="field-select" value={compactCollection} onChange={(event) => setCompactCollection(event.target.value)}><option value="">All</option>{collections.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="option-field"><span>Vacuum collection</span><select className="field-select" value={vacuumCollection} onChange={(event) => setVacuumCollection(event.target.value)}><option value="">All</option>{collections.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
        <div className="options-strip">
          <label className="option-field"><span>Restore collection</span><select className="field-select" value={restoreCollection} onChange={(event) => setRestoreCollection(event.target.value)}><option value="">Select</option>{collections.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="option-field"><span>Document id</span><input className="field-input field-small" value={restoreId} placeholder="id" onChange={(event) => setRestoreId(event.target.value)} /></label>
        </div>
        <div className="action-bar" role="toolbar" aria-label="Inspection">
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.stats', {}, 'Stats')}>Stats</button>
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.quiescence', {}, 'Quiescence')}>Quiescence</button>
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.audit', {}, 'Audit')}>Audit</button>
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.versions', {}, 'Versions')}>Versions</button>
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.restoreAvailable', restoreCollection.trim() ? { collection: restoreCollection.trim() } : {}, 'Restore queue')}>Deleted queue</button>
          <button type="button" className="action-button" disabled={busy || !profileId} onClick={() => void run('ops.sweep', {}, 'Swept')}>Sweep</button>
        </div>
        <div className="inline-note">Destructive operations (compact, vacuum) snapshot the database first.</div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Updates</h2>
        <label className="field-checkbox">
          <input type="checkbox" checked={auto} onChange={(event) => toggleAuto(event.target.checked)} />
          Check for updates when the app starts
        </label>
        <div className="field-row">
          <span className="field-label">Installed</span>
          <span>{updater.current || '…'}</span>
          {updater.update && <span className="inline-note">Available: {updater.update.version}</span>}
        </div>
        <div className="field-row">
          <button type="button" className="button button-primary" disabled={updater.checking || updater.installing} onClick={() => void updater.checkNow()}>
            {updater.checking ? 'Checking…' : 'Check now'}
          </button>
          {updater.update && (
            <button type="button" className="button" disabled={updater.installing} onClick={() => updater.setPromptOpen(true)}>
              Install {updater.update.version}
            </button>
          )}
        </div>
        {updater.error && <div className="inline-note">{updater.error}</div>}
      </section>

      <UpdatePrompt
        open={updater.promptOpen}
        onClose={() => updater.setPromptOpen(false)}
        version={updater.update?.version ?? ''}
        current={updater.current}
        progress={updater.progress}
        installing={updater.installing}
        onInstall={() => void updater.install()}
      />
    </div>
  );
}
