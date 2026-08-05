export default function GeneratingIndicator({ label }: { label: string }) {
  return (
    <div className="generating-indicator" aria-live="polite">
      <span className="generating-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="generating-label">{label}</span>
    </div>
  );
}
