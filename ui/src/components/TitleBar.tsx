export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-mark" aria-hidden="true">H</span>
        <span className="titlebar-name">HakoManager</span>
      </div>
      <div className="titlebar-title">Database Manager</div>
      <div className="titlebar-controls" aria-hidden="true">
        <span className="titlebar-control">&#8722;</span>
        <span className="titlebar-control">&#9633;</span>
        <span className="titlebar-control">&#215;</span>
      </div>
    </header>
  );
}
