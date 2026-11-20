export interface StatusInfo {
  database: string;
  collection?: string | null;
  mode?: string;
  sync?: { active: boolean; mode?: string; status?: string; peers?: number };
  extra?: string[];
}

interface StatusBarProps {
  message?: string;
  info?: StatusInfo;
}

export function StatusBar({ message = 'Ready', info }: StatusBarProps) {
  const db = info?.database ?? 'No database';
  const sync = info?.sync;
  return (
    <footer className="statusbar" role="status">
      <span className="statusbar-item statusbar-message" title={message}>{message}</span>
      <span className="statusbar-item" title="Active database">
        <span className={`status-dot${info?.database ? ' status-dot-live' : ''}`} />{db}
        {info?.collection ? ` / ${info.collection}` : ''}
      </span>
      {info?.mode && <span className="statusbar-item">{info.mode}</span>}
      {sync && (
        <span className="statusbar-item" title="Sync status">
          <span className={`status-dot${sync.active ? ' status-dot-live' : ''}`} />
          Sync: {sync.active ? (sync.status ?? 'active') : 'off'}
          {sync.mode ? ` (${sync.mode})` : ''}
          {sync.peers !== undefined ? ` · ${sync.peers} peers` : ''}
        </span>
      )}
      {info?.extra?.map((entry, index) => <span className="statusbar-item" key={index}>{entry}</span>)}
      <span className="statusbar-item statusbar-spacer" />
      <span className="statusbar-item">UTF-8</span>
    </footer>
  );
}
