// src/lib/configLogic.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  normalizeBaseUrl,
  resolveThreadForAgent,
  withThreadForAgent,
  withMascot,
} from "./configLogic";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://octop.example.com/")).toBe(
      "https://octop.example.com",
    );
  });
  it("rejects empty", () => {
    expect(() => normalizeBaseUrl("  ")).toThrow();
  });
});

describe("thread map", () => {
  it("resolves and updates per agent without clobbering others", () => {
    let cfg = DEFAULT_APP_CONFIG;
    cfg = withThreadForAgent(cfg, "a1", "t1");
    cfg = withThreadForAgent(cfg, "a2", "t2");
    expect(resolveThreadForAgent(cfg, "a1")).toBe("t1");
    expect(resolveThreadForAgent(cfg, "a2")).toBe("t2");
    cfg = withThreadForAgent(cfg, "a1", "t1b");
    expect(resolveThreadForAgent(cfg, "a1")).toBe("t1b");
    expect(resolveThreadForAgent(cfg, "a2")).toBe("t2");
  });
});

describe("withMascot", () => {
  it("sets mascot id", () => {
    expect(withMascot(DEFAULT_APP_CONFIG, "type").mascotId).toBe("type");
  });
});
