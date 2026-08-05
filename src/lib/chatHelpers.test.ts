import { describe, expect, it } from "vitest";

import { chatErrorText, nextChatMessageId } from "./chatHelpers";
import { OctopHttpError } from "./octopHttp";

describe("chatHelpers", () => {
  it("generates unique message ids", () => {
    expect(nextChatMessageId("user")).toMatch(/^user-\d+$/);
    expect(nextChatMessageId("user")).not.toBe(nextChatMessageId("user"));
  });

  it("maps 401 errors to a settings hint", () => {
    expect(chatErrorText(new OctopHttpError(401, "unauthorized"))).toBe(
      "登录已失效，请重新设置账号",
    );
  });
});
