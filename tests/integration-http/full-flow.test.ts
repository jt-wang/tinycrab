import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MessageBus } from "../../src/bus.js";
import { startHttp } from "../../src/channels/http.js";

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

describe("End-to-End Flow Tests", () => {
  let bus: MessageBus;
  let port: number;
  let baseUrl: string;
  let mockSession: {
    prompt: ReturnType<typeof vi.fn>;
    getLastAssistantText: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    bus = new MessageBus();
    port = 30000 + Math.floor(Math.random() * 30000);
    baseUrl = `http://localhost:${port}`;
    vi.resetModules();

    mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      getLastAssistantText: vi.fn().mockReturnValue("Agent response"),
    };

    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    (createAgentSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: mockSession,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("HTTP API complete flow", () => {
    it("should handle a complete request-response cycle", async () => {
      await startHttp(bus, port);

      // Simulate the main agent loop
      const agentLoop = async () => {
        const msg = await bus.consumeInbound();

        // Process with mock session
        await mockSession.prompt(msg.content);
        const response = mockSession.getLastAssistantText();

        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: response,
        });
      };

      const loopPromise = agentLoop();

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello agent" }),
      });

      await loopPromise;

      const data = await response.json();
      expect(data.response).toBe("Agent response");
      expect(mockSession.prompt).toHaveBeenCalledWith("Hello agent");
    });

    it("should handle conversation with session persistence", async () => {
      await startHttp(bus, port);

      const conversationHistory = new Map<string, string[]>();

      // Simulate agent with memory
      const agentLoop = async (iterations: number) => {
        for (let i = 0; i < iterations; i++) {
          const msg = await bus.consumeInbound();

          if (!conversationHistory.has(msg.chatId)) {
            conversationHistory.set(msg.chatId, []);
          }
          conversationHistory.get(msg.chatId)!.push(msg.content);

          const history = conversationHistory.get(msg.chatId)!;
          const response = `Turn ${history.length}: received "${msg.content}"`;

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: response,
          });
        }
      };

      const loopPromise = agentLoop(3);

      // First message
      const res1 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "First", session_id: "conv-1" }),
      });
      const data1 = await res1.json();
      expect(data1.response).toBe('Turn 1: received "First"');

      // Second message in same session
      const res2 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Second", session_id: "conv-1" }),
      });
      const data2 = await res2.json();
      expect(data2.response).toBe('Turn 2: received "Second"');

      // Third message
      const res3 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Third", session_id: "conv-1" }),
      });
      const data3 = await res3.json();
      expect(data3.response).toBe('Turn 3: received "Third"');

      await loopPromise;
    });

    it("should isolate multiple user sessions", async () => {
      await startHttp(bus, port);

      const sessions = new Map<string, number>();

      const agentLoop = async (iterations: number) => {
        for (let i = 0; i < iterations; i++) {
          const msg = await bus.consumeInbound();

          const count = (sessions.get(msg.chatId) || 0) + 1;
          sessions.set(msg.chatId, count);

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Session ${msg.chatId}: message #${count}`,
          });
        }
      };

      const loopPromise = agentLoop(4);

      // User A - first message
      const a1 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "A1", session_id: "user-a" }),
      });

      // User B - first message
      const b1 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "B1", session_id: "user-b" }),
      });

      // User A - second message
      const a2 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "A2", session_id: "user-a" }),
      });

      // User B - second message
      const b2 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "B2", session_id: "user-b" }),
      });

      await loopPromise;

      const dataA1 = await a1.json();
      const dataB1 = await b1.json();
      const dataA2 = await a2.json();
      const dataB2 = await b2.json();

      expect(dataA1.response).toBe("Session user-a: message #1");
      expect(dataA2.response).toBe("Session user-a: message #2");
      expect(dataB1.response).toBe("Session user-b: message #1");
      expect(dataB2.response).toBe("Session user-b: message #2");
    });
  });

  describe("Subagent spawning flow", () => {
    it("should spawn and complete background tasks", async () => {
      await startHttp(bus, port);

      const { spawn } = await import("../../src/subagent.js");

      let httpResponses: string[] = [];
      bus.subscribe("http", (msg) => httpResponses.push(msg.content));

      // Simulate main agent that spawns subagent
      const agentLoop = async () => {
        const msg = await bus.consumeInbound();

        if (msg.content.startsWith("/background ")) {
          const task = msg.content.replace("/background ", "");
          const taskId = await spawn(bus, task, "http", msg.chatId);
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Background task started (id: ${taskId})`,
          });
        }
      };

      const loopPromise = agentLoop();

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "/background Run analysis",
          session_id: "bg-test",
        }),
      });

      await loopPromise;

      const data = await response.json();
      expect(data.response).toMatch(/Background task started \(id: [a-f0-9]{8}\)/);

      // Wait for subagent to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have received completion notification
      expect(httpResponses.some((r) => r.includes("completed"))).toBe(true);
    });
  });

  describe("Health check flow", () => {
    it("should return health status without affecting message flow", async () => {
      await startHttp(bus, port);

      // Health check
      const healthResponse = await fetch(`${baseUrl}/health`);
      const healthData = await healthResponse.json();
      expect(healthData.status).toBe("ok");

      // Message flow should still work
      const agentLoop = async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: "Still working",
        });
      };

      const loopPromise = agentLoop();

      const chatResponse = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Test" }),
      });

      await loopPromise;

      const chatData = await chatResponse.json();
      expect(chatData.response).toBe("Still working");
    });
  });

  describe("Error recovery flow", () => {
    it("should recover from processing errors", async () => {
      await startHttp(bus, port);

      let attempts = 0;

      const agentLoop = async (iterations: number) => {
        for (let i = 0; i < iterations; i++) {
          const msg = await bus.consumeInbound();
          attempts++;

          let response: string;
          if (attempts === 1) {
            response = "Error: Something went wrong";
          } else {
            response = "Success on retry";
          }

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: response,
          });
        }
      };

      const loopPromise = agentLoop(2);

      // First attempt - error
      const res1 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Try 1" }),
      });
      const data1 = await res1.json();
      expect(data1.response).toContain("Error");

      // Second attempt - success
      const res2 = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Try 2" }),
      });
      const data2 = await res2.json();
      expect(data2.response).toBe("Success on retry");

      await loopPromise;
    });

    it("should handle malformed requests gracefully", async () => {
      await startHttp(bus, port);

      // Missing message field
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Server should return 400 error for missing message
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("message is required");
    });
  });

  describe("High load flow", () => {
    it("should handle burst of requests", async () => {
      await startHttp(bus, port);

      const requestCount = 10;
      let processed = 0;

      const agentLoop = async () => {
        while (processed < requestCount) {
          const msg = await bus.consumeInbound();
          processed++;
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Processed #${processed}`,
          });
        }
      };

      const loopPromise = agentLoop();

      // Send burst of requests
      const requests = Array.from({ length: requestCount }, (_, i) =>
        fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Request ${i}`, session_id: `s${i}` }),
        })
      );

      const responses = await Promise.all(requests);
      await loopPromise;

      // All requests should complete
      expect(responses.filter((r) => r.status === 200)).toHaveLength(requestCount);

      const data = await Promise.all(responses.map((r) => r.json()));
      const responseTexts = data.map((d) => d.response);

      // All should have been processed
      expect(responseTexts.every((r) => r.startsWith("Processed #"))).toBe(true);
    });
  });
});
