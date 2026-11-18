import type { AppTab } from '../types';

interface IconRailProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  onOpen: () => void;
  onRefresh: () => void;
  onNewDocument: () => void;
  onDelete: () => void;
}

type IconName =
  | AppTab
  | 'open' | 'refresh' | 'newdoc' | 'delete';

const NAV: Array<{ id: AppTab; icon: IconName; label: string }> = [
  { id: 'workspace', icon: 'workspace', label: 'Workspace' },
  { id: 'collections', icon: 'collections', label: 'Collections' },
  { id: 'documents', icon: 'documents', label: 'Documents' },
  { id: 'query', icon: 'query', label: 'Query' },
  { id: 'console', icon: 'console', label: 'Console' },
  { id: 'indexes', icon: 'indexes', label: 'Indexes' },
  { id: 'vector', icon: 'vector', label: 'Vector' },
  { id: 'graph', icon: 'graph', label: 'Graph' },
  { id: 'ops', icon: 'ops', label: 'Ops' },
  { id: 'sync', icon: 'sync', label: 'Sync' },
  { id: 'watch', icon: 'watch', label: 'Watch' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'workspace':
    case 'open':
      return <svg {...common}><path d="M3 7h6l2 2h10v10H3z" /><path d="M3 7V5h6l2 2" /></svg>;
    case 'collections':
      return <svg {...common}><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
    case 'documents':
    case 'newdoc':
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /><path d="M9 13h6M9 17h6" /></svg>;
    case 'query':
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
    case 'console':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="m7 9 3 3-3 3M13 15h4" /></svg>;
    case 'indexes':
      return <svg {...common}><path d="M5 5h14M5 10h14M5 15h14M5 20h14" /><path d="M9 3v4M15 8v4M9 13v4" /></svg>;
    case 'vector':
      return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
    case 'graph':
      return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7.5 7.5 8.5 8M17 8.5l-4 7.5M8 7l8 0" /></svg>;
    case 'ops':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-3v-.1A1.7 1.7 0 0 0 10.8 19a1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1A1.7 1.7 0 0 0 7.2 15a1.7 1.7 0 0 0-1.5-1H5v-3h.1A1.7 1.7 0 0 0 7 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1A1.7 1.7 0 0 0 10.6 6a1.7 1.7 0 0 0 1-1.5V4h3v.1A1.7 1.7 0 0 0 16.2 6a1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1A1.7 1.7 0 0 0 19.8 10a1.7 1.7 0 0 0 1.5 1H22v3h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'sync':
    case 'refresh':
      return <svg {...common}><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 19v-4h-4" /></svg>;
    case 'watch':
      return <svg {...common}><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="17" r="2" fill="currentColor" /></svg>;
    case 'delete':
      return <svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></svg>;
  }
}

export function IconRail({ activeTab, onNavigate, onOpen, onRefresh, onNewDocument, onDelete }: IconRailProps) {
  return (
    <nav className="icon-rail" aria-label="Navigation">
      <div className="icon-rail-group">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-button${activeTab === item.id ? ' rail-active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-current={activeTab === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </div>
      <div className="icon-rail-divider" />
      <div className="icon-rail-group">
        <button type="button" className="rail-button" title="Open database" aria-label="Open database" onClick={onOpen}><Icon name="open" /></button>
        <button type="button" className="rail-button" title="Refresh" aria-label="Refresh" onClick={onRefresh}><Icon name="refresh" /></button>
        <button type="button" className="rail-button" title="New document" aria-label="New document" onClick={onNewDocument}><Icon name="newdoc" /></button>
        <button type="button" className="rail-button rail-danger" title="Delete selected document" aria-label="Delete selected document" onClick={onDelete}><Icon name="delete" /></button>
      </div>
    </nav>
  );
}
