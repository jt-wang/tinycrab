import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as readline from "readline";
import { MessageBus } from "../../src/bus.js";

// Mock readline module
vi.mock("readline", () => {
  const mockInterface = {
    on: vi.fn(),
    setPrompt: vi.fn(),
    prompt: vi.fn(),
    close: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockInterface),
  };
});

describe("CLI Channel", () => {
  let bus: MessageBus;
  let mockRl: {
    on: ReturnType<typeof vi.fn>;
    setPrompt: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    bus = new MessageBus();
    vi.resetModules();

    mockRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    }) as unknown as typeof mockRl;

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize readline interface", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    expect(readline.createInterface).toHaveBeenCalled();
  });

  it("should set prompt and display welcome message", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    expect(mockRl.setPrompt).toHaveBeenCalledWith("> ");
    expect(consoleSpy).toHaveBeenCalledWith("Agent ready. Type 'exit' to quit.\n");
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it("should subscribe to cli channel for outbound messages", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const callback = vi.fn();
    bus.subscribe("cli", callback);

    await bus.publishOutbound({
      channel: "cli",
      chatId: "main",
      content: "test response",
    });

    expect(callback).toHaveBeenCalled();
  });

  it("should register line event handler", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    expect(mockRl.on).toHaveBeenCalledWith("line", expect.any(Function));
  });

  it("should exit on 'exit' command", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];
    expect(lineHandler).toBeDefined();

    lineHandler!("exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should exit on 'EXIT' command (case insensitive)", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];
    lineHandler!("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should publish non-empty input to bus", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];

    const consumePromise = bus.consumeInbound();
    lineHandler!("hello world");

    const msg = await consumePromise;
    expect(msg).toEqual({
      channel: "cli",
      chatId: "main",
      content: "hello world",
    });
  });

  it("should prompt again on empty input", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const initialPromptCalls = mockRl.prompt.mock.calls.length;

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];
    lineHandler!("");

    expect(mockRl.prompt.mock.calls.length).toBe(initialPromptCalls + 1);
  });

  it("should prompt again on whitespace-only input", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const initialPromptCalls = mockRl.prompt.mock.calls.length;

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];
    lineHandler!("   ");

    expect(mockRl.prompt.mock.calls.length).toBe(initialPromptCalls + 1);
  });

  it("should trim whitespace from exit command", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    const lineHandler = mockRl.on.mock.calls.find((call) => call[0] === "line")?.[1];
    lineHandler!("  exit  ");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should output outbound messages with newlines", async () => {
    const { startCli } = await import("../../src/channels/cli.js");
    startCli(bus);

    await bus.publishOutbound({
      channel: "cli",
      chatId: "main",
      content: "Agent response",
    });

    expect(consoleSpy).toHaveBeenCalledWith("\nAgent response\n");
  });
});
