// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Composer from "./Composer";
import type { AgentSummary } from "../lib/types";

const agents: AgentSummary[] = [{ id: "agent-1", name: "Default Agent" }];

describe("Composer", () => {
  afterEach(cleanup);

  it("sends trimmed text with default options", () => {
    const onSend = vi.fn();
    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("和 Octop 说点什么"), {
      target: { value: "  hello  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledWith("hello", {
      attachments: [],
      model: null,
      mcpServers: [],
    });
  });

  it("queues while streaming when onQueue is provided", () => {
    const onQueue = vi.fn().mockReturnValue("ok");
    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        streaming
        onSend={vi.fn()}
        onQueue={onQueue}
        onStop={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("和 Octop 说点什么"), {
      target: { value: "queued" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入队列" }));

    expect(onQueue).toHaveBeenCalledWith("queued", {
      attachments: [],
      model: null,
      mcpServers: [],
    });
  });
});
