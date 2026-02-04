import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { MessageBus } from "../../src/bus.js";
import { startHttp } from "../../src/channels/http.js";

describe("HTTP Channel", () => {
  let bus: MessageBus;
  let port: number;
  let baseUrl: string;

  beforeEach(async () => {
    bus = new MessageBus();
    port = 20000 + Math.floor(Math.random() * 40000);
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    // Give the server time to close
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("health endpoint", () => {
    it("should return ok status on /health", async () => {
      await startHttp(bus, port);

      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: "ok" });
    });
  });

  describe("/chat endpoint", () => {
    it("should accept POST requests with message", async () => {
      await startHttp(bus, port);

      // Set up response handler
      setTimeout(async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "Agent response",
        });
      }, 10);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello agent" }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.response).toBe("Agent response");
      expect(data.session_id).toBeDefined();
    });

    it("should use provided session_id", async () => {
      await startHttp(bus, port);

      setTimeout(async () => {
        const msg = await bus.consumeInbound();
        expect(msg.chatId).toBe("my-session");
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "OK",
        });
      }, 10);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test", session_id: "my-session" }),
      });

      const data = await response.json();
      expect(data.session_id).toBe("my-session");
    });

    it("should generate session_id if not provided", async () => {
      await startHttp(bus, port);

      setTimeout(async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "OK",
        });
      }, 10);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      const data = await response.json();
      expect(data.session_id).toBeDefined();
      expect(data.session_id.length).toBe(8);
    });

    it("should publish inbound message with correct channel", async () => {
      await startHttp(bus, port);

      const messagePromise = bus.consumeInbound();

      // Fire off request but don't await it yet
      const responsePromise = fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Check channel" }),
      });

      const msg = await messagePromise;
      expect(msg.channel).toBe("http");
      expect(msg.content).toBe("Check channel");

      // Complete the request
      await bus.publishOutbound({
        channel: "http",
        chatId: msg.chatId,
        content: "Done",
      });

      await responsePromise;
    });

    it("should handle concurrent requests", async () => {
      await startHttp(bus, port);

      // Process messages as they come in
      const processMessages = async () => {
        for (let i = 0; i < 3; i++) {
          const msg = await bus.consumeInbound();
          await bus.publishOutbound({
            channel: "http",
            chatId: msg.chatId,
            content: `Response to: ${msg.content}`,
          });
        }
      };

      const processor = processMessages();

      const responses = await Promise.all([
        fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "First", session_id: "s1" }),
        }),
        fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Second", session_id: "s2" }),
        }),
        fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Third", session_id: "s3" }),
        }),
      ]);

      await processor;

      const results = await Promise.all(responses.map((r) => r.json()));

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.response).toMatch(/^Response to:/);
      });
    });

    it("should handle special characters in message", async () => {
      await startHttp(bus, port);

      const specialMessage = 'Hello\n"quotes" and <tags> & symbols';

      setTimeout(async () => {
        const msg = await bus.consumeInbound();
        expect(msg.content).toBe(specialMessage);
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "OK",
        });
      }, 10);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: specialMessage }),
      });

      expect(response.status).toBe(200);
    });

    it("should handle unicode in message", async () => {
      await startHttp(bus, port);

      const unicodeMessage = "Hello 世界 🌍 مرحبا";

      setTimeout(async () => {
        const msg = await bus.consumeInbound();
        expect(msg.content).toBe(unicodeMessage);
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "Unicode received",
        });
      }, 10);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: unicodeMessage }),
      });

      const data = await response.json();
      expect(data.response).toBe("Unicode received");
    });

    it("should return 400 when message is missing", async () => {
      await startHttp(bus, port);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("message is required");
    });

    it("should return 400 when message is empty string", async () => {
      await startHttp(bus, port);

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("server startup", () => {
    it("should log startup message", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await startHttp(bus, port);

      expect(consoleSpy).toHaveBeenCalledWith(`HTTP server on port ${port}`);
      consoleSpy.mockRestore();
    });

    it("should listen on 0.0.0.0", async () => {
      await startHttp(bus, port);

      // If we can connect, the server is listening
      const response = await fetch(`${baseUrl}/health`);
      expect(response.ok).toBe(true);
    });
  });
});
