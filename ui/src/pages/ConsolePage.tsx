import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../api/client';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';
import { DocumentList } from '../components/DocumentList';
import {
  errorMessage,
  loadConsoleState,
  saveConsoleState,
  type CollectionInfo,
  type ConsoleRow,
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

const HISTORY_KEY = 'hakomanager.console.history';

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function ConsolePage({ profileId, collections, onOpenDocument, onStatus }: ConsolePageProps) {
  const [input, setInput] = useState(() => loadConsoleState().input);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [rows, setRows] = useState<ConsoleRow[]>(() => loadConsoleState().rows);
  const [busy, setBusy] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist the in-progress query and results so the console survives a
  // restart (capped payload in saveConsoleState).
  useEffect(() => {
    const timer = window.setTimeout(() => saveConsoleState(input, rows), 300);
    return () => window.clearTimeout(timer);
  }, [input, rows]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const caret = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const chainMatch = /\.(\w*)$/.exec(before);
    if (chainMatch) {
      const typed = chainMatch[1].toLowerCase();
      return METHODS.filter((method) => method.label.toLowerCase().startsWith(typed));
    }
    const whereArgs = /\.(where|or)\(([^()]*)$/.exec(before);
    if (whereArgs) {
      const parts = whereArgs[2].split(',');
      if (parts.length <= 1) {
        // Field names: suggest from the selected collection, else all known.
        const pool = collections.map((item) => item.name);
        const typed = parts[0].trim().toLowerCase();
        const words = new Set<string>();
        for (const name of pool) {
          for (const word of name.split(/[^a-zA-Z0-9]+/)) {
            if (word) words.add(word.toLowerCase());
          }
        }
        const fields = ['id', 'name', 'price', 'created_at', ...words];
        return fields
          .filter((field) => field.toLowerCase().startsWith(typed))
          .map((field) => ({ label: field, detail: 'field', insert: field }));
      }
      if (parts.length === 2) {
        const typed = parts[1].trim().toLowerCase();
        return OPS.filter((op) => op.startsWith(typed))
          .map((op) => ({ label: op, detail: 'operator', insert: op }));
      }
      return [];
    }
    const starts = /^(\w*)$/.exec(before.trimStart());
    if (starts && !before.includes('.') && !before.includes(' ')) {
      const typed = starts[1].toLowerCase();
      const pool = [...BARE, ...collections.map((item) => ({
        label: item.name,
        detail: `collection (${item.doc_count} docs)`,
        insert: `${item.name}.`,
      }))];
      return pool.filter((item) => item.label.toLowerCase().startsWith(typed));
    }
    const headCollection = /^(\w[\w-]*)\./.exec(before.trimStart());
    if (headCollection) {
      const head = headCollection[1];
      const known = collections.find((item) => item.name === head);
      if (known) {
        return [];
      }
    }
    return [];
  }, [input, collections]);

  const suggestionOpen = suggestions.length > 0 && input.trim().length > 0;

  function acceptSuggestion(suggestion: Suggestion) {
    const caret = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    let next: string;
    if (/\.(\w*)$/.test(before)) {
      next = before.replace(/\.(\w*)$/, `.${suggestion.insert}`) + after;
    } else if (/(\w*)$/.test(before)) {
      next = before.replace(/(\w*)$/, suggestion.insert) + after;
    } else {
      next = before + suggestion.insert + after;
    }
    setInput(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function updateHistory(command: string) {
    const next = [command, ...history.filter((item) => item !== command)].slice(0, 50);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable: history stays in-memory for this session.
    }
  }

  async function runCommand(command: string) {
    if (!profileId || !command.trim()) {
      return;
    }
    setBusy(true);
    const at = new Date().toLocaleTimeString();
    try {
      const result = await invoke<unknown>('query.console', { profileId, input: command });
      setRows((current) => [{ command, result, error: null, at }, ...current].slice(0, 40));
      onStatus(`console: ${command}`);
    } catch (caught) {
      const message = errorMessage(caught);
      setRows((current) => [{ command, result: null, error: message, at }, ...current].slice(0, 40));
      onStatus(message);
    } finally {
      setBusy(false);
      setHistoryIndex(null);
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
      if (event.key === 'Tab' || (event.key === 'Enter' && suggestions.length > 0 && input.trim().length > 0 && !input.includes('(') && !input.includes('.'))) {
        event.preventDefault();
        acceptSuggestion(suggestions[Math.min(activeSuggestion, suggestions.length - 1)]);
        setActiveSuggestion(0);
        return;
      }
      if (event.key === 'Escape') {
        setActiveSuggestion(0);
        setInput(input);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const command = input.trim();
      if (!command) return;
      if (history[0] !== command) updateHistory(command);
      void runCommand(command);
      return;
    }
    if (event.key === 'ArrowUp' && !suggestionOpen) {
      if (history.length === 0) return;
      event.preventDefault();
      const next = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[next]);
    }
    if (event.key === 'ArrowDown' && !suggestionOpen && historyIndex !== null) {
      event.preventDefault();
      const next = historyIndex - 1;
      if (next < 0) {
        setHistoryIndex(null);
        setInput('');
      } else {
        setHistoryIndex(next);
        setInput(history[next]);
      }
    }
  }

  function renderResult(result: unknown): {
    documents: DocumentView[] | null;
    grid: Record<string, unknown>[] | null;
    columns: DataGridColumn[];
  } {
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && result[0] !== null) {
      const objects = result.filter(
        (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
      );
      const looksLikeDocuments = objects.every((row) => 'id' in row && 'data' in row);
      if (looksLikeDocuments) {
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
      return { documents: null, grid: objects, columns: gridColumns(objects[0]) };
    }
    return { documents: null, grid: null, columns: [] };
  }

  return (
    <section className="page">
      <div className="page-section">
        <p className="page-hint">
          Fluent queries (<code>products.where(price,gte,10000).orderBy(name).limit(10).select(name,price)</code>)
          and commands (<code>collections</code>, <code>docs &lt;collection&gt;</code>, <code>get &lt;collection&gt; &lt;id&gt;</code>, <code>put</code>, <code>del</code>, <code>stats</code>, <code>indexes</code>, <code>compact</code>, <code>backup</code>, <code>search</code>...).
          Tab completes · ↑/↓ history.
        </p>
      </div>
      <div className="page-section">
        <div className="console-input-row">
          <input
            ref={inputRef}
            className="console-input"
            value={input}
            placeholder="Type a command…  (Tab completes, ↑ history)"
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
            onClick={() => {
              const command = input.trim();
              if (!command) return;
              if (history[0] !== command) updateHistory(command);
              void runCommand(command);
            }}
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
      <div className="console-history">
        {rows.length === 0 && <p className="page-hint">No commands yet.</p>}
        {rows.map((row, index) => {
          const { documents, grid, columns } = renderResult(row.result);
          return (
            <details key={`${row.at}-${index}`} open={index === 0} className="console-entry">
              <summary>
                <code>{row.command}</code>
                {row.error ? <span className="console-error">✗ {row.error}</span> : <span className="console-ok">✓ {row.at}</span>}
              </summary>
              {documents ? (
                <DocumentList
                  documents={documents}
                  onOpenDocument={(id, fromRow) => onOpenDocument(id, fromRow || documents[0]?.collection)}
                  onStatus={onStatus}
                />
              ) : grid ? (
                <DataGrid columns={columns} rows={grid} />
              ) : (
                <pre className="console-json">{JSON.stringify(row.result ?? row.error, null, 2)}</pre>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function gridColumns(sample: Record<string, unknown>): DataGridColumn[] {
  return Object.keys(sample).map((key) => ({
    key,
    label: key,
  }));
}
