import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MessageBus } from "../../src/bus.js";

// Mock pi-coding-agent
vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
  codingTools: [
    { name: "read" },
    { name: "write" },
    { name: "edit" },
    { name: "bash" },
  ],
  AuthStorage: vi.fn().mockImplementation(() => ({
    setRuntimeApiKey: vi.fn(),
  })),
}));

// Mock pi-ai
vi.mock("@mariozechner/pi-ai", () => ({
  getModel: vi.fn(() => ({ id: "mock-model" })),
}));

describe("Subagent and MessageBus Integration", () => {
  let bus: MessageBus;
  let mockSession: {
    prompt: ReturnType<typeof vi.fn>;
    getLastAssistantText: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    bus = new MessageBus();
    vi.resetModules();

    mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      getLastAssistantText: vi.fn().mockReturnValue("Subagent result"),
    };

    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: mockSession,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should deliver subagent results through the bus", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const results: string[] = [];
    bus.subscribe("cli", (msg) => results.push(msg.content));

    await spawn(bus, "Background task", "cli", "main");

    // Wait for subagent completion
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(results).toHaveLength(1);
    expect(results[0]).toContain("[Subagent");
    expect(results[0]).toContain("Subagent result");
  });

  it("should handle multiple concurrent subagents", async () => {
    const { spawn } = await import("../../src/subagent.js");

    let callCount = 0;
    mockSession.prompt.mockImplementation(async (task: string) => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    mockSession.getLastAssistantText.mockImplementation(() => `Result ${callCount}`);

    const results: string[] = [];
    bus.subscribe("cli", (msg) => results.push(msg.content));

    // Spawn multiple subagents concurrently
    await Promise.all([
      spawn(bus, "Task 1", "cli", "main"),
      spawn(bus, "Task 2", "cli", "main"),
      spawn(bus, "Task 3", "cli", "main"),
    ]);

    // Wait for all subagents to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toHaveLength(3);
  });

  it("should route results to correct origin channel", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const cliResults: string[] = [];
    const httpResults: string[] = [];

    bus.subscribe("cli", (msg) => cliResults.push(msg.content));
    bus.subscribe("http", (msg) => httpResults.push(msg.content));

    await spawn(bus, "CLI task", "cli", "main");
    await spawn(bus, "HTTP task", "http", "session-1");

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cliResults).toHaveLength(1);
    expect(httpResults).toHaveLength(1);
    expect(cliResults[0]).toContain("completed");
    expect(httpResults[0]).toContain("completed");
  });

  it("should preserve chatId for session context", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const receivedMessages: Array<{ chatId: string }> = [];
    bus.subscribe("http", (msg) => receivedMessages.push({ chatId: msg.chatId }));

    await spawn(bus, "Task", "http", "specific-session-123");

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].chatId).toBe("specific-session-123");
  });

  it("should handle subagent errors without affecting bus", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("First fail"))
      .mockResolvedValue({ session: mockSession });

    const { spawn } = await import("../../src/subagent.js");

    const results: string[] = [];
    bus.subscribe("cli", (msg) => results.push(msg.content));

    // First spawn fails
    await spawn(bus, "Failing task", "cli", "main");
    // Second spawn succeeds
    await spawn(bus, "Success task", "cli", "main");

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toHaveLength(2);
    expect(results.some((r) => r.includes("failed"))).toBe(true);
    expect(results.some((r) => r.includes("completed"))).toBe(true);
  });

  it("should handle slow subagents without blocking bus", async () => {
    mockSession.prompt.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const { spawn } = await import("../../src/subagent.js");

    const results: string[] = [];
    bus.subscribe("cli", (msg) => results.push(msg.content));

    // Spawn slow subagent
    await spawn(bus, "Slow task", "cli", "main");

    // Bus should still work immediately
    await bus.publishInbound({ channel: "cli", chatId: "test", content: "test" });
    const msg = await bus.consumeInbound();
    expect(msg.content).toBe("test");

    // Wait for subagent
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(results).toHaveLength(1);
  });
});
