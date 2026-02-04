import { describe, it, expect, beforeEach, vi } from "vitest";
import { MessageBus, InboundMessage, OutboundMessage } from "../../src/bus.js";

describe("MessageBus", () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe("publishInbound / consumeInbound", () => {
    it("should queue messages when no consumer is waiting", async () => {
      const msg: InboundMessage = { channel: "cli", chatId: "1", content: "hello" };
      await bus.publishInbound(msg);

      const received = await bus.consumeInbound();
      expect(received).toEqual(msg);
    });

    it("should immediately resolve when consumer is waiting", async () => {
      const msg: InboundMessage = { channel: "http", chatId: "2", content: "world" };

      const consumePromise = bus.consumeInbound();
      await bus.publishInbound(msg);

      const received = await consumePromise;
      expect(received).toEqual(msg);
    });

    it("should maintain FIFO order for queued messages", async () => {
      const msg1: InboundMessage = { channel: "cli", chatId: "1", content: "first" };
      const msg2: InboundMessage = { channel: "cli", chatId: "2", content: "second" };
      const msg3: InboundMessage = { channel: "cli", chatId: "3", content: "third" };

      await bus.publishInbound(msg1);
      await bus.publishInbound(msg2);
      await bus.publishInbound(msg3);

      expect(await bus.consumeInbound()).toEqual(msg1);
      expect(await bus.consumeInbound()).toEqual(msg2);
      expect(await bus.consumeInbound()).toEqual(msg3);
    });

    it("should handle multiple waiting consumers in order", async () => {
      const results: InboundMessage[] = [];

      const promise1 = bus.consumeInbound().then((m) => results.push(m));
      const promise2 = bus.consumeInbound().then((m) => results.push(m));

      const msg1: InboundMessage = { channel: "cli", chatId: "1", content: "a" };
      const msg2: InboundMessage = { channel: "cli", chatId: "2", content: "b" };

      await bus.publishInbound(msg1);
      await bus.publishInbound(msg2);

      await Promise.all([promise1, promise2]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(msg1);
      expect(results[1]).toEqual(msg2);
    });

    it("should handle mixed queue and waiting consumers", async () => {
      const msg1: InboundMessage = { channel: "cli", chatId: "1", content: "queued" };
      await bus.publishInbound(msg1);

      const received1 = await bus.consumeInbound();
      expect(received1).toEqual(msg1);

      const consumePromise = bus.consumeInbound();
      const msg2: InboundMessage = { channel: "cli", chatId: "2", content: "direct" };
      await bus.publishInbound(msg2);

      const received2 = await consumePromise;
      expect(received2).toEqual(msg2);
    });
  });

  describe("publishOutbound / subscribe", () => {
    it("should deliver messages to subscribed callbacks", async () => {
      const callback = vi.fn();
      bus.subscribe("cli", callback);

      const msg: OutboundMessage = { channel: "cli", chatId: "1", content: "response" };
      await bus.publishOutbound(msg);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(msg);
    });

    it("should not deliver messages to unsubscribed channels", async () => {
      const cliCallback = vi.fn();
      const httpCallback = vi.fn();

      bus.subscribe("cli", cliCallback);
      bus.subscribe("http", httpCallback);

      const msg: OutboundMessage = { channel: "cli", chatId: "1", content: "cli only" };
      await bus.publishOutbound(msg);

      expect(cliCallback).toHaveBeenCalledOnce();
      expect(httpCallback).not.toHaveBeenCalled();
    });

    it("should deliver to multiple subscribers on same channel", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      bus.subscribe("cli", callback1);
      bus.subscribe("cli", callback2);

      const msg: OutboundMessage = { channel: "cli", chatId: "1", content: "broadcast" };
      await bus.publishOutbound(msg);

      expect(callback1).toHaveBeenCalledWith(msg);
      expect(callback2).toHaveBeenCalledWith(msg);
    });

    it("should handle publishing to channel with no subscribers", async () => {
      const msg: OutboundMessage = { channel: "unknown", chatId: "1", content: "lost" };
      await expect(bus.publishOutbound(msg)).resolves.toBeUndefined();
    });

    it("should support multiple channels independently", async () => {
      const cliCallback = vi.fn();
      const httpCallback = vi.fn();

      bus.subscribe("cli", cliCallback);
      bus.subscribe("http", httpCallback);

      const cliMsg: OutboundMessage = { channel: "cli", chatId: "1", content: "cli" };
      const httpMsg: OutboundMessage = { channel: "http", chatId: "2", content: "http" };

      await bus.publishOutbound(cliMsg);
      await bus.publishOutbound(httpMsg);

      expect(cliCallback).toHaveBeenCalledWith(cliMsg);
      expect(httpCallback).toHaveBeenCalledWith(httpMsg);
    });
  });

  describe("edge cases", () => {
    it("should handle empty content messages", async () => {
      const msg: InboundMessage = { channel: "cli", chatId: "1", content: "" };
      await bus.publishInbound(msg);

      const received = await bus.consumeInbound();
      expect(received.content).toBe("");
    });

    it("should handle special characters in content", async () => {
      const msg: InboundMessage = {
        channel: "cli",
        chatId: "1",
        content: "Hello\nWorld\t\r\n\"quotes\" and 'apostrophes' \\backslash",
      };
      await bus.publishInbound(msg);

      const received = await bus.consumeInbound();
      expect(received.content).toBe(msg.content);
    });

    it("should handle unicode content", async () => {
      const msg: InboundMessage = {
        channel: "cli",
        chatId: "1",
        content: "Hello 世界 🌍 مرحبا",
      };
      await bus.publishInbound(msg);

      const received = await bus.consumeInbound();
      expect(received.content).toBe(msg.content);
    });
  });
});
