import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar } from '../components/ActionBar';
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

export function OpsPage({ profileId, collection, collections, onStatus }: OpsPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [field, setField] = useState('');
  const [schemaText, setSchemaText] = useState('{}');
  const [rules, setRules] = useState<Rule[]>([
    { collectionPrefix: '', op: 'get', allow: true },
  ]);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (collection) setCollectionName(collection);
  }, [collection]);

  async function run(key: string, op: string, args: Record<string, unknown>) {
    if (!profileId) {
      setErrors((current) => ({ ...current, global: 'Open a database first.' }));
      return;
    }
    setActive(key);
    setBusy(true);
    setErrors((current) => ({ ...current, [key]: '', global: '' }));
    try {
      const result = await invoke<unknown>(op, { profileId, ...args });
      setResults((current) => ({ ...current, [key]: result }));
      onStatus(`${op} completed.`);
    } catch (caught) {
      setErrors((current) => ({ ...current, [key]: errorMessage(caught) }));
    } finally {
      setBusy(false);
    }
  }

  function collectionArgs(): Record<string, unknown> {
    const name = collectionName.trim();
    return name ? { collection: name } : {};
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
    await run('schemaSet', 'ops.schemaSet', { ...collectionArgs(), schema });
  }

  async function applyRules() {
    const clean = rules
      .filter((rule) => rule.collectionPrefix.trim() !== '')
      .map((rule) => ({ collectionPrefix: rule.collectionPrefix.trim(), op: rule.op, allow: rule.allow }));
    if (clean.length === 0) {
      setErrors((current) => ({ ...current, securitySet: 'Add at least one rule.' }));
      return;
    }
    await run('securitySet', 'ops.securitySet', { rules: clean });
  }

  const actions = [
    { id: 'schemaList', label: 'Schema', icon: 'layers' as const, onClick: () => void run('schemaList', 'ops.schemaList', {}) },
    { id: 'schemaSet', label: 'Set schema', icon: 'plus' as const, onClick: () => void setSchema() },
    { id: 'schemaClear', label: 'Clear schema', icon: 'minus' as const, onClick: () => void run('schemaClear', 'ops.schemaClear', collectionArgs()) },
    { id: 'inspectIndex', label: 'Inspect index', icon: 'info' as const, onClick: () => void run('inspectIndex', 'ops.inspectIndex', { ...collectionArgs(), field: field.trim() }) },
    { id: 'storageKeys', label: 'Storage keys', icon: 'layers' as const, onClick: () => void run('storageKeys', 'ops.storageKeys', collectionArgs()) },
    { id: 'snapshotIndexes', label: 'Snapshot', icon: 'save' as const, onClick: () => void run('snapshotIndexes', 'ops.snapshotIndexes', {}) },
    { id: 'securitySet', label: 'Apply rules', icon: 'settings' as const, onClick: () => void applyRules() },
  ].map((item) => ({ ...item, disabled: busy || !profileId, active: active === item.id }));

  return (
    <div>
      {errors.global && <div className="inline-error">{errors.global}</div>}
      {!profileId && <div className="inline-note">Open a database first.</div>}
      <section className="page-section">
        <div className="options-strip">
          <label className="option-field"><span>Collection</span><input className="field-input field-small" list="ops-collections" value={collectionName} placeholder="defaults to all" onChange={(event) => setCollectionName(event.target.value)} /></label>
          <label className="option-field"><span>Field</span><input className="field-input field-small" value={field} placeholder="Field name" onChange={(event) => setField(event.target.value)} /></label>
        </div>
        <datalist id="ops-collections">
          {collections.map((item) => <option key={item.name} value={item.name} />)}
        </datalist>
        <ActionBar label="Investigation" items={actions} />
        <details className="advanced-options">
          <summary>Schema JSON and security rules</summary>
          <div className="editor-pane"><JsonEditor value={schemaText} onChange={setSchemaText} /></div>
          <div className="grid-scroll">
            <table className="datagrid">
              <thead><tr><th scope="col">Collection prefix</th><th scope="col">Operation</th><th scope="col">Allow</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr key={index}>
                    <td><input className="field-input field-small" value={rule.collectionPrefix} placeholder="docs/" onChange={(event) => setRules((current) => current.map((item, i) => (i === index ? { ...item, collectionPrefix: event.target.value } : item)))} /></td>
                    <td><select className="field-select" value={rule.op} onChange={(event) => setRules((current) => current.map((item, i) => (i === index ? { ...item, op: event.target.value } : item)))}>{RULE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}</select></td>
                    <td><label className="field-checkbox"><input type="checkbox" checked={rule.allow} onChange={(event) => setRules((current) => current.map((item, i) => (i === index ? { ...item, allow: event.target.checked } : item)))} /> Allow</label></td>
                    <td><button type="button" className="button button-compact" onClick={() => setRules((current) => current.filter((_, i) => i !== index))}>Remove</button></td>
                  </tr>
                ))}
                {rules.length === 0 && <tr><td className="datagrid-empty" colSpan={4}>No rules</td></tr>}
              </tbody>
            </table>
          </div>
          <button type="button" className="button" onClick={() => setRules((current) => [...current, { collectionPrefix: '', op: 'get', allow: true }])}>Add rule</button>
        </details>
      </section>
      {active && (
        <section className="page-section">
          <div className="panel">
            <div className="panel-header">ops.{active}</div>
            <div className="panel-body">
              {errors[active] && <div className="inline-error">{errors[active]}</div>}
              <div className="json-view"><JsonEditor value={pretty(results[active])} onChange={() => undefined} readOnly /></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
