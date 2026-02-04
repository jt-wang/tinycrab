import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionManager } from "../../src/session-manager.js";

// Mock pi-coding-agent
vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: vi.fn(async () => {
    let lastText: string | null = null;
    return {
      session: {
        prompt: vi.fn(async (msg: string) => {
          lastText = `Response to: ${msg}`;
        }),
        getLastAssistantText: vi.fn(() => lastText),
      },
    };
  }),
  codingTools: [],
}));

// Mock pi-ai
vi.mock("@mariozechner/pi-ai", () => ({
  getModel: vi.fn(() => ({})),
}));

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({}, { maxSessions: 5, sessionTtlMs: 1000 });
  });

  afterEach(async () => {
    await manager.close();
  });

  it("creates separate sessions for different keys", async () => {
    const session1 = await manager.getOrCreate({ channel: "cli", chatId: "user1" });
    const session2 = await manager.getOrCreate({ channel: "cli", chatId: "user2" });

    // Sessions should be different instances
    expect(session1).not.toBe(session2);
    expect(manager.listSessions()).toHaveLength(2);
  });

  it("returns same session for same key", async () => {
    const session1 = await manager.getOrCreate({ channel: "cli", chatId: "user1" });
    const session2 = await manager.getOrCreate({ channel: "cli", chatId: "user1" });

    expect(session1).toBe(session2);
    expect(manager.listSessions()).toHaveLength(1);
  });

  it("handles thread IDs as separate sessions", async () => {
    const base = await manager.getOrCreate({ channel: "cli", chatId: "user1" });
    const thread = await manager.getOrCreate({
      channel: "cli",
      chatId: "user1",
      threadId: "thread123",
    });

    expect(base).not.toBe(thread);
    expect(manager.listSessions()).toHaveLength(2);
  });

  it("executes operations sequentially within same session", async () => {
    const order: number[] = [];

    const p1 = manager.withSession({ channel: "cli", chatId: "user1" }, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const p2 = manager.withSession({ channel: "cli", chatId: "user1" }, async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);

    // Operations on same session should be sequential
    expect(order).toEqual([1, 2]);
  });

  it("executes operations concurrently across different sessions", async () => {
    const order: number[] = [];

    const p1 = manager.withSession({ channel: "cli", chatId: "user1" }, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const p2 = manager.withSession({ channel: "cli", chatId: "user2" }, async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);

    // Different sessions should run concurrently - user2 finishes first
    expect(order).toEqual([2, 1]);
  });

  it("evicts oldest session when at capacity", async () => {
    // Create 5 sessions (at capacity) with delays to ensure different timestamps
    for (let i = 0; i < 5; i++) {
      await manager.getOrCreate({ channel: "cli", chatId: `user${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(manager.listSessions()).toHaveLength(5);

    // Create a new session - should evict the oldest (user0)
    await manager.getOrCreate({ channel: "cli", chatId: "newuser" });

    // Wait for async eviction
    await new Promise((r) => setTimeout(r, 50));

    const sessions = manager.listSessions();
    expect(sessions).toContain("cli:newuser");
    // Session count should stay at or below max
    expect(sessions.length).toBeLessThanOrEqual(5);
  });

  it("closes all sessions on close()", async () => {
    await manager.getOrCreate({ channel: "cli", chatId: "user1" });
    await manager.getOrCreate({ channel: "cli", chatId: "user2" });

    await manager.close();

    expect(manager.listSessions()).toHaveLength(0);
  });
});
