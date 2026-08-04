import type { AgentSummary } from "../lib/types";

interface AgentSelectProps {
  agents: AgentSummary[];
  value: string;
  disabled?: boolean;
  onChange: (agentId: string) => void;
}

export default function AgentSelect({
  agents,
  value,
  disabled = false,
  onChange,
}: AgentSelectProps) {
  return (
    <label className="agent-select">
      <span className="sr-only">选择代理</span>
      <select
        aria-label="选择代理"
        value={value}
        disabled={disabled || agents.length === 0}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}
