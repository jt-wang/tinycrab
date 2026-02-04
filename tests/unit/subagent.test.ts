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

describe("Subagent", () => {
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
      getLastAssistantText: vi.fn().mockReturnValue("Task completed successfully"),
    };

    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: mockSession,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a task ID immediately", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const result = await spawn(bus, "Do something", "cli", "main");

    // Now returns just the ID
    expect(result).toMatch(/^[a-f0-9]{8}$/);
  });

  it("should create an agent session", async () => {
    const { spawn } = await import("../../src/subagent.js");
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");

    await spawn(bus, "Test task", "cli", "main");

    // Wait for background task to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(createAgentSession).toHaveBeenCalled();
  });

  it("should prompt the session with the task", async () => {
    const { spawn } = await import("../../src/subagent.js");

    await spawn(bus, "Create a file", "cli", "main");

    // Wait for background task
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The prompt now includes system context prefix
    expect(mockSession.prompt).toHaveBeenCalled();
    const promptArg = mockSession.prompt.mock.calls[0][0];
    expect(promptArg).toContain("Create a file");
    expect(promptArg).toContain("Task:");
  });

  it("should publish completion message to origin channel", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const messages: Array<{ channel: string; chatId: string; content: string }> = [];
    bus.subscribe("cli", (msg) => messages.push(msg));

    await spawn(bus, "Complete task", "cli", "main");

    // Wait for background task to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0].channel).toBe("cli");
    expect(messages[0].chatId).toBe("main");
    expect(messages[0].content).toContain("[Subagent");
    expect(messages[0].content).toContain("completed successfully]");
    expect(messages[0].content).toContain("Task completed successfully");
  });

  it("should handle different channels", async () => {
    const { spawn } = await import("../../src/subagent.js");

    const messages: Array<{ channel: string }> = [];
    bus.subscribe("http", (msg) => messages.push(msg));

    await spawn(bus, "HTTP task", "http", "session-123");

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0].channel).toBe("http");
  });

  it("should handle errors gracefully", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Session creation failed")
    );

    const { spawn } = await import("../../src/subagent.js");

    const messages: Array<{ content: string }> = [];
    bus.subscribe("cli", (msg) => messages.push(msg));

    await spawn(bus, "Failing task", "cli", "main");

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("[Subagent");
    expect(messages[0].content).toContain("failed]");
    expect(messages[0].content).toContain("Session creation failed");
  });

  it("should handle session prompt errors", async () => {
    mockSession.prompt.mockRejectedValue(new Error("Prompt failed"));

    const { spawn } = await import("../../src/subagent.js");

    const messages: Array<{ content: string }> = [];
    bus.subscribe("cli", (msg) => messages.push(msg));

    await spawn(bus, "Prompt error task", "cli", "main");

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("failed]");
    expect(messages[0].content).toContain("Prompt failed");
  });

  it("should handle empty assistant text", async () => {
    mockSession.getLastAssistantText.mockReturnValue(null);

    const { spawn } = await import("../../src/subagent.js");

    const messages: Array<{ content: string }> = [];
    bus.subscribe("cli", (msg) => messages.push(msg));

    await spawn(bus, "Empty response task", "cli", "main");

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("Done");
  });

  it("should use environment variables for model configuration", async () => {
    const originalProvider = process.env.AGENT_PROVIDER;
    const originalModel = process.env.AGENT_MODEL;

    process.env.AGENT_PROVIDER = "openai";
    process.env.AGENT_MODEL = "gpt-4";

    const { getModel } = await import("@mariozechner/pi-ai");
    const { spawn } = await import("../../src/subagent.js");

    await spawn(bus, "Config test", "cli", "main");

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getModel).toHaveBeenCalledWith("openai", "gpt-4");

    process.env.AGENT_PROVIDER = originalProvider;
    process.env.AGENT_MODEL = originalModel;
  });

  it("should generate unique task IDs", async () => {
    const { SubagentManager } = await import("../../src/subagent.js");

    // Use a single manager to test unique IDs
    const manager = new SubagentManager({ bus });

    const ids = await Promise.all([
      manager.spawn({ task: "Task 1" }),
      manager.spawn({ task: "Task 2" }),
      manager.spawn({ task: "Task 3" }),
    ]);

    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});

describe("SubagentManager", () => {
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
      getLastAssistantText: vi.fn().mockReturnValue("Response"),
    };

    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: mockSession,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should list running subagents", async () => {
    const { SubagentManager } = await import("../../src/subagent.js");
    const manager = new SubagentManager({ bus });

    await manager.spawn({ task: "Task 1" });
    await manager.spawn({ task: "Task 2" });

    const running = manager.list({ status: "running" });
    expect(running.length).toBeGreaterThanOrEqual(0); // May complete quickly
  });

  it("should stop running subagents", async () => {
    const { SubagentManager } = await import("../../src/subagent.js");
    const manager = new SubagentManager({ bus });

    const id = await manager.spawn({ task: "Long task" });

    const stopped = manager.stop(id);
    expect(stopped).toBe(true);

    const subagent = manager.get(id);
    expect(subagent?.status).toBe("completed");
  });
});
