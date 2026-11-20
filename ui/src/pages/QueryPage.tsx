import { useEffect, useState } from 'react';
import { invoke } from '../api/client';
import { ActionBar, Glyph } from '../components/ActionBar';
import { DocumentList } from '../components/DocumentList';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage, type CollectionInfo, type DocumentView } from '../types';

interface QueryPageProps {
  profileId: string | null;
  collection: string | null;
  collections: CollectionInfo[];
  onOpenDocument: (id: string, collection?: string) => void;
  onStatus: (message: string) => void;
}

interface FilterRow {
  field: string;
  op: string;
  value: string;
}

const FILTER_OPS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'match',
  'matchPrefix',
  'contains',
  'startsWith',
  'in',
  'notIn',
  'arrayContains',
  'arrayContainsAny',
];

function parseValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}

function normalizeRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw as Record<string, unknown>[];
  }
  if (typeof raw === 'object' && raw !== null) {
    const source = raw as Record<string, unknown>;
    for (const key of ['rows', 'results', 'documents', 'items']) {
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        return candidate as Record<string, unknown>[];
      }
    }
  }
  return [];
}

export function QueryPage({ profileId, collection, collections, onOpenDocument, onStatus }: QueryPageProps) {
  const [collectionName, setCollectionName] = useState(collection ?? '');
  const [filters, setFilters] = useState<FilterRow[]>([{ field: '', op: 'eq', value: '' }]);
  const [orderBy, setOrderBy] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [select, setSelect] = useState('');
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [explainText, setExplainText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (collection) {
      setCollectionName(collection);
    }
  }, [collection]);

  function buildSpec(): Record<string, unknown> {
    const activeFilters = filters
      .filter((filter) => filter.field.trim() !== '')
      .map((filter) => ({
        field: filter.field.trim(),
        op: filter.op,
        value: parseValue(filter.value),
      }));
    const spec: Record<string, unknown> = {
      collection: collectionName.trim(),
      filters: activeFilters,
      limit,
      offset,
    };
    if (orderBy.trim()) {
      // Wire shape: Vec<OrderSpec> {field, ascending}; "name:desc" accepted.
      spec.order_by = orderBy
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .map((part) => {
          const [field, direction] = part.split(':');
          return {
            field: field.trim(),
            ascending: (direction ?? '').trim().toLowerCase() !== 'desc',
          };
        });
    }
    if (select.trim()) {
      spec.select = select
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
    }
    return spec;
  }

  function updateFilter(index: number, patch: Partial<FilterRow>) {
    setFilters((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeFilter(index: number) {
    setFilters((current) => current.filter((_, i) => i !== index));
  }

  async function runQuery() {
    if (!profileId || !collectionName.trim()) {
      setError('Open a database and choose a collection first.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await invoke<unknown>('query.run', {
        profileId,
        spec: buildSpec(),
      });
      setRawResult(result);
      onStatus(`Query returned ${normalizeRows(result).length} row(s).`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function explainQuery() {
    if (!profileId || !collectionName.trim()) {
      setError('Open a database and choose a collection first.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const report = await invoke<unknown>('query.explain', {
        profileId,
        spec: buildSpec(),
      });
      setExplainText(JSON.stringify(report, null, 2));
      onStatus('Query plan generated.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const rows = normalizeRows(rawResult);
  const documents: DocumentView[] = rows.map((row, index) => ({
    collection: typeof row.collection === 'string' ? row.collection : collectionName,
    id: typeof row.id === 'string' ? row.id : String(index),
    data: 'data' in row ? row.data : row,
  }));

  return (
    <div>
      <section className="page-section">
        <ActionBar
          label="Query actions"
          items={[
            { id: 'run', label: 'Run query', icon: <Glyph name="play" />, onClick: () => void runQuery(), disabled: busy, primary: true },
            { id: 'explain', label: 'Explain plan', icon: <Glyph name="info" />, onClick: () => void explainQuery(), disabled: busy },
          ]}
        />
        <div className="options-strip">
          <label className="option-field"><span>Collection</span><select className="field-select" value={collectionName} onChange={(event) => setCollectionName(event.target.value)}><option value="">Select</option>{collections.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
          <label className="option-field"><span>Order by</span><input className="field-input field-small" value={orderBy} placeholder="field or field:desc" onChange={(event) => setOrderBy(event.target.value)} /></label>
          <label className="option-field"><span>Select</span><input className="field-input field-small" value={select} placeholder="field1, field2" onChange={(event) => setSelect(event.target.value)} /></label>
          <label className="option-field"><span>Limit</span><input className="field-input field-number" type="number" min={0} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label>
          <label className="option-field"><span>Offset</span><input className="field-input field-number" type="number" min={0} value={offset} onChange={(event) => setOffset(Number(event.target.value))} /></label>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {!profileId && <div className="inline-note">Open a database first.</div>}
      </section>

      <section className="page-section">
        <h2 className="section-title">Filters</h2>
        <table className="datagrid">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Operator</th>
              <th scope="col">Value (JSON or text)</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.map((filter, index) => (
              <tr key={index}>
                <td>
                  <input
                    className="field-input field-small"
                    type="text"
                    value={filter.field}
                    placeholder="field"
                    onChange={(event) => updateFilter(index, { field: event.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="field-select"
                    value={filter.op}
                    onChange={(event) => updateFilter(index, { op: event.target.value })}
                  >
                    {FILTER_OPS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="field-input"
                    type="text"
                    value={filter.value}
                    placeholder='e.g. 5, "text", [1, 2]'
                    onChange={(event) => updateFilter(index, { value: event.target.value })}
                  />
                </td>
                <td>
                  <button type="button" className="button button-compact" onClick={() => removeFilter(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {filters.length === 0 && (
              <tr>
                <td className="datagrid-empty" colSpan={4}>
                  No filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="field-row">
          <button type="button" className="button" onClick={() => setFilters((current) => [...current, { field: '', op: 'eq', value: '' }])}>
            Add filter
          </button>
        </div>
      </section>

      <section className="page-section">
        <div className="panel">
          <div className="panel-header">Results</div>
          <div className="panel-body">
            <DocumentList
              documents={documents}
              onOpenDocument={(id) => onOpenDocument(id, collectionName)}
              onStatus={onStatus}
              title="Results"
              busy={busy}
            />
          </div>
        </div>
      </section>

      {explainText !== '' && (
        <section className="page-section">
          <div className="panel">
            <div className="panel-header">Explain report</div>
            <div className="panel-body">
              <div className="json-view">
                <JsonEditor value={explainText} onChange={() => undefined} readOnly />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
