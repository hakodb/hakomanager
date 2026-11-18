interface StatusBarProps {
  message?: string;
  context?: string;
}

export function StatusBar({ message = 'Ready', context = 'No database' }: StatusBarProps) {
  return (
    <footer className="statusbar" role="status">
      <span className="statusbar-item statusbar-message">{message}</span>
      <span className="statusbar-item">{context}</span>
      <span className="statusbar-item">UTF-8</span>
    </footer>
  );
}
