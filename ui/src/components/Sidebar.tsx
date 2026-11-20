import { useState } from 'react';
import { Inspector } from './Inspector';
import type { CollectionInfo, DatabaseProfile } from '../types';

interface SidebarProps {
  databases?: DatabaseProfile[];
  collections?: CollectionInfo[];
  activeProfileId?: string | null;
  activeCollection?: string | null;
  profile?: DatabaseProfile | null;
  collection?: CollectionInfo | null;
  encrypted?: boolean;
  encryptedCollections?: string[];
  onSelectProfile?: (id: string) => void;
  onSelectCollection?: (name: string) => void;
}

export function Sidebar({
  databases = [],
  collections = [],
  activeProfileId = null,
  activeCollection = null,
  profile = null,
  collection = null,
  encrypted = false,
  encryptedCollections = [],
  onSelectProfile,
  onSelectCollection,
}: SidebarProps) {
  const [view, setView] = useState<'database' | 'inspector'>('database');

  return (
    <aside className="sidebar" aria-label="Explorer">
      <div className="sidebar-tabs" role="tablist" aria-label="Explorer panels">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'database'}
          className={`sidebar-tab${view === 'database' ? ' sidebar-tab-active' : ''}`}
          onClick={() => setView('database')}
        >
          Database
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'inspector'}
          className={`sidebar-tab${view === 'inspector' ? ' sidebar-tab-active' : ''}`}
          onClick={() => setView('inspector')}
        >
          Inspector
        </button>
      </div>
      {view === 'database' ? (
        <>
          <div className="sidebar-tree" role="tree">
            {databases.length === 0 && (
              <div className="tree-item tree-item-empty" role="treeitem" aria-selected="false">
                No databases loaded
              </div>
            )}
            {databases.map((db) => (
              <div key={db.id}>
                <div
                  className={`tree-item tree-item-db-clickable${activeProfileId === db.id ? ' tree-item-active' : ''}`}
                  role="treeitem"
                  aria-selected={activeProfileId === db.id}
                  title={db.path}
                  onClick={() => onSelectProfile?.(db.id)}
                >
                  {db.name}
                  {db.read_only ? ' [read-only]' : ''}
                  {encrypted && activeProfileId === db.id && encryptedCollections.length === 0 && (
                    <span className="tree-key" title="Key applied to all collections">🔑</span>
                  )}
                </div>
                {activeProfileId === db.id &&
                  collections.map((item) => (
                    <div
                      key={item.name}
                      className={`tree-item tree-item-collection${activeCollection === item.name ? ' tree-item-active' : ''}`}
                      role="treeitem"
                      aria-selected={activeCollection === item.name}
                      onClick={() => onSelectCollection?.(item.name)}
                    >
                      {item.name}
                      {encrypted && encryptedCollections.includes(item.name) && (
                        <span className="tree-key" title="Encrypted collection">🔑</span>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            {databases.length} connection{databases.length === 1 ? '' : 's'}
          </div>
        </>
      ) : (
        <Inspector profile={profile} collection={collection} />
      )}
    </aside>
  );
}
