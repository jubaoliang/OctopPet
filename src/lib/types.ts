export type MascotId = "peek" | "type";

export interface AppConfig {
  baseUrl: string;
  username: string;
  mascotId: MascotId;
  lastAgentId: string | null;
  threadIdByAgent: Record<string, string>;
  petX: number | null;
  petY: number | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  state?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
  error?: string;
}
