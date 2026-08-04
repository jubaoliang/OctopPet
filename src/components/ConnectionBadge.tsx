export type ConnectionState =
  | "loading"
  | "connected"
  | "streaming"
  | "disconnected";

const LABELS: Record<ConnectionState, string> = {
  loading: "连接中",
  connected: "已连接",
  streaming: "回复中",
  disconnected: "未连接",
};

export default function ConnectionBadge({
  state,
}: {
  state: ConnectionState;
}) {
  return (
    <span className={`connection-badge connection-${state}`} role="status">
      <span aria-hidden="true" className="connection-dot" />
      {LABELS[state]}
    </span>
  );
}
