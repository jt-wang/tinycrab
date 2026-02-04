import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createContext,
  spawnCommand,
  listCommand,
  statusCommand,
  stopCommand,
  cleanupCommand,
} from "../../../src/cli/commands.js";

describe("CLI Commands", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-cli-test-"));
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("spawnCommand", () => {
    it("should spawn a new agent", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await spawnCommand(ctx, "test-agent");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Agent 'test-agent' spawned")
      );

      await ctx.tc.close();
    });

    it("should create workspace directory", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await spawnCommand(ctx, "test-agent");

      const exists = await fs
        .stat(path.join(tempDir, "agents", "test-agent", "workspace"))
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);

      await ctx.tc.close();
    });
  });

  describe("listCommand", () => {
    it("should show message when no agents", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await listCommand(ctx);

      expect(consoleSpy).toHaveBeenCalledWith("No agents found.");

      await ctx.tc.close();
    });

    it("should list all agents", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await ctx.tc.agent("agent-1");
      await ctx.tc.agent("agent-2");

      await listCommand(ctx);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("agent-1")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("agent-2")
      );

      await ctx.tc.close();
    });
  });

  describe("statusCommand", () => {
    it("should show agent status", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await ctx.tc.agent("test-agent");
      await statusCommand(ctx, "test-agent");

      expect(consoleSpy).toHaveBeenCalledWith("Agent: test-agent");
      expect(consoleSpy).toHaveBeenCalledWith("Status: running");

      await ctx.tc.close();
    });
  });

  describe("stopCommand", () => {
    it("should stop the agent", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await ctx.tc.agent("test-agent");
      await stopCommand(ctx, "test-agent");

      expect(consoleSpy).toHaveBeenCalledWith("Agent 'test-agent' stopped.");

      const agent = await ctx.tc.get("test-agent");
      const status = await agent?.status();
      expect(status?.status).toBe("stopped");

      await ctx.tc.close();
    });
  });

  describe("cleanupCommand", () => {
    it("should cleanup a specific agent", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await ctx.tc.agent("test-agent");
      await cleanupCommand(ctx, "test-agent", false);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Agent 'test-agent' cleaned up."
      );

      const exists = await fs
        .stat(path.join(tempDir, "agents", "test-agent"))
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);

      await ctx.tc.close();
    });

    it("should cleanup all agents with --all", async () => {
      const ctx = await createContext({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      await ctx.tc.agent("agent-1");
      await ctx.tc.agent("agent-2");
      await cleanupCommand(ctx, null, true);

      expect(consoleSpy).toHaveBeenCalledWith("Cleaned up agent 'agent-1'");
      expect(consoleSpy).toHaveBeenCalledWith("Cleaned up agent 'agent-2'");
      expect(consoleSpy).toHaveBeenCalledWith("Cleaned up 2 agents.");

      await ctx.tc.close();
    });
  });
});
