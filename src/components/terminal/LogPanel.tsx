export function LogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Activity log</div>
      </div>
      <div className="panel-body">
        <div className="console h-48">
          {logs.length === 0 && <p className="text-ink-mute">Waiting for activity…</p>}
          {logs.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
