interface ToolbarProps {
  onOpen?: () => void;
  onRefresh?: () => void;
  onNewDocument?: () => void;
  onDelete?: () => void;
  context?: string;
}

export function Toolbar({
  onOpen,
  onRefresh,
  onNewDocument,
  onDelete,
  context = 'No database open',
}: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="toolbar-group">
        <button type="button" className="toolbar-button" onClick={onOpen}>
          Open Database
        </button>
        <button type="button" className="toolbar-button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group">
        <button type="button" className="toolbar-button" onClick={onNewDocument}>
          New Document
        </button>
        <button type="button" className="toolbar-button" onClick={onDelete}>
          Delete
        </button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-context">{context}</div>
    </div>
  );
}
