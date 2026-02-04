import { describe, it, expect } from "vitest";
import {
  buildSessionKey,
  parseSessionKey,
  getParentSessionKey,
} from "../../src/session-key.js";

describe("session-key", () => {
  describe("buildSessionKey", () => {
    it("builds simple key from channel and chatId", () => {
      expect(buildSessionKey({ channel: "cli", chatId: "main" })).toBe("cli:main");
      expect(buildSessionKey({ channel: "http", chatId: "abc123" })).toBe("http:abc123");
    });

    it("includes thread ID when provided", () => {
      expect(
        buildSessionKey({ channel: "discord", chatId: "channel1", threadId: "thread123" })
      ).toBe("discord:channel1:thread:thread123");
    });

    it("normalizes values to lowercase", () => {
      expect(buildSessionKey({ channel: "CLI", chatId: "Main" })).toBe("cli:main");
    });

    it("replaces invalid characters with dashes", () => {
      expect(buildSessionKey({ channel: "my channel", chatId: "user@123" })).toBe(
        "my-channel:user-123"
      );
    });
  });

  describe("parseSessionKey", () => {
    it("parses simple key", () => {
      const result = parseSessionKey("cli:main");
      expect(result).toEqual({ channel: "cli", chatId: "main" });
    });

    it("parses key with thread", () => {
      const result = parseSessionKey("discord:channel1:thread:thread123");
      expect(result).toEqual({
        channel: "discord",
        chatId: "channel1",
        threadId: "thread123",
      });
    });

    it("returns null for invalid keys", () => {
      expect(parseSessionKey("")).toBeNull();
      expect(parseSessionKey("nocolon")).toBeNull();
      expect(parseSessionKey(":empty")).toBeNull();
    });
  });

  describe("getParentSessionKey", () => {
    it("returns parent for thread keys", () => {
      expect(getParentSessionKey("discord:channel1:thread:thread123")).toBe(
        "discord:channel1"
      );
    });

    it("returns null for non-thread keys", () => {
      expect(getParentSessionKey("cli:main")).toBeNull();
      expect(getParentSessionKey("http:abc123")).toBeNull();
    });
  });
});
