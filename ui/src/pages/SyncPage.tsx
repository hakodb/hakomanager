import { useState } from 'react';
import { invoke } from '../api/client';
import { JsonEditor } from '../components/JsonEditor';
import { errorMessage } from '../types';

interface SyncPageProps {
  profileId: string | null;
  onStatus: (message: string) => void;
}

const PLANES = ['net', 'cloud', 'socket'];

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

export function SyncPage({ profileId, onStatus }: SyncPageProps) {
  const [plane, setPlane] = useState('net');
  const [address, setAddress] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomKey, setRoomKey] = useState('');
  const [token, setToken] = useState('');
  const [port, setPort] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [statusResult, setStatusResult] = useState<unknown>(null);
  const [peersResult, setPeersResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function requireProfile(): boolean {
    if (!profileId) {
      setError('Open a database on the Workspace tab first.');
      return false;
    }
    return true;
  }

  function buildArgs(): Record<string, unknown> {
    const args: Record<string, unknown> = { profileId, plane };
    if (address.trim()) {
      args.address = address.trim();
    }
    if (roomName.trim()) {
      args.roomName = roomName.trim();
    }
    if (roomKey.trim()) {
      args.roomKey = roomKey.trim();
    }
    if (token.trim()) {
      args.token = token.trim();
    }
    if (port.trim()) {
      args.port = Number(port);
    }
    if (nodeId.trim()) {
      args.nodeId = nodeId.trim();
    }
    return args;
  }

  async function refresh() {
    if (!requireProfile()) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const [status, peers] = await Promise.all([
        invoke<unknown>('sync.status', { profileId, plane }),
        invoke<unknown>('sync.peers', { profileId, plane }),
      ]);
      setStatusResult(status);
      setPeersResult(peers);
      onStatus(`Sync ${plane} status refreshed.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changeState(op: 'sync.start' | 'sync.stop') {
    if (!requireProfile()) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      await invoke(op, buildArgs());
      onStatus(`${op} requested for plane ${plane}.`);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {!profileId && (
        <div className="inline-note">Open a database on the Workspace tab to monitor synchronization.</div>
      )}
      <div className="inline-note">
        Credentials entered here are kept in memory for this session only and are never persisted.
      </div>

      <section className="page-section">
        <h2 className="section-title">Sync control</h2>
        <div className="field-row">
          <span className="field-label">Plane</span>
          <select className="field-select" value={plane} onChange={(event) => setPlane(event.target.value)}>
            {PLANES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" className="button" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void changeState('sync.start')}>
            Start
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => void changeState('sync.stop')}>
            Stop
          </button>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Optional connection configuration</h2>
        <div className="field-row">
          <span className="field-label">Address</span>
          <input
            className="field-input field-small"
            type="text"
            value={address}
            placeholder="host:port or URL"
            onChange={(event) => setAddress(event.target.value)}
          />
          <span className="field-label">Port</span>
          <input
            className="field-input field-number"
            type="number"
            min={0}
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
          <span className="field-label">Node id</span>
          <input
            className="field-input field-small"
            type="text"
            value={nodeId}
            placeholder="Node identifier"
            onChange={(event) => setNodeId(event.target.value)}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Room name</span>
          <input
            className="field-input field-small"
            type="text"
            value={roomName}
            placeholder="Room"
            onChange={(event) => setRoomName(event.target.value)}
          />
          <span className="field-label">Room key</span>
          <input
            className="field-input field-small"
            type="password"
            value={roomKey}
            placeholder="Room key"
            onChange={(event) => setRoomKey(event.target.value)}
          />
          <span className="field-label">Token</span>
          <input
            className="field-input field-small"
            type="password"
            value={token}
            placeholder="Access token"
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">sync.status</div>
          <div className="panel-body">
            <div className="json-view">
              <JsonEditor value={pretty(statusResult)} onChange={() => undefined} readOnly />
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">sync.peers</div>
          <div className="panel-body">
            <div className="json-view">
              <JsonEditor value={pretty(peersResult)} onChange={() => undefined} readOnly />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
