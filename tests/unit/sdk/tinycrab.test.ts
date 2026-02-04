import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Tinycrab } from "../../../src/sdk/tinycrab.js";

describe("Tinycrab SDK", () => {
  let tempDir: string;
  let tc: Tinycrab;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-sdk-test-"));
    tc = new Tinycrab({
      dataDir: tempDir,
      apiKey: "test-key",
    });
  });

  afterEach(async () => {
    await tc.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("agent()", () => {
    it("should create a new agent", async () => {
      const agent = await tc.agent("test-agent");

      expect(agent).toBeDefined();
      expect(agent.id).toBe("test-agent");
      expect(agent.info.status).toBe("running");
    });

    it("should create agent workspace directory", async () => {
      await tc.agent("test-agent");

      const workspaceExists = await fs
        .stat(path.join(tempDir, "agents", "test-agent", "workspace"))
        .then(() => true)
        .catch(() => false);

      expect(workspaceExists).toBe(true);
    });

    it("should create agent session directory", async () => {
      await tc.agent("test-agent");

      const sessionDirExists = await fs
        .stat(path.join(tempDir, "agents", "test-agent", "sessions"))
        .then(() => true)
        .catch(() => false);

      expect(sessionDirExists).toBe(true);
    });

    it("should create agent memory directory", async () => {
      await tc.agent("test-agent");

      const memoryDirExists = await fs
        .stat(path.join(tempDir, "agents", "test-agent", "memory"))
        .then(() => true)
        .catch(() => false);

      expect(memoryDirExists).toBe(true);
    });

    it("should return same agent if called twice with same id", async () => {
      const agent1 = await tc.agent("test-agent");
      const agent2 = await tc.agent("test-agent");

      expect(agent1).toBe(agent2);
    });

    it("should create multiple independent agents", async () => {
      const agent1 = await tc.agent("agent-1");
      const agent2 = await tc.agent("agent-2");

      expect(agent1.id).toBe("agent-1");
      expect(agent2.id).toBe("agent-2");
      expect(agent1).not.toBe(agent2);
    });
  });

  describe("list()", () => {
    it("should return empty array when no agents", async () => {
      const agents = await tc.list();
      expect(agents).toEqual([]);
    });

    it("should return all agents", async () => {
      await tc.agent("agent-1");
      await tc.agent("agent-2");
      await tc.agent("agent-3");

      const agents = await tc.list();

      expect(agents.length).toBe(3);
      expect(agents.map((a) => a.id).sort()).toEqual([
        "agent-1",
        "agent-2",
        "agent-3",
      ]);
    });
  });

  describe("get()", () => {
    it("should return null for non-existent agent", async () => {
      const agent = await tc.get("non-existent");
      expect(agent).toBeNull();
    });

    it("should return existing agent", async () => {
      await tc.agent("test-agent");
      const agent = await tc.get("test-agent");

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe("test-agent");
    });
  });

  describe("agent.chat()", () => {
    it.skip("should send message and get response (requires LLM API - see e2e tests)", async () => {
      const agent = await tc.agent("test-agent");
      const response = await agent.chat("Hello");

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });
  });

  describe("agent.stop()", () => {
    it("should stop the agent", async () => {
      const agent = await tc.agent("test-agent");
      await agent.stop();

      const status = await agent.status();
      expect(status.status).toBe("stopped");
    });

    it("should throw error when chatting with stopped agent", async () => {
      const agent = await tc.agent("test-agent");
      await agent.stop();

      await expect(agent.chat("Hello")).rejects.toThrow(
        "Agent 'test-agent' is stopped"
      );
    });
  });

  describe("agent.destroy()", () => {
    it("should stop the agent", async () => {
      const agent = await tc.agent("test-agent");
      await agent.destroy();

      const status = await agent.status();
      expect(status.status).toBe("stopped");
    });

    it("should keep files by default", async () => {
      const agent = await tc.agent("test-agent");
      const workspace = agent.info.workspace;

      await agent.destroy();

      const exists = await fs
        .stat(workspace)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should delete files when cleanup is true", async () => {
      const agent = await tc.agent("test-agent");
      const agentDir = path.dirname(agent.info.workspace);

      await agent.destroy({ cleanup: true });

      const exists = await fs
        .stat(agentDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe("persistence", () => {
    it("should persist agent metadata", async () => {
      await tc.agent("test-agent");
      await tc.close();

      // Create new instance
      const tc2 = new Tinycrab({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      const agents = await tc2.list();
      expect(agents.length).toBe(1);
      expect(agents[0].id).toBe("test-agent");

      await tc2.close();
    });

    it("should load agents as stopped when server is not running", async () => {
      const agent = await tc.agent("test-agent");
      await agent.stop(); // Stop the server before closing
      // Wait for server to fully shut down
      await new Promise((resolve) => setTimeout(resolve, 500));
      await tc.close();

      const tc2 = new Tinycrab({
        dataDir: tempDir,
        apiKey: "test-key",
      });

      const agents = await tc2.list();
      expect(agents[0].status).toBe("stopped");

      await tc2.close();
    });
  });
});
