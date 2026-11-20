import { useEffect, useRef, useState } from 'react';
import { Glyph, type GlyphName } from './ActionBar';

interface MenuItem {
  id: string;
  label: string;
  icon?: GlyphName;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
}

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuDef[];
}

export function MenuBar({ menus }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <nav className="menu-bar" ref={root} aria-label="Application menu">
      {menus.map((menu) => (
        <div className="menu-group" key={menu.id}>
          <button
            type="button"
            className={`menu-trigger${open === menu.id ? ' menu-trigger-open' : ''}`}
            aria-expanded={open === menu.id}
            onClick={() => setOpen((current) => (current === menu.id ? null : menu.id))}
            onMouseEnter={() => open && setOpen(menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <div className="menu-popup" role="menu">
              {menu.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(null);
                    item.onClick();
                  }}
                >
                  <span className="menu-item-check">{item.checked ? '✓' : ''}</span>
                  {item.icon && <span className="menu-item-icon"><Glyph name={item.icon} /></span>}
                  <span className="menu-item-label">{item.label}</span>
                  {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
