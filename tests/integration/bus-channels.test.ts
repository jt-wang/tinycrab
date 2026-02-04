import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MessageBus } from "../../src/bus.js";
import { startHttp } from "../../src/channels/http.js";

describe("Bus and Channels Integration", () => {
  let bus: MessageBus;
  let port: number;
  let baseUrl: string;

  beforeEach(() => {
    bus = new MessageBus();
    // Use wider range and include timestamp to reduce collisions
    port = 10000 + Math.floor(Math.random() * 50000);
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("HTTP channel with MessageBus", () => {
    it("should route messages through bus correctly", async () => {
      await startHttp(bus, port);

      // Simulate agent processing
      const processMessage = async () => {
        const msg = await bus.consumeInbound();
        expect(msg.channel).toBe("http");
        expect(msg.content).toBe("Integration test message");

        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: `Processed: ${msg.content}`,
        });
      };

      const processor = processMessage();

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Integration test message" }),
      });

      await processor;

      const data = await response.json();
      expect(data.response).toBe("Processed: Integration test message");
    });

    it("should handle multiple sequential messages", async () => {
      await startHttp(bus, port);

      const processMessages = async (count: number) => {
        for (let i = 0; i < count; i++) {
          const msg = await bus.consumeInbound();
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Response ${i + 1}`,
          });
        }
      };

      const processor = processMessages(3);

      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`${baseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Message ${i + 1}` }),
        });
        const data = await response.json();
        results.push(data.response);
      }

      await processor;

      expect(results).toEqual(["Response 1", "Response 2", "Response 3"]);
    });

    it("should maintain session context through chatId", async () => {
      await startHttp(bus, port);

      const sessionMessages = new Map<string, string[]>();

      const processMessages = async (count: number) => {
        for (let i = 0; i < count; i++) {
          const msg = await bus.consumeInbound();
          if (!sessionMessages.has(msg.chatId)) {
            sessionMessages.set(msg.chatId, []);
          }
          sessionMessages.get(msg.chatId)!.push(msg.content);

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Messages so far: ${sessionMessages.get(msg.chatId)!.length}`,
          });
        }
      };

      const processor = processMessages(4);

      // Two messages from session A
      await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "A1", session_id: "session-a" }),
      });
      await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "A2", session_id: "session-a" }),
      });

      // Two messages from session B
      await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "B1", session_id: "session-b" }),
      });
      const lastResponse = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "B2", session_id: "session-b" }),
      });

      await processor;

      expect(sessionMessages.get("session-a")).toEqual(["A1", "A2"]);
      expect(sessionMessages.get("session-b")).toEqual(["B1", "B2"]);
    });
  });

  describe("Multi-channel scenarios", () => {
    it("should handle messages from different channels independently", async () => {
      await startHttp(bus, port);

      const receivedMessages: Array<{ channel: string; content: string }> = [];

      // Subscribe to both channels
      bus.subscribe("http", (msg) => receivedMessages.push({ channel: "http", content: msg.content }));
      bus.subscribe("cli", (msg) => receivedMessages.push({ channel: "cli", content: msg.content }));

      // Process one HTTP message
      const processHttp = async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: "HTTP response",
        });
      };

      const processor = processHttp();

      await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "HTTP message" }),
      });

      await processor;

      // Simulate CLI message
      await bus.publishOutbound({
        channel: "cli",
        chatId: "main",
        content: "CLI response",
      });

      expect(receivedMessages).toContainEqual({ channel: "http", content: "HTTP response" });
      expect(receivedMessages).toContainEqual({ channel: "cli", content: "CLI response" });
    });

    it("should not cross-contaminate channels", async () => {
      await startHttp(bus, port);

      const cliMessages: string[] = [];
      const httpMessages: string[] = [];

      bus.subscribe("cli", (msg) => cliMessages.push(msg.content));
      bus.subscribe("http", (msg) => httpMessages.push(msg.content));

      // Publish to CLI
      await bus.publishOutbound({ channel: "cli", chatId: "main", content: "CLI only" });

      // Process HTTP
      const processHttp = async () => {
        const msg = await bus.consumeInbound();
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: "HTTP only",
        });
      };

      const processor = processHttp();

      await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      await processor;

      expect(cliMessages).toEqual(["CLI only"]);
      expect(httpMessages).toEqual(["HTTP only"]);
    });
  });

  describe("Error handling integration", () => {
    it("should handle bus errors gracefully in HTTP channel", async () => {
      await startHttp(bus, port);

      // Start processing but throw error
      const processWithError = async () => {
        const msg = await bus.consumeInbound();
        // Simulate error by publishing to wrong channel (won't resolve HTTP promise)
        await bus.publishOutbound({
          channel: "wrong-channel",
          chatId: msg.chatId,
          content: "This won't reach HTTP",
        });
        // Then publish correct response
        await bus.publishOutbound({
          channel: "http",
          chatId: msg.chatId,
          content: "Recovery response",
        });
      };

      const processor = processWithError();

      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });

      await processor;

      const data = await response.json();
      expect(data.response).toBe("Recovery response");
    });
  });
});
