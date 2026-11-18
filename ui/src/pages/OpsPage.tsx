import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo } from '../types';

interface OpsPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

interface Rule {
  collectionPrefix: string;
  op: string;
  allow: boolean;
}

const RULE_OPS = ['get', 'put', 'delete', 'query', 'batch'];

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

interface ResultPanelProps {
  title: string;
  value: unknown;
  error?: string;
  onRefresh?: () => void;
}

function ResultPanel({ title, value, error, onRefresh }: ResultPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title}</span>
        {onRefresh && (
          <button type="button" className="button button-compact" onClick={onRefresh}>
            Refresh
          </button>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="inline-error">{error}</div>}
        <div className="json-view">
          <JsonEditor value={pretty(value)} onChange={() => undefined} readOnly />
        </div>
      </div>
    </div>
  );
}

export function OpsPage({ profileId, collection, collections, onStatus }: OpsPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [field, setField] = useState('');
  const [schemaText, setSchemaText] = useState('{}');
  const [restoreId, setRestoreId] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [rules, setRules] = useState<Rule[]>([
    { collectionPrefix: '', op: 'get', allow: true },
  ]);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (collection) {
      setCollectionName(collection);
    }
  }, [collection]);

  function requireProfile(): boolean {
    if (!profileId) {
      const message = 'Open a database on the Workspace tab first.';
      setErrors((current) => ({ ...current, global: message }));
      return false;
    }
    return true;
  }

  async function run(key: string, op: string, args: Record<string, unknown>) {
    if (!requireProfile()) {
      return;
    }
    setBusy(true);
    setErrors((current) => ({ ...current, [key]: '', global: '' }));
    try {
      const result = await invoke<unknown>(op, args);
      setResults((current) => ({ ...current, [key]: result }));
      onStatus(`${op} completed.`);
    } catch (caught) {
      setErrors((current) => ({ ...current, [key]: errorMessage(caught) }));
    } finally {
      setBusy(false);
    }
  }

  function withOptionalCollection(): Record<string, unknown> {
    const args: Record<string, unknown> = { profileId };
    const name = collectionName.trim();
    if (name) {
      args.collection = name;
    }
    return args;
  }

  function setCollectionArg(args: Record<string, unknown>): boolean {
    const name = collectionName.trim();
    if (!name) {
      setErrors((current) => ({
        ...current,
        global: 'Enter a collection name (or select one from the sidebar).',
      }));
      return false;
    }
    args.collection = name;
    return true;
  }

  async function setSchema() {
    let schema: unknown;
    try {
      schema = JSON.parse(schemaText) as unknown;
    } catch (caught) {
      setErrors((current) => ({ ...current, schemaSet: `Invalid JSON: ${errorMessage(caught)}` }));
      return;
    }
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      setErrors((current) => ({ ...current, schemaSet: 'Schema must be a JSON object.' }));
      return;
    }
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    args.schema = schema;
    await run('schemaSet', 'ops.schemaSet', args);
  }

  async function clearSchema() {
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    await run('schemaClear', 'ops.schemaClear', args);
  }

  async function restore() {
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    const id = restoreId.trim();
    if (!id) {
      setErrors((current) => ({ ...current, restore: 'Enter a document id to restore.' }));
      return;
    }
    args.id = id;
    await run('restore', 'ops.restore', args);
  }

  async function inspectIndex() {
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    if (!field.trim()) {
      setErrors((current) => ({ ...current, inspectIndex: 'Enter a field to inspect.' }));
      return;
    }
    args.field = field.trim();
    await run('inspectIndex', 'ops.inspectIndex', args);
  }

  async function storageKeys() {
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    await run('storageKeys', 'ops.storageKeys', args);
  }

  async function vacuum() {
    const args: Record<string, unknown> = { profileId };
    if (!setCollectionArg(args)) {
      return;
    }
    if (!window.confirm(`Vacuum collection "${collectionName.trim()}"? This may take a while.`)) {
      return;
    }
    await run('vacuum', 'ops.vacuum', args);
  }

  async function backup() {
    const path = backupPath.trim();
    if (!path) {
      setErrors((current) => ({ ...current, backup: 'Enter a destination path for the backup.' }));
      return;
    }
    if (!window.confirm(`Create a backup at "${path}"?`)) {
      return;
    }
    await run('backup', 'ops.backup', { profileId, path });
  }

  async function setSecurityRules() {
    const cleanRules = rules
      .filter((rule) => rule.collectionPrefix.trim() !== '')
      .map((rule) => ({
        collectionPrefix: rule.collectionPrefix.trim(),
        op: rule.op,
        allow: rule.allow,
      }));
    if (cleanRules.length === 0) {
      setErrors((current) => ({
        ...current,
        securitySet: 'Add at least one rule with a collection prefix.',
      }));
      return;
    }
    await run('securitySet', 'ops.securitySet', { profileId, rules: cleanRules });
  }

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index));
  }

  const panel = (
    key: string,
    title: string,
    refresh?: { op: string; args: () => Record<string, unknown> }
  ) => (
    <ResultPanel
      title={title}
      value={results[key]}
      error={errors[key]}
      onRefresh={refresh ? () => void run(key, refresh.op, refresh.args()) : undefined}
    />
  );

  return (
    <div>
      <datalist id="ops-collections">
        {collections.map((item) => (
          <option key={item.name} value={item.name} />
        ))}
      </datalist>
      {errors.global && <div className="inline-error">{errors.global}</div>}
      {!profileId && (
        <div className="inline-note">Open a database on the Workspace tab to run operations.</div>
      )}
      {busy && <div className="inline-note">Working...</div>}

      <section className="page-section">
        <h2 className="section-title">Target collection</h2>
        <div className="field-row">
          <span className="field-label">Collection</span>
          <input
            className="field-input field-small"
            type="text"
            list="ops-collections"
            value={collectionName}
            placeholder="Collection name"
            onChange={(event) => setCollectionName(event.target.value)}
          />
          <span className="field-label">Field</span>
          <input
            className="field-input field-small"
            type="text"
            value={field}
            placeholder="Field name"
            onChange={(event) => setField(event.target.value)}
          />
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Quiescence and stats</h2>
        <div className="two-column">
          <ResultPanel
            title="ops.quiescence"
            value={results.quiescence}
            error={errors.quiescence}
            onRefresh={() => void run('quiescence', 'ops.quiescence', { profileId })}
          />
          <ResultPanel
            title="ops.stats"
            value={results.stats}
            error={errors.stats}
            onRefresh={() => void run('stats', 'ops.stats', { profileId })}
          />
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Schema</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={busy} onClick={() => void run('schemaList', 'ops.schemaList', { profileId })}>
            Refresh schema list
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void setSchema()}>
            Set schema
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void clearSchema()}>
            Clear schema
          </button>
        </div>
        {errors.schemaSet && <div className="inline-error">{errors.schemaSet}</div>}
        {errors.schemaClear && <div className="inline-error">{errors.schemaClear}</div>}
        <div className="editor-pane">
          <JsonEditor value={schemaText} onChange={setSchemaText} />
        </div>
        {panel('schemaList', 'ops.schemaList', {
          op: 'ops.schemaList',
          args: () => ({ profileId }),
        })}
      </section>

      <section className="page-section">
        <h2 className="section-title">Audit</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={busy} onClick={() => void run('audit', 'ops.audit', { profileId })}>
            Refresh audit
          </button>
        </div>
        {panel('audit', 'ops.audit', { op: 'ops.audit', args: () => ({ profileId }) })}
      </section>

      <section className="page-section">
        <h2 className="section-title">Soft delete</h2>
        <div className="field-row">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void run('restoreAvailable', 'ops.restoreAvailable', withOptionalCollection())}
          >
            Restore available
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void run('deleteQueue', 'ops.deleteQueue', withOptionalCollection())}
          >
            Delete queue
          </button>
          <span className="field-label">Id</span>
          <input
            className="field-input field-small"
            type="text"
            value={restoreId}
            placeholder="Document id to restore"
            onChange={(event) => setRestoreId(event.target.value)}
          />
          <button type="button" className="button" disabled={busy} onClick={() => void restore()}>
            Restore
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void run('sweep', 'ops.sweep', { profileId })}>
            Sweep
          </button>
        </div>
        {errors.restore && <div className="inline-error">{errors.restore}</div>}
        <div className="two-column">
          {panel('restoreAvailable', 'ops.restoreAvailable', {
            op: 'ops.restoreAvailable',
            args: withOptionalCollection,
          })}
          {panel('deleteQueue', 'ops.deleteQueue', {
            op: 'ops.deleteQueue',
            args: withOptionalCollection,
          })}
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Index inspection</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={busy} onClick={() => void inspectIndex()}>
            Inspect index
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void storageKeys()}>
            Storage keys
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void run('snapshotIndexes', 'ops.snapshotIndexes', { profileId })}>
            Snapshot indexes
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void run('versions', 'ops.versions', { profileId })}>
            Versions
          </button>
        </div>
        {errors.inspectIndex && <div className="inline-error">{errors.inspectIndex}</div>}
        <div className="two-column">
          {panel('inspectIndex', 'ops.inspectIndex')}
          {panel('storageKeys', 'ops.storageKeys', {
            op: 'ops.storageKeys',
            args: withOptionalCollection,
          })}
          {panel('snapshotIndexes', 'ops.snapshotIndexes', {
            op: 'ops.snapshotIndexes',
            args: () => ({ profileId }),
          })}
          {panel('versions', 'ops.versions', {
            op: 'ops.versions',
            args: () => ({ profileId }),
          })}
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Security rules</h2>
        <div className="grid-scroll">
          <table className="datagrid">
            <thead>
              <tr>
                <th scope="col">Collection prefix</th>
                <th scope="col">Operation</th>
                <th scope="col">Allow</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="field-input field-small"
                      type="text"
                      value={rule.collectionPrefix}
                      placeholder="docs/"
                      onChange={(event) => updateRule(index, { collectionPrefix: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="field-select"
                      value={rule.op}
                      onChange={(event) => updateRule(index, { op: event.target.value })}
                    >
                      {RULE_OPS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="field-checkbox">
                      <input
                        type="checkbox"
                        checked={rule.allow}
                        onChange={(event) => updateRule(index, { allow: event.target.checked })}
                      />
                      Allow
                    </label>
                  </td>
                  <td>
                    <button type="button" className="button button-compact" onClick={() => removeRule(index)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td className="datagrid-empty" colSpan={4}>
                    No rules
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="field-row">
          <button
            type="button"
            className="button"
            onClick={() => setRules((current) => [...current, { collectionPrefix: '', op: 'get', allow: true }])}
          >
            Add rule
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void setSecurityRules()}>
            Set rules
          </button>
        </div>
        {errors.securitySet && <div className="inline-error">{errors.securitySet}</div>}
        {panel('securitySet', 'ops.securitySet')}
      </section>

      <section className="page-section">
        <h2 className="section-title">Maintenance</h2>
        <div className="field-row">
          <button type="button" className="button" disabled={busy} onClick={() => void run('flush', 'ops.flush', { profileId })}>
            Flush
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void run('compact', 'ops.compact', withOptionalCollection())}
          >
            Compact
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void vacuum()}>
            Vacuum
          </button>
        </div>
        <div className="field-row">
          <span className="field-label">Backup path</span>
          <input
            className="field-input"
            type="text"
            value={backupPath}
            placeholder="/path/to/backup.zip"
            onChange={(event) => setBackupPath(event.target.value)}
          />
          <button type="button" className="button" disabled={busy} onClick={() => void backup()}>
            Backup
          </button>
        </div>
        {errors.vacuum && <div className="inline-error">{errors.vacuum}</div>}
        {errors.backup && <div className="inline-error">{errors.backup}</div>}
        <div className="inline-note">
          Compact without a collection name targets all collections. Vacuum and backup ask for confirmation.
        </div>
        <div className="two-column">
          {panel('flush', 'ops.flush', { op: 'ops.flush', args: () => ({ profileId }) })}
          {panel('compact', 'ops.compact', {
            op: 'ops.compact',
            args: withOptionalCollection,
          })}
          {panel('vacuum', 'ops.vacuum')}
          {panel('backup', 'ops.backup')}
        </div>
      </section>
    </div>
  );
}
