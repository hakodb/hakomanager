import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '../api/client';
import { errorMessage, type CollectionInfo } from '../types';

interface WatchFeedProps {
  profileId: string | null;
  collections: CollectionInfo[];
  onStatus: (message: string) => void;
}

interface WatchEntry {
  kind: string;
  collection: string;
  path: string;
  time: string;
}

const MAX_EVENTS = 100;

function stringField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function parsePayload(payload: string): WatchEntry {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed === 'object' && parsed !== null) {
      const source = parsed as Record<string, unknown>;
      return {
        kind: stringField(source, ['kind', 'op', 'event']),
        collection: stringField(source, ['collection', 'coll']),
        path: stringField(source, ['path', 'id', 'target']),
        time: stringField(source, ['time', 'timestamp', 'ts']) || new Date().toLocaleTimeString(),
      };
    }
    return { kind: '', collection: '', path: String(parsed), time: new Date().toLocaleTimeString() };
  } catch {
    return { kind: '', collection: '', path: payload, time: new Date().toLocaleTimeString() };
  }
}

export function WatchFeed({ profileId, collections, onStatus }: WatchFeedProps) {
  const [collectionName, setCollectionName] = useState('');
  const [events, setEvents] = useState<WatchEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<string>('hako://change', (event) => {
      const entry = parsePayload(event.payload);
      setEvents((current) => [entry, ...current].slice(0, MAX_EVENTS));
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function startWatch() {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const args: Record<string, unknown> = { profileId };
      const name = collectionName.trim();
      if (name) {
        args.collection = name;
      }
      await invoke('ops.watch', args);
      onStatus(name ? `Watching collection ${name}.` : 'Watching all collections.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="page-section">
        <h2 className="section-title">Change watch</h2>
        <div className="field-row">
          <span className="field-label">Collection</span>
          <select
            className="field-select"
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void startWatch()}>
            Start watch
          </button>
          <button type="button" className="button" onClick={() => setEvents([])}>
            Clear events
          </button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {!isTauri() && (
          <div className="inline-note">Live change events are only available in the desktop shell.</div>
        )}
        <div className="inline-note">Showing the last {MAX_EVENTS} events, newest first.</div>
      </section>

      <section className="page-section">
        <div className="panel">
          <div className="panel-header">hako://change</div>
          <div className="panel-body">
            <div className="grid-scroll">
              <table className="datagrid">
                <thead>
                  <tr>
                    <th scope="col">Kind</th>
                    <th scope="col">Collection</th>
                    <th scope="col">Path</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td className="datagrid-empty" colSpan={4}>
                        No change events yet
                      </td>
                    </tr>
                  ) : (
                    events.map((entry, index) => (
                      <tr key={index}>
                        <td>{entry.kind}</td>
                        <td>{entry.collection}</td>
                        <td title={entry.path}>{entry.path}</td>
                        <td>{entry.time}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
