import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  login,
  listAgents,
  createThread,
  extractTextContent,
  buildUserMessageContent,
  listResolvedModels,
  listConnectors,
  uploadAttachment,
  modelOptionValue,
  modelOptionLabel,
} from "./octopHttp";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("octopHttp", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  const mockFetch = () => vi.mocked(fetch);

  it("login posts credentials and returns token", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse({ access_token: "tok", expires_in: 3600 }),
    );
    const res = await login("https://h.example", "u", "p");
    expect(res.access_token).toBe("tok");
    expect(fetch).toHaveBeenCalledWith(
      "https://h.example/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps Load failed into a clearer network error", async () => {
    mockFetch().mockRejectedValue(new TypeError("Load failed"));
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    await expect(login("http://localhost:8088", "u", "p")).rejects.toThrow(
      /无法连接服务/,
    );
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("maps Tauri error sending request into a clearer network error", async () => {
    mockFetch().mockRejectedValue(
      new Error(
        "error sending request for url (http://localhost:8088/api/agents)",
      ),
    );
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    await expect(login("http://localhost:8088", "u", "p")).rejects.toThrow(
      /无法连接服务/,
    );
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("listAgents maps id/name", async () => {
    mockFetch().mockResolvedValue(jsonResponse([{ id: "a1", name: "Bot" }]));
    const agents = await listAgents("https://h.example", "tok");
    expect(agents).toEqual([{ id: "a1", name: "Bot", state: undefined }]);
  });

  it("listAgents prefers agent_id over numeric id", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse([
        { id: 1, agent_id: "main", name: "小通", state: "running" },
      ]),
    );
    const agents = await listAgents("https://h.example", "tok");
    expect(agents).toEqual([{ id: "main", name: "小通", state: "running" }]);
  });

  it("createThread returns thread_id", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse({ thread_id: "th1", session_key: "sk" }),
    );
    const t = await createThread("https://h.example", "tok", "a1");
    expect(t.thread_id).toBe("th1");
  });

  it("extractTextContent flattens string or text parts", () => {
    expect(extractTextContent("hi")).toBe("hi");
    expect(
      extractTextContent([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  it("buildUserMessageContent keeps plain text or builds blocks", () => {
    expect(buildUserMessageContent("hi")).toBe("hi");
    expect(
      buildUserMessageContent("hi", [
        {
          filename: "a.png",
          mediaType: "image/png",
          workspacePath: "inbound/a.png",
          url: "https://x/a.png",
        },
      ]),
    ).toEqual([
      { type: "text", text: "hi" },
      { type: "image_url", image_url: { url: "https://x/a.png" } },
    ]);
  });

  it("model option helpers format provider/model refs", () => {
    const model = {
      provider_name: "openai",
      model: "gpt-4o",
      name: "GPT-4o",
    };
    expect(modelOptionValue(model)).toBe("openai/gpt-4o");
    expect(modelOptionLabel(model)).toBe("openai / GPT-4o");
  });

  it("listResolvedModels maps provider rows", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse([
        { provider_name: "openai", model: "gpt-4o", name: "GPT-4o" },
      ]),
    );
    await expect(
      listResolvedModels("https://h.example", "tok"),
    ).resolves.toEqual([
      { provider_name: "openai", model: "gpt-4o", name: "GPT-4o" },
    ]);
  });

  it("listConnectors keeps only active credentialed instances", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse([
        {
          mcp_server_name: "github",
          display_name: "GitHub",
          kind: "oauth",
          status: "active",
          has_credentials: true,
        },
        {
          mcp_server_name: "dead",
          display_name: "Dead",
          kind: "oauth",
          status: "inactive",
          has_credentials: true,
        },
        {
          mcp_server_name: "nocred",
          display_name: "NoCred",
          kind: "oauth",
          status: "active",
          has_credentials: false,
        },
      ]),
    );
    await expect(listConnectors("https://h.example", "tok")).resolves.toEqual([
      { mcp_server_name: "github", label: "GitHub", kind: "oauth" },
    ]);
  });

  it("uploadAttachment posts FormData and maps response", async () => {
    mockFetch().mockResolvedValue(
      jsonResponse({
        path: "inbound/a.png",
        filename: "a.png",
        media_type: "image/png",
        access_url: "https://h.example/inbound/a.png",
      }),
    );
    const file = new File(["x"], "a.png", { type: "image/png" });
    const attachment = await uploadAttachment(
      "https://h.example",
      "tok",
      "a1",
      file,
    );
    expect(attachment).toEqual({
      filename: "a.png",
      mediaType: "image/png",
      workspacePath: "inbound/a.png",
      url: "https://h.example/inbound/a.png",
    });
    const init = mockFetch().mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
