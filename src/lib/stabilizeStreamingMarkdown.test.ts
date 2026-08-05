import { describe, expect, it } from "vitest";

import { stabilizeStreamingMarkdown } from "./stabilizeStreamingMarkdown";

describe("stabilizeStreamingMarkdown", () => {
  it("leaves complete markdown unchanged", () => {
    const md = "hello\n\n```js\nconsole.log(1)\n```\n";
    expect(stabilizeStreamingMarkdown(md)).toBe(md);
  });

  it("closes an open fenced code block while streaming", () => {
    expect(stabilizeStreamingMarkdown("before\n```ts\nconst x = 1")).toBe(
      "before\n```ts\nconst x = 1\n```",
    );
  });
});
