/**
 * tinycrab - Lightweight universal agent
 *
 * Features:
 * - Session-per-conversation (true concurrency)
 * - Structured memory with scoring (recency, importance, relevance)
 * - Cron for proactive behavior
 * - Subagent support with bidirectional communication
 * - Multi-channel (CLI, HTTP)
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { MessageBus } from "./bus.js";
import { SessionManager } from "./session-manager.js";
import { SubagentManager } from "./subagent.js";
import { CronService } from "./cron/service.js";
import { FileMemoryProvider } from "./memory/file-provider.js";
import type { MemoryProvider } from "./memory/types.js";
import { createMemoryTools } from "./tools/memory.js";
import { createSubagentTools } from "./tools/subagent.js";
import { createCronTools } from "./tools/cron.js";
import { promptWithMemoryFlush } from "./memory-flush.js";
import { startCli } from "./channels/cli.js";
import { startHttp } from "./channels/http.js";

// Configuration from environment
const config = {
  provider: process.env.AGENT_PROVIDER || "openai",
  model: process.env.AGENT_MODEL || "gpt-4o",
  workspace: process.env.AGENT_WORKSPACE || process.cwd(),
  dataDir: process.env.AGENT_DATA_DIR || path.join(os.homedir(), ".tinycrab"),
  port: parseInt(process.env.AGENT_PORT || "8080"),
};

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
 * Create AuthStorage with API key from env, then clear env for security.
 * This prevents the agent from accessing the key via `env` command.
 */
function createSecureAuthStorage(provider: string): AuthStorage {
  const authStorage = new AuthStorage();
  const envVar = PROVIDER_ENV_VARS[provider];

  if (envVar) {
    const apiKey = process.env[envVar];
    if (apiKey) {
      authStorage.setRuntimeApiKey(provider, apiKey);
      // Clear env var so agent can't access via bash `env` command
      delete process.env[envVar];
    }
  }

  return authStorage;
}

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "memory"), { recursive: true });
}

async function main() {
  await ensureDataDir();

  // Create secure auth storage (reads API key from env, then clears it)
  const authStorage = createSecureAuthStorage(config.provider);

  // Core components
  const bus = new MessageBus();

  // Structured memory with scoring (recency, importance, relevance)
  const memory: MemoryProvider = new FileMemoryProvider(
    path.join(config.dataDir, "memory", "entries.jsonl")
  );

  // Create memory tools for agent (remember + recall)
  const memoryTools = createMemoryTools(memory);

  // Subagent manager for background tasks (created first so tools can reference it)
  const subagents = new SubagentManager({
    bus,
    defaultChannel: "system",
    defaultChatId: "main",
    authStorage, // Pass secure auth storage
  });

  // Create subagent tools for AI agent (spawn, chat, stop, list)
  // Note: isSubagent=false because this is the main agent
  const subagentTools = createSubagentTools({
    manager: subagents,
    channel: "system", // Will be overridden by setCurrentContext per message
    chatId: "main",
    isSubagent: false,
  });

  // Cron service for proactive behavior
  // Note: executeJob callback captures `sessions` by closure - it's called only after cron.start()
  // which happens after sessions is created, so this is safe.
  const cron = new CronService({
    storePath: path.join(config.dataDir, "cron.json"),
    onEvent: (event) => {
      console.log(`[Cron] ${event.type}: ${event.job.name}`);
    },
    executeJob: async (job) => {
      // Execute cron job by sending to main session
      if (job.payload.kind === "systemEvent") {
        await bus.publishInbound({
          channel: "cron",
          chatId: job.id,
          content: job.payload.text,
        });
        return "delivered";
      } else if (job.payload.kind === "agentTurn") {
        const { message, deliver, channel, chatId } = job.payload;
        const response = await sessions.withSession(
          { channel: "cron", chatId: job.id },
          async (session) => {
            await session.prompt(message);
            return session.getLastAssistantText() || "";
          }
        );

        // Optionally deliver to a channel
        if (deliver && channel && chatId) {
          await bus.publishOutbound({
            channel,
            chatId,
            content: response,
          });
        }

        return response;
      }
      return undefined;
    },
  });

  // Create cron tools for agent (schedule, list, cancel)
  const cronTools = createCronTools(cron);

  const sessions = new SessionManager(
    {
      provider: config.provider,
      model: config.model,
      workspace: config.workspace,
      agentDir: config.dataDir,
      additionalTools: [...memoryTools, ...subagentTools, ...cronTools] as any,
      authStorage, // Pass secure auth storage
    },
    {
      maxSessions: 100,
      sessionTtlMs: 30 * 60 * 1000, // 30 minutes
    }
  );

  // Process messages with session-per-conversation
  const processLoop = async () => {
    console.log(`[tinycrab] Agent ready`);
    console.log(`  Provider: ${config.provider}`);
    console.log(`  Model: ${config.model}`);
    console.log(`  Workspace: ${config.workspace}`);
    console.log(`  Data: ${config.dataDir}\n`);

    while (true) {
      const msg = await bus.consumeInbound();

      // Set current context so subagent tools route back to the right place
      subagents.setCurrentContext(msg.channel, msg.chatId);

      try {
        // Handle special commands
        if (msg.content.startsWith("/spawn ")) {
          const task = msg.content.slice(7);
          const id = await subagents.spawn({
            task,
            channel: msg.channel,
            chatId: msg.chatId,
          });
          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: `Spawned subagent: ${id}`,
          });
          continue;
        }

        if (msg.content === "/status") {
          const sessionList = sessions.listSessions();
          const subagentList = subagents.list();
          const memoryCount = await memory.count();
          const cronJobs = await cron.list();
          const status = [
            `Sessions: ${sessionList.length}`,
            `Subagents: ${subagentList.filter((s) => s.status === "running").length} running`,
            `Memory entries: ${memoryCount}`,
            `Cron jobs: ${cronJobs.length}`,
          ].join("\n");
          await bus.publishOutbound({ channel: msg.channel, chatId: msg.chatId, content: status });
          continue;
        }

        // Regular message - send to agent session
        // Uses pre-compaction memory flush if context is near capacity
        const text = await sessions.withSession(
          { channel: msg.channel, chatId: msg.chatId, threadId: msg.threadId },
          async (session) => {
            await promptWithMemoryFlush(session, msg.content);
            return session.getLastAssistantText() || "";
          }
        );

        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: text,
        });
      } catch (err) {
        console.error(`[Error] ${err instanceof Error ? err.message : String(err)}`);
        await bus.publishOutbound({
          channel: msg.channel,
          chatId: msg.chatId,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  };

  // Start channels
  const mode = process.argv[2] || "cli";

  if (mode === "cli" || mode === "both") {
    startCli(bus);
  }
  if (mode === "http" || mode === "both") {
    await startHttp(bus, config.port);
  }

  // Start cron service
  await cron.start();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[tinycrab] Shutting down...");
    cron.stop();
    await sessions.close();
    await memory.close?.();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run message processing
  processLoop().catch(console.error);
}

main().catch(console.error);
