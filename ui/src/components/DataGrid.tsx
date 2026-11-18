import { useEffect, useRef, useState } from 'react';

export interface DataGridColumn {
  key: string;
  label: string;
}

export interface DataGridProps<T extends Record<string, unknown>> {
  columns: DataGridColumn[];
  rows: T[];
  onRowClick?: (row: T) => void;
}

const MIN_WIDTH = 72;
const DEFAULT_WIDTH = 160;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function DataGrid<T extends Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
}: DataGridProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const drag = useRef<{ key: string; x: number; width: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const next = Math.max(MIN_WIDTH, current.width + event.clientX - current.x);
      setWidths((previous) => ({ ...previous, [current.key]: next }));
    };
    const stop = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  const widthOf = (key: string) => widths[key] ?? DEFAULT_WIDTH;
  const totalWidth = columns.reduce((sum, column) => sum + widthOf(column.key), 0);

  return (
    <div className="datagrid-scroll" tabIndex={0} aria-label="Scrollable table">
      <table className="datagrid" style={{ width: Math.max(totalWidth, 100), minWidth: totalWidth }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: widthOf(column.key) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                <span className="datagrid-label">{column.label}</span>
                <span
                  className="datagrid-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${column.label}`}
                  title="Drag to resize"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    drag.current = { key: column.key, x: event.clientX, width: widthOf(column.key) };
                    document.body.style.cursor = 'col-resize';
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={onRowClick ? 'datagrid-row-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} title={formatCell(row[column.key])}>
                  {formatCell(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="datagrid-empty" colSpan={columns.length || 1}>
                No rows to display
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
