export interface DataGridColumn {
  key: string;
  label: string;
}

export interface DataGridProps<T extends Record<string, unknown>> {
  columns: DataGridColumn[];
  rows: T[];
  onRowClick?: (row: T) => void;
}

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
  return (
    <table className="datagrid">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {column.label}
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
              <td key={column.key}>{formatCell(row[column.key])}</td>
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
  );
}
