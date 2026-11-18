import type { CollectionInfo, DatabaseProfile } from '../types';

interface SidebarProps {
  databases?: DatabaseProfile[];
  collections?: CollectionInfo[];
  activeProfileId?: string | null;
  activeCollection?: string | null;
  onSelectProfile?: (id: string) => void;
  onSelectCollection?: (name: string) => void;
}

export function Sidebar({
  databases = [],
  collections = [],
  activeProfileId = null,
  activeCollection = null,
  onSelectProfile,
  onSelectCollection,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Database explorer">
      <div className="sidebar-header">Explorer</div>
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
            </div>
            {activeProfileId === db.id &&
              collections.map((collection) => (
                <div
                  key={collection.name}
                  className={`tree-item tree-item-collection${activeCollection === collection.name ? ' tree-item-active' : ''}`}
                  role="treeitem"
                  aria-selected={activeCollection === collection.name}
                  onClick={() => onSelectCollection?.(collection.name)}
                >
                  {collection.name}
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        {databases.length} connection{databases.length === 1 ? '' : 's'}
      </div>
    </aside>
  );
}
