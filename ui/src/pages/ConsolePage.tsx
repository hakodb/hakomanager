import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { DocumentList } from '../components/DocumentList';
import {
  errorMessage,
  loadConsoleState,
  saveConsoleState,
  type CollectionInfo,
  type DocumentView,
} from '../types';

interface ConsolePageProps {
  profileId: string | null;
  collections: CollectionInfo[];
  onOpenDocument: (id: string, collection?: string) => void;
  onStatus: (message: string) => void;
}

interface Suggestion {
  label: string;
  detail: string;
  insert: string;
}

const METHODS: Suggestion[] = [
  { label: 'where', detail: 'filter: where(field,op,value)', insert: 'where(field,eq,value)' },
  { label: 'or', detail: 'OR-group: or(field,op,value;field,op,value)', insert: 'or(field,eq,value;field,eq,value)' },
  { label: 'orderBy', detail: 'sort: orderBy(field[:asc|desc])', insert: 'orderBy(field:desc)' },
  { label: 'limit', detail: 'max rows', insert: 'limit(10)' },
  { label: 'offset', detail: 'skip rows', insert: 'offset(0)' },
  { label: 'select', detail: 'projection: select(f1,f2)', insert: 'select(name,price)' },
  { label: 'count', detail: 'aggregate count', insert: 'count()' },
  { label: 'sum', detail: 'aggregate sum(field)', insert: 'sum(field)' },
  { label: 'avg', detail: 'aggregate avg(field)', insert: 'avg(field)' },
  { label: 'min', detail: 'aggregate min(field)', insert: 'min(field)' },
  { label: 'max', detail: 'aggregate max(field)', insert: 'max(field)' },
  { label: 'explain', detail: 'query plan', insert: 'explain()' },
];

const BARE: Suggestion[] = [
  { label: 'collections', detail: 'list collections with stats', insert: 'collections' },
  { label: 'docs', detail: 'docs <collection> [limit]', insert: 'docs ' },
  { label: 'get', detail: 'get <collection> <id>', insert: 'get ' },
  { label: 'put', detail: 'put <collection> <id> <json>', insert: 'put ' },
  { label: 'del', detail: 'del <collection> <id> [force]', insert: 'del ' },
  { label: 'indexes', detail: 'indexes [collection]', insert: 'indexes' },
  { label: 'ops', detail: 'engine stats', insert: 'ops' },
  { label: 'schema', detail: 'schema <collection> [set <json>]', insert: 'schema ' },
  { label: 'audit', detail: 'audit log tail', insert: 'audit' },
  { label: 'versions', detail: 'version history', insert: 'versions' },
  { label: 'compact', detail: 'compact [collection] (auto-backup first)', insert: 'compact' },
  { label: 'vacuum', detail: 'vacuum <collection> (auto-backup first)', insert: 'vacuum ' },
  { label: 'flush', detail: 'flush WAL', insert: 'flush' },
  { label: 'backup', detail: 'backup <path>', insert: 'backup ' },
  { label: 'search', detail: 'search <collection> <field> <jsonVector> [k]', insert: 'search ' },
];

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'match', 'matchPrefix', 'contains', 'startsWith', 'in', 'notIn', 'arrayContains', 'arrayContainsAny'];
const LAST_KEY = 'hakomanager.console.last';

export function ConsolePage({ profileId, collections, onOpenDocument, onStatus }: ConsolePageProps) {
  const [input, setInput] = useState(() => loadConsoleState().input);
  // Only the last result is kept; no command history list.
  const [result, setResult] = useState<unknown>(() => loadConsoleState().rows[0]?.result);
  const [busy, setBusy] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Persist the last result with an empty history array (no history UI).
    const timer = window.setTimeout(() => saveConsoleState(input, []), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const caret = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const chain = /\.(\w*)$/.exec(before);
    if (chain) {
      return METHODS.filter((item) => item.label.toLowerCase().startsWith(chain[1].toLowerCase()));
    }
    const args = /\.(where|or)\(([^()]*)$/.exec(before);
    if (args) {
      const parts = args[2].split(',');
      if (parts.length <= 1) {
        const words = new Set<string>();
        for (const item of collections) {
          for (const word of item.name.split(/[^a-zA-Z0-9]+/)) if (word) words.add(word.toLowerCase());
        }
        return ['id', 'name', 'price', 'created_at', ...words]
          .filter((field) => field.toLowerCase().startsWith(parts[0].trim().toLowerCase()))
          .map((field) => ({ label: field, detail: 'field', insert: field }));
      }
      if (parts.length === 2) {
        return OPS.filter((op) => op.startsWith(parts[1].trim().toLowerCase()))
          .map((op) => ({ label: op, detail: 'operator', insert: op }));
      }
      return [];
    }
    const start = /^(\w*)$/.exec(before.trimStart());
    if (start && !before.includes('.') && !before.includes(' ')) {
      const pool = [...BARE, ...collections.map((item) => ({
        label: item.name,
        detail: `collection (${item.doc_count} docs)`,
        insert: `${item.name}.`,
      }))];
      return pool.filter((item) => item.label.toLowerCase().startsWith(start[1].toLowerCase()));
    }
    return [];
  }, [input, collections]);

  const suggestionOpen = suggestions.length > 0 && input.trim().length > 0;

  function acceptSuggestion(suggestion: Suggestion) {
    const caret = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const next = /\.(\w*)$/.test(before)
      ? before.replace(/\.(\w*)$/, `.${suggestion.insert}`) + after
      : /(\w*)$/.test(before)
        ? before.replace(/(\w*)$/, suggestion.insert) + after
        : before + suggestion.insert + after;
    setInput(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function runCommand(command: string) {
    if (!profileId || !command.trim()) return;
    try {
      localStorage.setItem(LAST_KEY, command);
    } catch {
      // best effort
    }
    setBusy(true);
    try {
      const value = await invoke<unknown>('query.console', { profileId, input: command });
      setResult(value);
      onStatus(`console: ${command}`);
    } catch (caught) {
      setResult({ error: errorMessage(caught) });
      onStatus(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestion((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestion((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        acceptSuggestion(suggestions[Math.min(activeSuggestion, suggestions.length - 1)]);
        setActiveSuggestion(0);
        return;
      }
      if (event.key === 'Escape') {
        setActiveSuggestion(0);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void runCommand(input.trim());
      return;
    }
    if (event.key === 'ArrowUp' && !suggestionOpen) {
      const last = localStorage.getItem(LAST_KEY);
      if (last) {
        event.preventDefault();
        setInput(last);
      }
    }
  }

  function renderResult(value: unknown): {
    documents: DocumentView[] | null;
    grid: Record<string, unknown>[] | null;
    columns: DataGridColumn[];
  } {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const objects = value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
      if (objects.every((row) => 'id' in row && 'data' in row)) {
        return {
          documents: objects.map((row) => ({
            collection: typeof row.collection === 'string' ? row.collection : '',
            id: String(row.id),
            data: row.data,
          })),
          grid: null,
          columns: [],
        };
      }
      return { documents: null, grid: objects, columns: Object.keys(objects[0]).map((key) => ({ key, label: key })) };
    }
    return { documents: null, grid: null, columns: [] };
  }

  const view = renderResult(result);

  return (
    <section className="page">
      <div className="page-section">
        <p className="page-hint">
          Fluent queries and commands. Tab completes, ↑ recalls the last command.
        </p>
        <div className="console-input-row">
          <input
            ref={inputRef}
            className="console-input"
            value={input}
            placeholder="Type a command…"
            onChange={(event) => {
              setInput(event.target.value);
              setActiveSuggestion(0);
            }}
            onKeyDown={onKeyDown}
            disabled={!profileId || busy}
            spellCheck={false}
          />
          <button
            type="button"
            className="button button-primary"
            onClick={() => void runCommand(input.trim())}
            disabled={!profileId || busy || !input.trim()}
          >
            Run
          </button>
        </div>
        {suggestionOpen && (
          <ul className="console-suggestions" role="listbox">
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.label}-${index}`}
                className={index === activeSuggestion ? 'suggestion-active' : ''}
                onMouseDown={(event) => {
                  event.preventDefault();
                  acceptSuggestion(suggestion);
                }}
              >
                <span className="suggestion-label">{suggestion.label}</span>
                <span className="suggestion-detail">{suggestion.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="console-result">
        {result === undefined && <p className="page-hint">Run a command to see results here.</p>}
        {view.documents ? (
          <DocumentList
            documents={view.documents}
            onOpenDocument={(id, fromRow) => onOpenDocument(id, fromRow || view.documents?.[0]?.collection)}
            onStatus={onStatus}
          />
        ) : view.grid ? (
          <DataGrid columns={view.columns} rows={view.grid} />
        ) : result !== undefined ? (
          <pre className="console-json">{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </div>
    </section>
  );
}
