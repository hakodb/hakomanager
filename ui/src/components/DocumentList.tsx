import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from './DataGrid';
import type { DocumentView } from '../types';

interface DocumentListProps {
  documents: DocumentView[];
  onOpenDocument: (id: string, collection?: string) => void;
  onStatus?: (message: string) => void;
  title?: string;
  busy?: boolean;
}

type ViewMode = 'table' | 'standard' | 'raw';
type FilterOp = 'contains' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

const FILTER_OPS: FilterOp[] = ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'];

function dataObject(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function fieldValue(document: DocumentView, field: string): unknown {
  if (field === 'id') return document.id;
  if (field === 'collection') return document.collection;
  const object = dataObject(document.data);
  return object ? object[field] : field === 'data' ? document.data : undefined;
}

function fieldsOf(documents: DocumentView[]): string[] {
  const fields = new Set<string>(['id']);
  for (const document of documents.slice(0, 200)) {
    const object = dataObject(document.data);
    if (object) {
      for (const key of Object.keys(object)) {
        if (!key.includes('.')) fields.add(key);
      }
    }
  }
  return [...fields];
}

function parseFilterValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function compare(value: unknown, op: FilterOp, expected: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (op === 'contains') {
    return String(value).toLowerCase().includes(String(expected).toLowerCase());
  }
  if (typeof value === 'number' && typeof expected === 'number') {
    switch (op) {
      case 'eq': return value === expected;
      case 'ne': return value !== expected;
      case 'gt': return value > expected;
      case 'gte': return value >= expected;
      case 'lt': return value < expected;
      case 'lte': return value <= expected;
    }
  }
  const left = String(value);
  const right = String(expected);
  switch (op) {
    case 'eq': return left === right;
    case 'ne': return left !== right;
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
  }
}

function cellText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocumentList({
  documents,
  onOpenDocument,
  onStatus,
  title = 'Documents',
  busy = false,
}: DocumentListProps) {
  const [mode, setMode] = useState<ViewMode>('table');
  const [filterField, setFilterField] = useState('');
  const [filterOp, setFilterOp] = useState<FilterOp>('contains');
  const [filterValue, setFilterValue] = useState('');

  const fields = useMemo(() => fieldsOf(documents), [documents]);
  // shortcut: field filters run on the loaded page only (the 50/100-doc
  // window the caller fetched), not a full engine query; switch to
  // query.run with FilterSpec when filtering the whole collection is needed.
  const filtered = useMemo(() => {
    if (!filterField || !filterValue) return documents;
    const expected = parseFilterValue(filterValue);
    return documents.filter((document) =>
      compare(fieldValue(document, filterField), filterOp, expected),
    );
  }, [documents, filterField, filterOp, filterValue]);

  const tableRows = useMemo(
    () =>
      filtered.map((document) => {
        const row: Record<string, unknown> = { id: document.id };
        for (const field of fields) {
          if (field !== 'id') row[field] = fieldValue(document, field);
        }
        return row;
      }),
    [filtered, fields],
  );
  const standardRows = useMemo(
    () =>
      filtered.map((document) => ({
        id: document.id,
        data: JSON.stringify(document.data),
      })),
    [filtered],
  );
  const tableColumns: DataGridColumn[] = fields.map((field) => ({ key: field, label: field }));
  const standardColumns: DataGridColumn[] = [
    { key: 'id', label: 'ID' },
    { key: 'data', label: 'Data' },
  ];

  function exportAs(format: 'json' | 'csv') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const collection = documents[0]?.collection ?? 'documents';
    if (format === 'json') {
      download(`${collection}-${stamp}.json`, 'application/json', JSON.stringify(filtered, null, 2));
    } else {
      const header = ['id', ...fields.filter((field) => field !== 'id')];
      const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
      const lines = [
        header.join(','),
        ...filtered.map((document) =>
          header.map((field) => escape(cellText(fieldValue(document, field)))).join(','),
        ),
      ];
      download(`${collection}-${stamp}.csv`, 'text/csv', lines.join('\n'));
    }
    onStatus?.(`Exported ${filtered.length} document(s) as ${format.toUpperCase()}.`);
  }

  return (
    <div className="document-list">
      <div className="panel-header">{title}</div>
      <div className="document-list-controls field-row">
        <span className="field-label">View</span>
        <select
          className="field-select"
          value={mode}
          aria-label="Document view mode"
          onChange={(event) => setMode(event.target.value as ViewMode)}
        >
          <option value="table">Table</option>
          <option value="standard">Standard</option>
          <option value="raw">Raw JSON</option>
        </select>
        <span className="field-label">Field</span>
        <select
          className="field-select"
          value={filterField}
          aria-label="Filter field"
          onChange={(event) => setFilterField(event.target.value)}
        >
          <option value="">All</option>
          {fields.map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
        <select
          className="field-select"
          value={filterOp}
          aria-label="Filter operator"
          onChange={(event) => setFilterOp(event.target.value as FilterOp)}
        >
          {FILTER_OPS.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
        <input
          className="field-input field-small"
          value={filterValue}
          placeholder="filter value"
          aria-label="Filter value"
          onChange={(event) => setFilterValue(event.target.value)}
        />
        <button type="button" className="button button-compact" onClick={() => exportAs('json')}>
          Export JSON
        </button>
        <button type="button" className="button button-compact" onClick={() => exportAs('csv')}>
          Export CSV
        </button>
        <span className="document-list-count">
          {filtered.length === documents.length
            ? `${documents.length} doc${documents.length === 1 ? '' : 's'}`
            : `${filtered.length} / ${documents.length} docs`}
          {busy ? ' · loading…' : ''}
        </span>
      </div>
      <div className="grid-scroll document-list-grid">
        {mode === 'table' && (
          <DataGrid
            columns={tableColumns}
            rows={tableRows}
            onRowClick={(row) => onOpenDocument(String(row.id))}
          />
        )}
        {mode === 'standard' && (
          <DataGrid
            columns={standardColumns}
            rows={standardRows}
            onRowClick={(row) => onOpenDocument(String(row.id))}
          />
        )}
        {mode === 'raw' &&
          filtered.map((document, index) => (
            <pre
              key={`${document.id}-${index}`}
              className="document-raw datagrid-row-clickable"
              title="Click to edit"
              onClick={() => onOpenDocument(document.id)}
            >
              {JSON.stringify(document, null, 2)}
            </pre>
          ))}
        {filtered.length === 0 && (
          <div className="inline-note">No documents match this filter.</div>
        )}
      </div>
    </div>
  );
}
