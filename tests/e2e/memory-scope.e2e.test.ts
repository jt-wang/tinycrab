/**
 * E2E tests for memory scope (global vs per-session).
 *
 * Verifies that:
 * - Global memories are visible to all sessions
 * - Session-private memories are only visible to that session
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAgentSession, codingTools } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { FileMemoryProvider } from "../../src/memory/file-provider.js";
import { createMemoryTools } from "../../src/tools/memory.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const hasApiKey = hasOpenAiKey || hasAnthropicKey;

const provider = hasOpenAiKey ? "openai" : "anthropic";
const model = hasOpenAiKey ? "gpt-4o-mini" : "claude-sonnet-4-20250514";

describe.skipIf(!hasApiKey)("Memory Scope E2E Tests", () => {
  let tempDir: string;
  let memory: FileMemoryProvider;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-memory-scope-"));
    memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
  });

  afterEach(async () => {
    await memory.close?.();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Global vs Session Memory", () => {
    it("global memory should be visible to all sessions", async () => {
      // Store global memory (no sessionId)
      await memory.add({
        content: "Project deadline is December 25th",
        importance: 0.9,
        tags: ["deadline", "global"],
        // No sessionId = global
      });

      // Session A should see it
      const resultsA = await memory.search({
        query: "deadline",
        sessionId: "session-a",
      });
      expect(resultsA.length).toBe(1);
      expect(resultsA[0].entry.content).toContain("December 25th");

      // Session B should also see it
      const resultsB = await memory.search({
        query: "deadline",
        sessionId: "session-b",
      });
      expect(resultsB.length).toBe(1);
      expect(resultsB[0].entry.content).toContain("December 25th");
    });

    it("session-private memory should only be visible to that session", async () => {
      // Session A stores private memory
      await memory.add({
        content: "Alice prefers dark mode",
        importance: 0.8,
        tags: ["preference"],
        sessionId: "session-a",
      });

      // Session A should see it
      const resultsA = await memory.search({
        query: "dark mode",
        sessionId: "session-a",
      });
      expect(resultsA.length).toBe(1);

      // Session B should NOT see it
      const resultsB = await memory.search({
        query: "dark mode",
        sessionId: "session-b",
      });
      expect(resultsB.length).toBe(0);
    });

    it("sessions should see global + their own private memories", async () => {
      // Global memory
      await memory.add({
        content: "Project uses TypeScript",
        importance: 0.9,
        tags: ["tech"],
      });

      // Session A private
      await memory.add({
        content: "Alice likes tabs",
        importance: 0.7,
        tags: ["preference"],
        sessionId: "session-a",
      });

      // Session B private
      await memory.add({
        content: "Bob likes spaces",
        importance: 0.7,
        tags: ["preference"],
        sessionId: "session-b",
      });

      // Session A sees: global + A's private
      const resultsA = await memory.search({
        query: "TypeScript tabs spaces",
        sessionId: "session-a",
        maxResults: 10,
      });
      expect(resultsA.length).toBe(2);
      const contentsA = resultsA.map(r => r.entry.content);
      expect(contentsA.some(c => c.includes("TypeScript"))).toBe(true);
      expect(contentsA.some(c => c.includes("tabs"))).toBe(true);
      expect(contentsA.some(c => c.includes("spaces"))).toBe(false);

      // Session B sees: global + B's private
      const resultsB = await memory.search({
        query: "TypeScript tabs spaces",
        sessionId: "session-b",
        maxResults: 10,
      });
      expect(resultsB.length).toBe(2);
      const contentsB = resultsB.map(r => r.entry.content);
      expect(contentsB.some(c => c.includes("TypeScript"))).toBe(true);
      expect(contentsB.some(c => c.includes("spaces"))).toBe(true);
      expect(contentsB.some(c => c.includes("tabs"))).toBe(false);
    });
  });

  describe("LLM with Memory Scope", () => {
    it("LLM should be able to store and recall global memory", async () => {
      const memoryTools = createMemoryTools(memory);

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: memoryTools as any,
        cwd: tempDir,
      });

      // Store global memory
      console.log("\n[User]: Store globally that the project uses React");
      await session.prompt(
        "Use the remember tool to store: 'Project uses React framework'. " +
        "This is global info, don't set a sessionId. Set importance to 0.9."
      );
      const r1 = session.getLastAssistantText();
      console.log(`[Assistant]: ${r1}`);

      // Recall it
      console.log("[User]: What framework does the project use?");
      await session.prompt(
        "Use the recall tool to find what framework the project uses."
      );
      const r2 = session.getLastAssistantText();
      console.log(`[Assistant]: ${r2}\n`);

      expect(r2?.toLowerCase()).toContain("react");

      // Verify it's global (no sessionId in stored entry)
      const entries = await memory.list();
      const reactEntry = entries.find(e => e.content.toLowerCase().includes("react"));
      expect(reactEntry).toBeDefined();
      expect(reactEntry?.sessionId).toBeUndefined();
    }, 90000);

    it("LLM should be able to store session-private memory", async () => {
      const memoryTools = createMemoryTools(memory);

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: memoryTools as any,
        cwd: tempDir,
      });

      const sessionId = "user-alice-123";

      // Store session-private memory
      console.log("\n[User]: Store my preference (private to this session)");
      await session.prompt(
        `Use the remember tool to store: 'User prefers vim keybindings'. ` +
        `Set sessionId to '${sessionId}' to make it private to this session. Set importance to 0.8.`
      );
      const r1 = session.getLastAssistantText();
      console.log(`[Assistant]: ${r1}`);

      // Verify it has sessionId
      const entries = await memory.list();
      const vimEntry = entries.find(e => e.content.toLowerCase().includes("vim"));
      expect(vimEntry).toBeDefined();
      expect(vimEntry?.sessionId).toBe(sessionId);

      // Another session should not see it
      const resultsOther = await memory.search({
        query: "vim",
        sessionId: "other-session",
      });
      expect(resultsOther.length).toBe(0);

      // Same session should see it
      const resultsSame = await memory.search({
        query: "vim",
        sessionId: sessionId,
      });
      expect(resultsSame.length).toBe(1);
      console.log(`[Verified]: Session-private memory correctly isolated\n`);
    }, 90000);

    it("LLM should recall both global and session memories", async () => {
      const sessionId = "user-bob-456";

      // Pre-populate memories
      await memory.add({
        content: "Company name is Acme Corp",
        importance: 0.9,
        tags: ["company", "global"],
        // No sessionId = global
      });

      await memory.add({
        content: "Bob's favorite color is green",
        importance: 0.8,
        tags: ["preference"],
        sessionId: sessionId,
      });

      await memory.add({
        content: "Carol's favorite color is purple",
        importance: 0.8,
        tags: ["preference"],
        sessionId: "user-carol-789",  // Different session
      });

      const memoryTools = createMemoryTools(memory);

      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        customTools: memoryTools as any,
        cwd: tempDir,
      });

      // Ask about company (global) and color (should only see Bob's)
      console.log("\n[User]: What do you know about the company and favorite colors?");
      await session.prompt(
        `Use the recall tool to search for 'company color'. ` +
        `Set sessionId to '${sessionId}' to see my private memories. ` +
        `Tell me what you found.`
      );
      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      // Should mention Acme and green, but NOT purple
      expect(response?.toLowerCase()).toContain("acme");
      expect(response?.toLowerCase()).toContain("green");
      expect(response?.toLowerCase()).not.toContain("purple");
    }, 90000);
  });
});
