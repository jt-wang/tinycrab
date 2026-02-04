/**
 * E2E tests for HTTP channel with real LLM.
 *
 * Tests the full flow: HTTP request → MessageBus → Session → LLM → Response
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MessageBus } from "../../src/bus.js";
import { SessionManager } from "../../src/session-manager.js";
import { SubagentManager } from "../../src/subagent.js";
import { createSubagentTools } from "../../src/tools/subagent.js";
import { startHttp } from "../../src/channels/http.js";
import { AuthStorage } from "@mariozechner/pi-coding-agent";

const API_KEY = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
const PROVIDER = process.env.OPENAI_API_KEY ? "openai" : "anthropic";
const MODEL = process.env.OPENAI_API_KEY ? "gpt-4o-mini" : "claude-3-haiku-20240307";

const describeWithKey = API_KEY ? describe : describe.skip;

describeWithKey("HTTP Agent E2E (Real LLM)", () => {
  let bus: MessageBus;
  let sessions: SessionManager;
  let subagents: SubagentManager;
  let port: number;
  let baseUrl: string;
  let processLoopRunning = true;

  beforeAll(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    baseUrl = `http://localhost:${port}`;

    bus = new MessageBus();

    // Create auth storage
    const authStorage = new AuthStorage();
    if (API_KEY) {
      authStorage.setRuntimeApiKey(PROVIDER, API_KEY);
    }

    // Create subagent manager
    subagents = new SubagentManager({
      bus,
      defaultChannel: "http",
      defaultChatId: "test",
      authStorage,
    });

    // Create subagent tools
    const subagentTools = createSubagentTools({
      manager: subagents,
      channel: "http",
      chatId: "test",
      isSubagent: false,
    });

    // Create session manager with real LLM
    sessions = new SessionManager(
      {
        provider: PROVIDER,
        model: MODEL,
        workspace: process.cwd(),
        agentDir: "./.tinycrab-e2e-http",
        additionalTools: subagentTools as any,
        authStorage,
      },
      {
        maxSessions: 10,
        sessionTtlMs: 5 * 60 * 1000,
      }
    );

    // Start HTTP server
    await startHttp(bus, port);

    // Start simple process loop
    const processLoop = async () => {
      while (processLoopRunning) {
        try {
          const msg = await Promise.race([
            bus.consumeInbound(),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 100)
            ),
          ]);

          if (!msg) continue;

          subagents.setCurrentContext(msg.channel, msg.chatId);

          const text = await sessions.withSession(
            { channel: msg.channel, chatId: msg.chatId },
            async (session) => {
              await session.prompt(msg.content);
              return session.getLastAssistantText() || "";
            }
          );

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: text,
          });
        } catch (err) {
          console.error("Process loop error:", err);
        }
      }
    };

    processLoop();
  });

  afterAll(async () => {
    processLoopRunning = false;
    await sessions.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it("should handle basic chat via HTTP", async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is 5 + 5? Reply with just the number.",
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string; session_id: string };
    expect(data.response).toContain("10");
    expect(data.session_id).toBeDefined();
  }, 60000);

  it("should maintain session across requests", async () => {
    // First request
    const r1 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "My favorite color is blue. Remember that.",
        session_id: "color-session",
      }),
    });

    const data1 = (await r1.json()) as { response: string };
    expect(r1.status).toBe(200);

    // Second request with same session
    const r2 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is my favorite color?",
        session_id: "color-session",
      }),
    });

    const data2 = (await r2.json()) as { response: string };
    expect(data2.response.toLowerCase()).toContain("blue");
  }, 90000);

  // TODO: Subagent tools need to be properly integrated with customTools
  // The current setup passes them as additionalTools but pi-coding-agent
  // may expect them in a different format
  it.skip("should spawn subagent via HTTP", async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "Use spawn_subagent to create a background task that calculates 100 + 200. " +
          "Tell me the subagent ID.",
        session_id: "subagent-session",
      }),
    });

    const data = (await response.json()) as { response: string };
    expect(response.status).toBe(200);
    expect(data.response).toMatch(/spawn|subagent|id|background/i);

    // Wait for subagent to complete
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Check subagent list
    const r2 = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Use list_subagents to show all subagents and their status.",
        session_id: "subagent-session",
      }),
    });

    const data2 = (await r2.json()) as { response: string };
    expect(data2.response).toMatch(/subagent|list|completed|running/i);
  }, 180000);

  it("should handle concurrent sessions", async () => {
    const requests = [
      fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Say 'apple'",
          session_id: "concurrent-1",
        }),
      }),
      fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Say 'banana'",
          session_id: "concurrent-2",
        }),
      }),
    ];

    const responses = await Promise.all(requests);
    const data = await Promise.all(
      responses.map((r) => r.json() as Promise<{ response: string }>)
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);

    // Each should have responded (content may vary)
    expect(data[0].response.length).toBeGreaterThan(0);
    expect(data[1].response.length).toBeGreaterThan(0);
  }, 120000);
});
