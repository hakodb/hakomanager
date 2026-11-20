import type { ReactNode } from 'react';

export interface ActionItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}

interface ActionBarProps {
  items: ActionItem[];
  label?: string;
}

/** Horizontal strip of icon buttons with labels: one row for all page actions. */
export function ActionBar({ items, label }: ActionBarProps) {
  return (
    <div className="action-bar" role="toolbar" aria-label={label ?? 'Actions'}>
      {label && <span className="action-bar-label">{label}</span>}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={[
            'action-button',
            item.active ? 'action-active' : '',
            item.primary ? 'button-primary' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={item.title ?? item.label}
          aria-label={item.label}
          aria-pressed={item.active}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          <span className="action-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="action-text">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Small inline SVG glyph set shared by action bars and menus. */
export function Glyph({ name }: { name: GlyphName }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'refresh':
      return <svg {...common}><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 19v-4h-4" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus':
      return <svg {...common}><path d="M5 12h14" /></svg>;
    case 'play':
      return <svg {...common}><path d="m8 5 11 7-11 7z" /></svg>;
    case 'trash':
      return <svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
    case 'download':
      return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>;
    case 'upload':
      return <svg {...common}><path d="M12 20V8M7 13l5-5 5 5M4 4h16" /></svg>;
    case 'save':
      return <svg {...common}><path d="M5 3h12l2 2v16H5z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></svg>;
    case 'graph':
      return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="18" r="2" /><path d="M8 7l8 0M7 8l4 8M17 9l-4 7" /></svg>;
    case 'vector':
      return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
    case 'layers':
      return <svg {...common}><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
    case 'gauge':
      return <svg {...common}><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 14 4-4" /></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>;
    case 'stop':
      return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>;
    case 'export':
      return <svg {...common}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="17" r="2" fill="currentColor" /></svg>;
  }
}

export type GlyphName =
  | 'refresh' | 'plus' | 'minus' | 'play' | 'trash' | 'search' | 'download'
  | 'upload' | 'save' | 'graph' | 'vector' | 'layers' | 'gauge' | 'clock'
  | 'info' | 'stop' | 'export' | 'settings';

/** Segmented option selector for mutually exclusive modes/actions. */
interface SegmentedProps<T extends string | number> {
  value: T;
  options: Array<{ value: T; label: string; icon?: GlyphName; title?: string }>;
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label ?? 'Options'}>
      {label && <span className="segmented-label">{label}</span>}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segment${value === option.value ? ' segment-active' : ''}`}
          title={option.title ?? option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Glyph name={option.icon} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}
