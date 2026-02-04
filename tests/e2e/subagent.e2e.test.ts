/**
 * E2E tests for subagent system with real LLM.
 *
 * Tests:
 * - Subagent spawn, stop, list via LLM tools
 * - Nested spawn blocking (subagents can't spawn subagents)
 * - Subagent timeout
 * - Async announce-back
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAgentSession, codingTools, AuthStorage } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { MessageBus } from "../../src/bus.js";
import { SubagentManager } from "../../src/subagent.js";
import { createSubagentTools } from "../../src/tools/subagent.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const hasApiKey = hasOpenAiKey || hasAnthropicKey;

const provider = hasOpenAiKey ? "openai" : "anthropic";
const model = hasOpenAiKey ? "gpt-4o-mini" : "claude-sonnet-4-20250514";

describe.skipIf(!hasApiKey)("Subagent E2E Tests", () => {
  let tempDir: string;
  let bus: MessageBus;
  let authStorage: AuthStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-subagent-e2e-"));
    bus = new MessageBus();

    authStorage = new AuthStorage();
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      authStorage.setRuntimeApiKey(provider, apiKey);
    }
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("SubagentManager Direct Tests", () => {
    it("should spawn and track a subagent", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const id = await manager.spawn({
        task: "What is 2 + 2? Reply with just the number.",
        label: "math-test",
      });

      expect(id).toBeDefined();
      expect(id.length).toBe(8);

      const subagent = manager.get(id);
      expect(subagent).toBeDefined();
      expect(subagent?.status).toBe("running");
      expect(subagent?.label).toBe("math-test");

      // Wait for completion
      await new Promise<void>((resolve) => {
        const check = () => {
          const s = manager.get(id);
          if (s?.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });

      const completed = manager.get(id);
      expect(completed?.status).toBe("completed");
      expect(completed?.result).toContain("4");
      expect(completed?.stats?.runtimeMs).toBeGreaterThan(0);
    }, 90000);

    it("should list subagents by status", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      // Spawn two subagents
      const id1 = await manager.spawn({
        task: "Say 'one'",
        label: "task-1",
      });
      const id2 = await manager.spawn({
        task: "Say 'two'",
        label: "task-2",
      });

      // Initially both should be running
      const running = manager.list({ status: "running" });
      expect(running.length).toBeGreaterThanOrEqual(2);

      // Wait for completion
      await new Promise<void>((resolve) => {
        const check = () => {
          const s1 = manager.get(id1);
          const s2 = manager.get(id2);
          if (s1?.status !== "running" && s2?.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });

      // Now should be completed
      const completed = manager.list({ status: "completed" });
      expect(completed.length).toBeGreaterThanOrEqual(2);
    }, 120000);

    it("should stop a running subagent", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const id = await manager.spawn({
        task: "Count from 1 to 1000 slowly, one number per line.",
        label: "long-task",
      });

      // Wait a bit for it to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const stopped = manager.stop(id);
      expect(stopped).toBe(true);

      const subagent = manager.get(id);
      expect(subagent?.status).toBe("completed");
      expect(subagent?.result).toBe("Stopped by request");
    }, 30000);

    it("should handle timeout", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const id = await manager.spawn({
        task: "Count from 1 to 10000, one number per line. Take your time.",
        label: "timeout-test",
        timeoutSeconds: 2, // Very short timeout
      });

      // Wait for timeout
      await new Promise<void>((resolve) => {
        const check = () => {
          const s = manager.get(id);
          if (s?.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        setTimeout(check, 2500);
      });

      const subagent = manager.get(id);
      expect(subagent?.status).toBe("failed");
      expect(subagent?.error).toContain("Timeout");
    }, 30000);

    it("should announce results via message bus", async () => {
      const announcements: string[] = [];

      bus.subscribe("test", (msg) => {
        announcements.push(msg.content);
      });

      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const id = await manager.spawn({
        task: "What is 3 + 3? Reply with just the number.",
        label: "announce-test",
      });

      // Wait for completion
      await new Promise<void>((resolve) => {
        const check = () => {
          const s = manager.get(id);
          if (s?.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });

      expect(announcements.length).toBeGreaterThanOrEqual(1);
      expect(announcements.some(a => a.includes(id))).toBe(true);
      expect(announcements.some(a => a.includes("6") || a.includes("Findings"))).toBe(true);
    }, 90000);

    it("should cleanup old completed subagents", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const id = await manager.spawn({
        task: "Say 'cleanup test'",
        label: "cleanup-test",
      });

      // Wait for completion
      await new Promise<void>((resolve) => {
        const check = () => {
          const s = manager.get(id);
          if (s?.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });

      // Cleanup with 0ms maxAge should remove it
      const cleaned = manager.cleanup(0);
      expect(cleaned).toBe(1);

      const subagent = manager.get(id);
      expect(subagent).toBeUndefined();
    }, 60000);
  });

  describe("LLM with Subagent Tools", () => {
    it("LLM should spawn subagent via tool", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      const subagentTools = createSubagentTools({
        manager,
        channel: "test",
        chatId: "main",
        isSubagent: false,
      });

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: subagentTools as any,
        cwd: tempDir,
        authStorage,
      });

      console.log("\n[User]: Spawn a subagent to calculate 10 + 10");
      await session.prompt(
        "Use the spawn_subagent tool to create a background task that calculates 10 + 10. " +
        "Set the label to 'math-calc'. Tell me the subagent ID."
      );
      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      expect(response?.toLowerCase()).toMatch(/spawn|subagent|id|background/i);

      // Verify subagent was created
      const list = manager.list();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some(s => s.label === "math-calc")).toBe(true);
    }, 90000);

    it("LLM should list subagents via tool", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      // Pre-spawn a subagent
      await manager.spawn({
        task: "Say hello",
        label: "pre-spawned",
      });

      const subagentTools = createSubagentTools({
        manager,
        channel: "test",
        chatId: "main",
        isSubagent: false,
      });

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: subagentTools as any,
        cwd: tempDir,
        authStorage,
      });

      console.log("\n[User]: List all subagents");
      await session.prompt(
        "Use the list_subagents tool to show all subagents. Tell me what you found."
      );
      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      expect(response?.toLowerCase()).toMatch(/subagent|pre-spawned|running|completed/i);
    }, 60000);

    it("LLM should stop subagent via tool", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      // Spawn a long-running subagent
      const id = await manager.spawn({
        task: "Count from 1 to 10000 slowly",
        label: "stop-me",
      });

      const subagentTools = createSubagentTools({
        manager,
        channel: "test",
        chatId: "main",
        isSubagent: false,
      });

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: subagentTools as any,
        cwd: tempDir,
        authStorage,
      });

      console.log(`\n[User]: Stop subagent ${id}`);
      await session.prompt(
        `Use the stop_subagent tool to stop the subagent with ID "${id}". Confirm when done.`
      );
      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      expect(response?.toLowerCase()).toMatch(/stop|stopped/i);

      const subagent = manager.get(id);
      expect(subagent?.status).toBe("completed");
    }, 60000);

    it("should block nested spawning (isSubagent=true)", async () => {
      const manager = new SubagentManager({
        bus,
        defaultChannel: "test",
        defaultChatId: "main",
        authStorage,
      });

      // Create tools with isSubagent=true (simulating a subagent trying to spawn)
      const subagentTools = createSubagentTools({
        manager,
        channel: "test",
        chatId: "main",
        isSubagent: true, // This is the key - subagent mode
      });

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: subagentTools as any,
        cwd: tempDir,
        authStorage,
      });

      console.log("\n[User]: Try to spawn a subagent (should be blocked)");
      await session.prompt(
        "Use the spawn_subagent tool to create a task. What happens?"
      );
      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      // Should mention error or blocked
      expect(response?.toLowerCase()).toMatch(/error|cannot|blocked|not allowed|subagent/i);

      // No subagents should have been created
      const list = manager.list();
      expect(list.length).toBe(0);
    }, 60000);
  });
});

describe.skipIf(!hasApiKey)("Memory Tags E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-tags-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("LLM should filter recall by tags", async () => {
    const { FileMemoryProvider } = await import("../../src/memory/file-provider.js");
    const { createMemoryTools } = await import("../../src/tools/memory.js");

    const memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));

    // Pre-populate with tagged memories
    await memory.add({
      content: "User prefers dark mode",
      importance: 0.8,
      tags: ["preference", "ui"],
    });
    await memory.add({
      content: "Project deadline is January 15th",
      importance: 0.9,
      tags: ["deadline", "project"],
    });
    await memory.add({
      content: "User likes TypeScript",
      importance: 0.7,
      tags: ["preference", "language"],
    });

    const memoryTools = createMemoryTools(memory);

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      customTools: memoryTools as any,
      cwd: tempDir,
    });

    console.log("\n[User]: Recall only memories with 'preference' tag");
    await session.prompt(
      "Use the recall tool to search for memories with tag 'preference'. " +
      "What preferences have been stored?"
    );
    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Should mention dark mode and TypeScript (both have 'preference' tag)
    expect(response?.toLowerCase()).toMatch(/dark|typescript|preference/i);
    // Should NOT mention deadline (has 'project' tag, not 'preference')
    expect(response?.toLowerCase()).not.toContain("january");

    await memory.close?.();
  }, 90000);

  it("LLM should remember with custom tags", async () => {
    const { FileMemoryProvider } = await import("../../src/memory/file-provider.js");
    const { createMemoryTools } = await import("../../src/tools/memory.js");

    const memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
    const memoryTools = createMemoryTools(memory);

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      customTools: memoryTools as any,
      cwd: tempDir,
    });

    console.log("\n[User]: Remember something with specific tags");
    await session.prompt(
      "Use the remember tool to store: 'The API endpoint is /api/v2/users'. " +
      "Set importance to 0.9 and add tags: 'api', 'endpoint', 'technical'."
    );
    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify tags were stored
    const entries = await memory.list();
    const apiEntry = entries.find(e => e.content.includes("API endpoint"));
    expect(apiEntry).toBeDefined();
    expect(apiEntry?.tags).toContain("api");
    expect(apiEntry?.tags).toContain("endpoint");
    expect(apiEntry?.tags).toContain("technical");

    await memory.close?.();
  }, 60000);
});
