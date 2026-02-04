#!/usr/bin/env node
/**
 * Standalone HTTP server for a single agent.
 * Supports multiple concurrent sessions per agent.
 *
 * Usage: node agent-server.js --id <agent-id> --port <port> --data-dir <path> --provider <provider> --model <model>
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import Fastify from "fastify";
import { createAgentSession, codingTools, SessionManager, AuthStorage } from "@mariozechner/pi-coding-agent";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { FileMemoryProvider } from "../memory/file-provider.js";
import { createMemoryTools } from "../tools/memory.js";

interface ServerConfig {
  id: string;
  port: number;
  dataDir: string;
  provider: string;
  model: string;
}

function parseArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];

    switch (key) {
      case "id":
        config.id = value;
        break;
      case "port":
        config.port = parseInt(value, 10);
        break;
      case "data-dir":
        config.dataDir = value;
        break;
      case "provider":
        config.provider = value;
        break;
      case "model":
        config.model = value;
        break;
      // API key is passed via environment variable, not command line (security)
    }
  }

  if (!config.id || !config.port || !config.dataDir) {
    console.error("Missing required arguments: --id, --port, --data-dir");
    process.exit(1);
  }

  return {
    id: config.id,
    port: config.port,
    dataDir: config.dataDir,
    provider: config.provider || "openai",
    model: config.model || "gpt-4o",
  };
}

/**
 * Read API key from stdin (sent by parent process).
 * This is more secure than env vars or command line args:
 * - Not visible in `ps aux`
 * - Not accessible via `env` command
 * - Only in memory after reading
 */
async function readApiKeyFromStdin(): Promise<string | undefined> {
  return new Promise((resolve) => {
    // If stdin is a TTY (interactive), no API key is being piped
    if (process.stdin.isTTY) {
      resolve(undefined);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

    let apiKey: string | undefined;

    rl.on("line", (line) => {
      // First line is the API key
      if (!apiKey) {
        apiKey = line.trim();
        rl.close();
      }
    });

    rl.on("close", () => {
      resolve(apiKey);
    });

    // Timeout after 1 second if no input
    setTimeout(() => {
      rl.close();
    }, 1000);
  });
}

/**
 * Map of provider names to their environment variable names.
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/**
 * Read API key from environment variable and clear it.
 * Used as fallback for Docker/cloud deployments where stdin isn't available.
 */
function readAndClearEnvApiKey(provider: string): string | undefined {
  const envVar = PROVIDER_ENV_VARS[provider];
  if (!envVar) return undefined;

  const apiKey = process.env[envVar];
  if (apiKey) {
    // Clear the env var so `env` command won't show it
    delete process.env[envVar];
  }
  return apiKey;
}

async function main() {
  const config = parseArgs();

  // Read API key securely:
  // 1. First try stdin (SDK spawning - most secure, not visible anywhere)
  // 2. Fallback to env var (Docker/cloud), then clear it so `env` won't show it
  let apiKey = await readApiKeyFromStdin();
  if (!apiKey) {
    apiKey = readAndClearEnvApiKey(config.provider);
  }

  // Create AuthStorage to hold the API key in memory only
  // This prevents the agent from accessing the key via environment variables or bash
  const authStorage = new AuthStorage();
  if (apiKey) {
    authStorage.setRuntimeApiKey(config.provider, apiKey);
  }

  const agentDir = path.join(config.dataDir, "agents", config.id);
  const workspace = path.join(agentDir, "workspace");
  const sessionsBaseDir = path.join(agentDir, "sessions");
  const memoryDir = path.join(agentDir, "memory");

  // Create shared memory provider (shared across all sessions for this agent)
  const memoryProvider = new FileMemoryProvider(
    path.join(memoryDir, "entries.jsonl")
  );
  const memoryTools = createMemoryTools(memoryProvider);

  // Session cache: session_id -> AgentSession
  const sessions = new Map<string, AgentSession>();

  async function getOrCreateSession(sessionId: string): Promise<AgentSession> {
    let session = sessions.get(sessionId);
    if (session) {
      return session;
    }

    // Each session gets its own subdirectory for conversation history
    const sessionDir = path.join(sessionsBaseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Create a custom session manager that persists to this session's directory
    // Use SessionManager.continueRecent to resume existing sessions, or create if none
    const sessionManager = SessionManager.continueRecent(workspace, sessionDir);

    const { session: newSession } = await createAgentSession({
      model: (getModel as any)(config.provider, config.model),
      tools: codingTools,
      customTools: memoryTools as any,
      cwd: workspace,
      sessionManager,
      authStorage, // Use our AuthStorage with the API key in memory
    });

    sessions.set(sessionId, newSession);
    return newSession;
  }

  // Start HTTP server
  const app = Fastify();

  app.get("/health", async () => ({
    status: "ok",
    agent: config.id,
  }));

  app.get("/info", async () => ({
    id: config.id,
    status: "running",
    port: config.port,
    pid: process.pid,
    workspace,
    sessionsDir: sessionsBaseDir,
    memoryDir,
    activeSessions: sessions.size,
  }));

  app.post<{ Body: { message: string; session_id?: string } }>(
    "/chat",
    async (req, reply) => {
      if (!req.body?.message) {
        return reply.status(400).send({ error: "message is required" });
      }

      // Generate secure session ID:
      // - If provided and already has crypto suffix (ends with -{16 hex}), use as-is
      // - If provided without suffix, append crypto suffix for security
      // - If not provided, generate "session-{16 hex}"
      const provided = req.body.session_id;
      const cryptoSuffix = crypto.randomBytes(8).toString("hex");

      let sessionId: string;
      if (!provided) {
        sessionId = `session-${cryptoSuffix}`;
      } else if (/^.+-[a-f0-9]{16}$/.test(provided)) {
        // Already has secure suffix
        sessionId = provided;
      } else {
        // Append crypto suffix to make it secure
        sessionId = `${provided}-${cryptoSuffix}`;
      }

      try {
        const session = await getOrCreateSession(sessionId);
        await session.prompt(req.body.message);
        const response = session.getLastAssistantText() || "";
        return { response, session_id: sessionId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: message });
      }
    }
  );

  app.get("/sessions", async () => ({
    sessions: Array.from(sessions.keys()),
  }));

  app.post("/stop", async () => {
    // Graceful shutdown
    setTimeout(() => process.exit(0), 100);
    return { status: "stopping" };
  });

  await app.listen({ port: config.port, host: "127.0.0.1" });

  // Write PID file for process management
  const pidFile = path.join(agentDir, "server.pid");
  await fs.writeFile(pidFile, String(process.pid));

  console.log(`Agent '${config.id}' server running on port ${config.port}`);

  // Handle graceful shutdown
  const cleanup = async () => {
    console.log(`Agent '${config.id}' shutting down...`);
    await app.close();
    await fs.unlink(pidFile).catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

main().catch((error) => {
  console.error("Failed to start agent server:", error);
  process.exit(1);
});
