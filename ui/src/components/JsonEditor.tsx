export interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function JsonEditor({ value, onChange, readOnly = false }: JsonEditorProps) {
  return (
    <textarea
      className="json-editor"
      spellCheck={false}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      aria-label="JSON editor"
    />
  );
}
