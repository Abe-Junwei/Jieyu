/** Decorative empty-state ghost rows (ElevenLabs-style). Presentational only. */
export function EmptyGhostRows({ rows = 4 }: { rows?: number }) {
  const count = Math.max(1, Math.min(rows, 6));
  return (
    <div className="empty-ghost-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="empty-ghost-row">
          <span className="empty-ghost-bar empty-ghost-bar--title" />
          <span className="empty-ghost-bar empty-ghost-bar--meta" />
        </div>
      ))}
    </div>
  );
}
