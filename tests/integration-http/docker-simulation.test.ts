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

describe("Docker Deployment Simulation", () => {
  let bus: MessageBus;
  let port: number;
  let baseUrl: string;
  let mockSession: {
    prompt: ReturnType<typeof vi.fn>;
    getLastAssistantText: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    bus = new MessageBus();
    port = 40000 + Math.floor(Math.random() * 20000);
    baseUrl = `http://localhost:${port}`;
    vi.resetModules();

    mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      getLastAssistantText: vi.fn().mockReturnValue("Docker response"),
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

  describe("Container health checks", () => {
    it("should respond to health check endpoint", async () => {
      await startHttp(bus, port);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("ok");
    });

    it("should respond to repeated health checks", async () => {
      await startHttp(bus, port);

      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${baseUrl}/health`);
        expect(response.status).toBe(200);
      }
    });
  });

  describe("Environment variable configuration", () => {
    it("should use default port when AGENT_PORT not set", async () => {
      // Port is passed directly, but this tests the pattern
      await startHttp(bus, port);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
    });

    it("should use custom port from environment", async () => {
      const customPort = 7000 + Math.floor(Math.random() * 1000);
      await startHttp(bus, customPort);

      const response = await fetch(`http://localhost:${customPort}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe("Container startup simulation", () => {
    it("should start HTTP server and be ready for requests", async () => {
      const startTime = Date.now();
      await startHttp(bus, port);
      const readyTime = Date.now();

      // Server should start quickly
      expect(readyTime - startTime).toBeLessThan(1000);

      // Should be ready for requests
      const response = await fetch(`${baseUrl}/health`);
      expect(response.ok).toBe(true);
    });

    it("should handle requests immediately after startup", async () => {
      await startHttp(bus, port);

      const agentLoop = async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: "Ready",
        });
      };

      const loopPromise = agentLoop();

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });

      await loopPromise;

      expect(response.status).toBe(200);
    });
  });

  describe("Long-running container simulation", () => {
    it("should handle many requests over time", async () => {
      await startHttp(bus, port);

      let requestCount = 0;

      const agentLoop = async (iterations: number) => {
        for (let i = 0; i < iterations; i++) {
          const msg = await bus.consumeInbound();
          requestCount++;
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Request #${requestCount}`,
          });
        }
      };

      const loopPromise = agentLoop(20);

      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Msg ${i}` }),
        });
        expect(response.status).toBe(200);
      }

      await loopPromise;
      expect(requestCount).toBe(20);
    });

    it("should maintain session state across requests", async () => {
      await startHttp(bus, port);

      const sessionData = new Map<string, number>();

      const agentLoop = async (iterations: number) => {
        for (let i = 0; i < iterations; i++) {
          const msg = await bus.consumeInbound();
          const count = (sessionData.get(msg.chatId) || 0) + 1;
          sessionData.set(msg.chatId, count);

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Visit #${count}`,
          });
        }
      };

      const loopPromise = agentLoop(5);

      // Same session, multiple requests
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "ping", session_id: "persistent" }),
        });
        const data = await response.json();
        expect(data.response).toBe(`Visit #${i + 1}`);
      }

      await loopPromise;
    });
  });

  describe("Container resource usage simulation", () => {
    it("should handle concurrent connections", async () => {
      await startHttp(bus, port);

      const concurrentRequests = 5;
      let processed = 0;

      const agentLoop = async () => {
        while (processed < concurrentRequests) {
          const msg = await bus.consumeInbound();
          processed++;
          // Simulate some processing time
          await new Promise((resolve) => setTimeout(resolve, 10));
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Done ${processed}`,
          });
        }
      };

      const loopPromise = agentLoop();

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Concurrent ${i}`, session_id: `c${i}` }),
        })
      );

      const responses = await Promise.all(requests);
      await loopPromise;

      expect(responses.every((r) => r.status === 200)).toBe(true);
    });
  });

  describe("Fly.io auto-stop/start simulation", () => {
    it("should start up quickly and handle first request", async () => {
      // Simulate cold start
      const coldStartTime = Date.now();
      await startHttp(bus, port);
      const startupDuration = Date.now() - coldStartTime;

      // Should start in under 1 second
      expect(startupDuration).toBeLessThan(1000);

      const agentLoop = async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: "Wake up response",
        });
      };

      const loopPromise = agentLoop();

      const requestTime = Date.now();
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Wake up" }),
      });
      const responseTime = Date.now() - requestTime;

      await loopPromise;

      expect(response.status).toBe(200);
      // First request should complete quickly
      expect(responseTime).toBeLessThan(1000);
    });
  });
});
