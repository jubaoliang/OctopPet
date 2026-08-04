import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { login, listAgents, createThread, extractTextContent } from "./octopHttp";

describe("octopHttp", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("login posts credentials and returns token", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    });
    const res = await login("https://h.example", "u", "p");
    expect(res.access_token).toBe("tok");
    expect(fetch).toHaveBeenCalledWith(
      "https://h.example/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("listAgents maps id/name", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "a1", name: "Bot" }],
    });
    const agents = await listAgents("https://h.example", "tok");
    expect(agents).toEqual([{ id: "a1", name: "Bot", state: undefined }]);
  });

  it("createThread returns thread_id", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ thread_id: "th1", session_key: "sk" }),
    });
    const t = await createThread("https://h.example", "tok", "a1");
    expect(t.thread_id).toBe("th1");
  });

  it("extractTextContent flattens string or text parts", () => {
    expect(extractTextContent("hi")).toBe("hi");
    expect(
      extractTextContent([{ type: "text", text: "a" }, { type: "text", text: "b" }]),
    ).toBe("ab");
  });
});
