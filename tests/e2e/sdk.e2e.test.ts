/**
 * E2E tests for the SDK with real LLM calls.
 *
 * Run with: OPENAI_API_KEY=xxx npm run test:e2e
 *
 * These tests:
 * - Make real API calls (costs money)
 * - Are slow (LLM response time)
 * - Skip if no API key is set
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Tinycrab } from "../../src/sdk/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
const PROVIDER = process.env.OPENAI_API_KEY ? "openai" : "anthropic";
const MODEL = process.env.OPENAI_API_KEY ? "gpt-4o-mini" : "claude-3-haiku-20240307";

const TEST_DATA_DIR = path.join(process.cwd(), ".tinycrab-e2e-test");

// Skip all tests if no API key
const describeWithKey = API_KEY ? describe : describe.skip;

describeWithKey("SDK E2E Tests (Real LLM)", () => {
  let tc: Tinycrab;

  beforeAll(async () => {
    // Clean up any previous test data
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (tc) {
      await tc.close();
    }
    // Clean up test data
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    tc = new Tinycrab({
      apiKey: API_KEY,
      provider: PROVIDER,
      model: MODEL,
      dataDir: TEST_DATA_DIR,
    });
  });

  it("should create an agent and chat", async () => {
    const agent = await tc.agent("test-chat");

    const result = await agent.chat("What is 2 + 2? Reply with just the number.");

    expect(result.response).toContain("4");
    expect(result.sessionId).toBeDefined();

    await agent.destroy({ cleanup: true });
  }, 60000);

  it("should maintain conversation context", async () => {
    const agent = await tc.agent("test-context");

    const result1 = await agent.chat("My name is Alice. Remember that.");
    expect(result1.sessionId).toBeDefined();

    const result2 = await agent.chat("What is my name?", {
      sessionId: result1.sessionId,
    });

    expect(result2.response.toLowerCase()).toContain("alice");

    await agent.destroy({ cleanup: true });
  }, 90000);

  it("should spawn multiple agents", async () => {
    const agents = await Promise.all([
      tc.spawn({ prefix: "multi" }),
      tc.spawn({ prefix: "multi" }),
    ]);

    expect(agents.length).toBe(2);
    expect(agents[0].id).not.toBe(agents[1].id);
    expect(agents[0].id).toMatch(/^multi-[a-f0-9]+$/);

    // Both should be able to chat
    const [r1, r2] = await Promise.all([
      agents[0].chat("Say 'hello1'"),
      agents[1].chat("Say 'hello2'"),
    ]);

    expect(r1.response.toLowerCase()).toContain("hello");
    expect(r2.response.toLowerCase()).toContain("hello");

    // Cleanup
    await Promise.all(agents.map((a) => a.destroy({ cleanup: true })));
  }, 120000);

  it("should list agents", async () => {
    const agent1 = await tc.agent("list-test-1");
    const agent2 = await tc.agent("list-test-2");

    const list = await tc.list();

    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((a) => a.id === "list-test-1")).toBe(true);
    expect(list.some((a) => a.id === "list-test-2")).toBe(true);

    await agent1.destroy({ cleanup: true });
    await agent2.destroy({ cleanup: true });
  }, 60000);

  it("should stop agent", async () => {
    const agent = await tc.agent("stop-test");

    // Chat first
    const r1 = await agent.chat("Say 'before stop'");
    expect(r1.response).toBeDefined();

    // Stop
    await agent.stop();
    const status = await agent.status();
    expect(status.status).toBe("stopped");

    await agent.destroy({ cleanup: true });
  }, 90000);

  // TODO: Fix restart - currently spawn doesn't properly restart stopped agents
  it.skip("should restart stopped agent", async () => {
    const agent = await tc.agent("restart-test");
    await agent.chat("Say 'before stop'");
    await agent.stop();

    // Get again (should restart)
    const agent2 = await tc.agent("restart-test");
    const r2 = await agent2.chat("Say 'after restart'");
    expect(r2.response).toBeDefined();

    await agent2.destroy({ cleanup: true });
  }, 90000);

  it("should use tools (read/write files)", async () => {
    const agent = await tc.agent("tools-test");

    // Ask agent to create a file
    const r1 = await agent.chat(
      "Create a file called 'test.txt' in the current directory with the content 'hello world'. " +
      "Use the write tool. Reply with 'done' when finished."
    );

    // Give it time to process
    expect(r1.response.toLowerCase()).toMatch(/done|created|written|file/);

    // Ask agent to read it back
    const r2 = await agent.chat(
      "Read the file 'test.txt' and tell me what it contains."
    );

    expect(r2.response.toLowerCase()).toContain("hello");

    await agent.destroy({ cleanup: true });
  }, 120000);
});

// TODO: Subagent tools integration with SDK needs work
// The SDK spawns agent-server which doesn't have subagent tools configured
describeWithKey.skip("Subagent E2E Tests (Real LLM)", () => {
  let tc: Tinycrab;

  beforeAll(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (tc) {
      await tc.close();
    }
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    tc = new Tinycrab({
      apiKey: API_KEY,
      provider: PROVIDER,
      model: MODEL,
      dataDir: TEST_DATA_DIR,
    });
  });

  it("should spawn subagent via tool", async () => {
    const agent = await tc.agent("subagent-test");

    // Ask agent to spawn a subagent
    const result = await agent.chat(
      "Use the spawn_subagent tool to create a subagent with the task: 'Calculate 10 + 20 and report the result'. " +
      "Tell me the subagent ID when done."
    );

    // Should mention spawning or an ID
    expect(result.response).toMatch(/spawn|subagent|id|background/i);

    // Wait for subagent to complete and announce
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Ask about status
    const r2 = await agent.chat(
      "Use list_subagents to check on the subagent status."
    );

    expect(r2.response).toMatch(/subagent|completed|running|list/i);

    await agent.destroy({ cleanup: true });
  }, 180000);
});
