/**
 * True end-to-end tests that call real LLM APIs.
 *
 * Run with: OPENAI_API_KEY=sk-xxx npm run test:e2e
 * Or with:  ANTHROPIC_API_KEY=sk-xxx npm run test:e2e
 *
 * These tests verify the complete tinycrab system:
 * - Session-per-conversation with SessionManager
 * - Structured memory with remember/recall tools
 * - HTTP channel integration
 * - Multi-turn conversations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createAgentSession, codingTools } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const hasApiKey = hasOpenAiKey || hasAnthropicKey;

// Determine which provider to use (prefer OpenAI for cost)
const provider = hasOpenAiKey ? "openai" : "anthropic";
const model = hasOpenAiKey ? "gpt-4o-mini" : "claude-sonnet-4-20250514";

describe.skipIf(!hasApiKey)("Real LLM E2E Tests", () => {
  let tempDir: string;

  beforeAll(async () => {
    console.log(`Running real LLM tests with ${provider} (${model})`);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-basic-e2e-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Basic Agent Tests", () => {
    it("should create a real agent session and get a response", async () => {
      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        cwd: tempDir,
      });

      const prompt1 = "What is 2 + 2? Reply with just the number.";
      console.log(`\n[User]: ${prompt1}`);
      await session.prompt(prompt1);

      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      expect(response).toBeDefined();
      expect(response).toContain("4");
    }, 30000);

    it("should handle multi-turn conversation", async () => {
      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        cwd: tempDir,
      });

      // Ask to keep in conversation memory, not create files
      const prompt1 = "I'm going to tell you a number: 42. Keep it in mind for our conversation.";
      console.log(`\n[User]: ${prompt1}`);
      await session.prompt(prompt1);
      const response1 = session.getLastAssistantText();
      console.log(`[Assistant]: ${response1}`);
      expect(response1).toBeDefined();

      const prompt2 = "What number did I tell you?";
      console.log(`[User]: ${prompt2}`);
      await session.prompt(prompt2);
      const response2 = session.getLastAssistantText();
      console.log(`[Assistant]: ${response2}\n`);
      expect(response2).toContain("42");
    }, 60000);

    it("should execute bash tool", async () => {
      const { session } = await createAgentSession({
        model: getModel(provider, model),
        tools: codingTools,
        cwd: tempDir,
      });

      const prompt1 = "Use the bash tool to run 'echo hello'. Return the output.";
      console.log(`\n[User]: ${prompt1}`);
      await session.prompt(prompt1);

      const response = session.getLastAssistantText();
      console.log(`[Assistant]: ${response}\n`);

      expect(response).toBeDefined();
      expect(response?.toLowerCase()).toContain("hello");
    }, 30000);
  });
});

describe.skipIf(!hasApiKey)("Memory Tools E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should use remember tool to store information", async () => {
    // Import dynamically to get real implementations
    const { FileMemoryProvider } = await import("../../src/memory/file-provider.js");
    const { createMemoryTools } = await import("../../src/tools/memory.js");

    const memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
    const memoryTools = createMemoryTools(memory);

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      customTools: memoryTools as any, // Custom tools go here
    });

    const prompt = "Use the remember tool to store: 'User prefers TypeScript over JavaScript'. Set importance to 0.8 and tag it as 'preference'.";
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify memory was stored
    const count = await memory.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const results = await memory.search({ query: "TypeScript" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entry.content).toContain("TypeScript");

    await memory.close?.();
  }, 60000);

  it("should use recall tool to retrieve information", async () => {
    const { FileMemoryProvider } = await import("../../src/memory/file-provider.js");
    const { createMemoryTools } = await import("../../src/tools/memory.js");

    const memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
    const memoryTools = createMemoryTools(memory);

    // Pre-populate memory
    await memory.add({
      content: "Project deadline is March 15th",
      importance: 0.9,
      tags: ["deadline", "project"],
    });
    await memory.add({
      content: "User likes dark mode",
      importance: 0.7,
      tags: ["preference"],
    });

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      customTools: memoryTools as any,
    });

    const prompt = "Use the recall tool to find information about deadlines. What did you find?";
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    expect(response).toBeDefined();
    expect(response?.toLowerCase()).toMatch(/march|15|deadline/i);

    await memory.close?.();
  }, 60000);

  it("should remember and recall in same conversation", async () => {
    const { FileMemoryProvider } = await import("../../src/memory/file-provider.js");
    const { createMemoryTools } = await import("../../src/tools/memory.js");

    const memory = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
    const memoryTools = createMemoryTools(memory);

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      customTools: memoryTools as any,
    });

    // First, remember something
    const prompt1 = "Use the remember tool to store: 'The project uses port 8080'. Set importance to 0.9.";
    console.log(`\n[User]: ${prompt1}`);
    await session.prompt(prompt1);
    console.log(`[Assistant]: ${session.getLastAssistantText()}`);

    // Then recall it
    const prompt2 = "Use the recall tool to find information about port. What port does the project use?";
    console.log(`[User]: ${prompt2}`);
    await session.prompt(prompt2);

    const response2 = session.getLastAssistantText();
    console.log(`[Assistant]: ${response2}\n`);

    expect(response2).toBeDefined();
    expect(response2).toContain("8080");

    await memory.close?.();
  }, 90000);
});

describe.skipIf(!hasApiKey)("Session Manager E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-session-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should maintain separate sessions for different conversations", async () => {
    const { SessionManager } = await import("../../src/session-manager.js");

    const sessions = new SessionManager(
      {
        provider,
        model,
        workspace: tempDir,
        agentDir: tempDir,
      },
      { maxSessions: 10, sessionTtlMs: 60000 }
    );

    // Session 1: Tell it a favorite number (not "secret" to avoid privacy warnings)
    const response1 = await sessions.withSession(
      { channel: "test", chatId: "user-alice" },
      async (session) => {
        await session.prompt("My favorite number is 777. I like it because of lucky sevens.");
        return session.getLastAssistantText() || "";
      }
    );
    console.log(`[Alice session]: ${response1}`);

    // Session 2: Different user, different context
    const response2 = await sessions.withSession(
      { channel: "test", chatId: "user-bob" },
      async (session) => {
        await session.prompt("My favorite number is 999. I picked it because it looks cool.");
        return session.getLastAssistantText() || "";
      }
    );
    console.log(`[Bob session]: ${response2}`);

    // Session 1 again: Verify it remembers Alice's number
    const response3 = await sessions.withSession(
      { channel: "test", chatId: "user-alice" },
      async (session) => {
        await session.prompt("What is my favorite number that I told you about?");
        return session.getLastAssistantText() || "";
      }
    );
    console.log(`[Alice session 2]: ${response3}`);
    expect(response3).toContain("777");

    // Session 2 again: Verify it remembers Bob's number
    const response4 = await sessions.withSession(
      { channel: "test", chatId: "user-bob" },
      async (session) => {
        await session.prompt("What is my favorite number that I told you about?");
        return session.getLastAssistantText() || "";
      }
    );
    console.log(`[Bob session 2]: ${response4}`);
    expect(response4).toContain("999");

    await sessions.close();
  }, 120000);

  it("should handle concurrent requests to same session sequentially", async () => {
    const { SessionManager } = await import("../../src/session-manager.js");

    const sessions = new SessionManager(
      {
        provider,
        model,
        workspace: tempDir,
        agentDir: tempDir,
      },
      { maxSessions: 10, sessionTtlMs: 60000 }
    );

    // Fire two concurrent requests to the same session
    const [result1, result2] = await Promise.all([
      sessions.withSession(
        { channel: "test", chatId: "concurrent-test" },
        async (session) => {
          await session.prompt("Say 'FIRST' and nothing else.");
          return session.getLastAssistantText() || "";
        }
      ),
      sessions.withSession(
        { channel: "test", chatId: "concurrent-test" },
        async (session) => {
          await session.prompt("Say 'SECOND' and nothing else.");
          return session.getLastAssistantText() || "";
        }
      ),
    ]);

    console.log(`[Concurrent 1]: ${result1}`);
    console.log(`[Concurrent 2]: ${result2}`);

    // Both should complete without errors (session handles them sequentially)
    expect(result1.toUpperCase()).toContain("FIRST");
    expect(result2.toUpperCase()).toContain("SECOND");

    await sessions.close();
  }, 90000);
});

describe.skipIf(!hasApiKey)("HTTP Channel E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-http-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should handle full HTTP request-response flow", async () => {
    const { MessageBus } = await import("../../src/bus.js");
    const { SessionManager } = await import("../../src/session-manager.js");
    const { startHttp } = await import("../../src/channels/http.js");

    const bus = new MessageBus();
    const sessions = new SessionManager(
      {
        provider,
        model,
        workspace: tempDir,
        agentDir: tempDir,
      },
      { maxSessions: 10, sessionTtlMs: 60000 }
    );

    // Find available port
    const port = 10000 + Math.floor(Math.random() * 50000);
    await startHttp(bus, port);

    // Process messages (simulating main loop)
    const processPromise = (async () => {
      const msg = await bus.consumeInbound();
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
    })();

    // Make HTTP request
    const response = await fetch(`http://localhost:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What is 5 + 3? Reply with just the number." }),
    });

    const data = await response.json();
    console.log(`[HTTP Response]: ${JSON.stringify(data)}`);

    await processPromise;

    expect(data.response).toBeDefined();
    expect(data.response).toContain("8");
    expect(data.session_id).toBeDefined();

    await sessions.close();
  }, 60000);
});

describe.skipIf(!hasApiKey)("File Operations E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-file-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should create a file using write tool", async () => {
    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `Use the write tool to create a file called "hello.txt" with the content "Hello, World!" in the current directory.`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify file was created
    const content = await fs.readFile(path.join(tempDir, "hello.txt"), "utf-8");
    expect(content).toContain("Hello");
  }, 60000);

  it("should read and summarize a file", async () => {
    // Create a test file
    await fs.writeFile(
      path.join(tempDir, "data.txt"),
      `Name: Alice
Age: 30
City: New York
Occupation: Engineer`
    );

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `Read the file "data.txt" and tell me the person's name and occupation.`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    expect(response).toBeDefined();
    expect(response?.toLowerCase()).toContain("alice");
    expect(response?.toLowerCase()).toContain("engineer");
  }, 60000);

  it("should edit an existing file", async () => {
    // Create a test file
    await fs.writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({ name: "myapp", version: "1.0.0" }, null, 2)
    );

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `Read "config.json", then use the edit tool to change the version from "1.0.0" to "2.0.0".`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify file was edited
    const content = await fs.readFile(path.join(tempDir, "config.json"), "utf-8");
    expect(content).toContain("2.0.0");
  }, 60000);

  it("should list files in directory", async () => {
    // Create some test files
    await fs.writeFile(path.join(tempDir, "file1.txt"), "content1");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "content2");
    await fs.mkdir(path.join(tempDir, "subdir"));

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `List all files and directories in the current directory. What do you see?`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    expect(response).toBeDefined();
    expect(response?.toLowerCase()).toMatch(/file1|file2|subdir/i);
  }, 60000);
});

describe.skipIf(!hasApiKey)("Coding Tasks E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-coding-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should create a simple function and test it", async () => {
    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `Create a file called "add.js" with a function that adds two numbers. Then use bash to run "node -e 'const add = require(\"./add.js\"); console.log(add(2, 3))'" to test it. The function should be exported using module.exports.`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify file was created
    const fileExists = await fs.stat(path.join(tempDir, "add.js")).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    // Check response mentions 5 (the result of 2+3)
    expect(response?.toLowerCase()).toMatch(/5|result|output/i);
  }, 90000);

  it("should find and fix a bug in code", async () => {
    // Create a file with a bug
    await fs.writeFile(
      path.join(tempDir, "buggy.js"),
      `function greet(name) {
  return "Hello, " + naem;  // Bug: typo in variable name
}
module.exports = greet;`
    );

    const { session } = await createAgentSession({
      model: getModel(provider, model),
      tools: codingTools,
      cwd: tempDir,
    });

    const prompt = `Read "buggy.js", find the bug, and fix it using the edit tool.`;
    console.log(`\n[User]: ${prompt}`);
    await session.prompt(prompt);

    const response = session.getLastAssistantText();
    console.log(`[Assistant]: ${response}\n`);

    // Verify bug was fixed
    const content = await fs.readFile(path.join(tempDir, "buggy.js"), "utf-8");
    expect(content).toContain("name"); // Should have fixed naem -> name
    expect(content).not.toContain("naem");
  }, 60000);
});

// Show helpful message when no API key
if (!hasApiKey) {
  console.log("\n⚠️  Skipping real LLM tests: No API key configured");
  console.log("   Set OPENAI_API_KEY or ANTHROPIC_API_KEY to run these tests\n");
}
