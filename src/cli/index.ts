#!/usr/bin/env node
/**
 * tinycrab CLI
 *
 * Usage:
 *   tinycrab spawn <agent-id>                  # Create an agent
 *   tinycrab chat <agent-id> "message"         # Send a message
 *   tinycrab chat <agent-id> --interactive     # Interactive mode
 *   tinycrab list                              # List all agents
 *   tinycrab status <agent-id>                 # Get agent status
 *   tinycrab stop <agent-id>                   # Stop an agent
 *   tinycrab cleanup <agent-id>                # Delete agent and files
 *   tinycrab cleanup --all                     # Delete all agents
 */

import {
  createContext,
  spawnCommand,
  chatCommand,
  interactiveCommand,
  listCommand,
  statusCommand,
  stopCommand,
  cleanupCommand,
} from "./commands.js";
import type { TinycrabOptions } from "../sdk/types.js";

function printUsage(): void {
  console.log(`
tinycrab - Lightweight universal AI agent

Usage:
  tinycrab spawn [agent-id]                       Create an agent (auto-generates ID if omitted)
  tinycrab spawn --prefix player                  Create agent with prefix: "player-a8f3..."
  tinycrab chat <agent-id> "message"              Send a message (new session)
  tinycrab chat <agent-id> "message" -s <id>      Send in existing session
  tinycrab chat <agent-id> -i                     Interactive mode (new session)
  tinycrab chat <agent-id> -i -s <id>             Interactive mode (resume session)
  tinycrab list                                   List all agents
  tinycrab status <agent-id>                      Get agent status
  tinycrab stop <agent-id>                        Stop an agent
  tinycrab cleanup <agent-id>                     Delete agent and files
  tinycrab cleanup --all                          Delete all agents

Options:
  --data-dir <path>    Data directory (default: ./.tinycrab)
  --provider <name>    LLM provider (default: openai)
  --model <name>       Model name (default: gpt-4o)
  --prefix <name>      Prefix for auto-generated agent ID
  -s, --session <id>   Session ID for conversation continuity
  -h, --help           Show this help

Environment:
  OPENAI_API_KEY       OpenAI API key
  ANTHROPIC_API_KEY    Anthropic API key
  TINYCRAB_DATA_DIR    Default data directory
`);
}

function parseArgs(args: string[]): {
  command: string;
  agentId: string | null;
  message: string | null;
  interactive: boolean;
  all: boolean;
  sessionId: string | null;
  prefix: string | null;
  options: TinycrabOptions;
} {
  const options: TinycrabOptions = {
    dataDir: process.env.TINYCRAB_DATA_DIR || "./.tinycrab",
    provider: process.env.OPENAI_API_KEY ? "openai" : "anthropic",
    model: process.env.OPENAI_API_KEY ? "gpt-4o" : "claude-sonnet-4-20250514",
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
  };

  let command = "";
  let agentId: string | null = null;
  let message: string | null = null;
  let interactive = false;
  let all = false;
  let sessionId: string | null = null;
  let prefix: string | null = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    } else if (arg === "--data-dir" && args[i + 1]) {
      options.dataDir = args[++i];
    } else if (arg === "--provider" && args[i + 1]) {
      options.provider = args[++i];
    } else if (arg === "--model" && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === "--prefix" && args[i + 1]) {
      prefix = args[++i];
    } else if ((arg === "-s" || arg === "--session") && args[i + 1]) {
      sessionId = args[++i];
    } else if (arg === "-i" || arg === "--interactive") {
      interactive = true;
    } else if (arg === "--all") {
      all = true;
    } else if (!command) {
      command = arg;
    } else if (!agentId && command !== "list") {
      agentId = arg;
    } else if (!message && command === "chat") {
      message = arg;
    }

    i++;
  }

  return { command, agentId, message, interactive, all, sessionId, prefix, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { command, agentId, message, interactive, all, sessionId, prefix, options } = parseArgs(args);

  // API key is only required when starting a new agent server
  // - spawn: always needs key
  // - chat (interactive): needs key if agent is stopped (will auto-spawn)
  // - list, status, stop, cleanup: never need key (talk to existing servers or manage files)
  const commandsRequiringKey = ["spawn"];
  const commandsMayRequireKey = ["chat"]; // Only if agent needs to be started

  if (commandsRequiringKey.includes(command)) {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error("Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable");
      console.error("(Required to start agent servers)");
      process.exit(1);
    }
  }

  const ctx = await createContext(options);

  try {
    switch (command) {
      case "spawn":
        // agentId is optional - can auto-generate with optional prefix
        await spawnCommand(ctx, agentId, prefix);
        break;

      case "chat":
        if (!agentId) {
          console.error("Usage: tinycrab chat <agent-id> [message]");
          process.exit(1);
        }
        if (interactive || !message) {
          await interactiveCommand(ctx, agentId, sessionId || undefined);
        } else {
          await chatCommand(ctx, agentId, message, sessionId || undefined);
        }
        break;

      case "list":
        await listCommand(ctx);
        break;

      case "status":
        if (!agentId) {
          console.error("Usage: tinycrab status <agent-id>");
          process.exit(1);
        }
        await statusCommand(ctx, agentId);
        break;

      case "stop":
        if (!agentId) {
          console.error("Usage: tinycrab stop <agent-id>");
          process.exit(1);
        }
        await stopCommand(ctx, agentId);
        break;

      case "cleanup":
        await cleanupCommand(ctx, agentId, all);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    await ctx.tc.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
