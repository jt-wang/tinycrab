/**
 * CLI command handlers for tinycrab.
 */

import * as readline from "node:readline";
import { Tinycrab } from "../sdk/tinycrab.js";
import type { TinycrabOptions } from "../sdk/types.js";

export interface CliContext {
  tc: Tinycrab;
  options: TinycrabOptions;
}

export async function createContext(options: TinycrabOptions): Promise<CliContext> {
  const tc = new Tinycrab(options);
  return { tc, options };
}

export async function spawnCommand(
  ctx: CliContext,
  agentId: string | null,
  prefix: string | null
): Promise<void> {
  let agent;
  if (agentId) {
    // Explicit agent ID provided
    agent = await ctx.tc.agent(agentId);
  } else {
    // Auto-generate agent ID with optional prefix
    agent = await ctx.tc.spawn({ prefix: prefix || undefined });
  }

  const info = agent.info;
  console.log(`Agent '${info.id}' spawned at ${info.workspace}`);
  if (info.port) {
    console.log(`Server running on port ${info.port} (pid: ${info.pid})`);
  }
}

export async function chatCommand(
  ctx: CliContext,
  agentId: string,
  message: string,
  sessionId?: string
): Promise<void> {
  const agent = await ctx.tc.get(agentId);
  if (!agent) {
    console.error(`Agent '${agentId}' not found. Run 'tinycrab spawn ${agentId}' first.`);
    process.exit(1);
  }

  const result = await agent.chat(message, { sessionId });
  console.log(`[${agentId}]: ${result.response}`);
  // Show session ID if it was auto-generated or secured (different from input)
  if (!sessionId || sessionId !== result.sessionId) {
    console.log(`(session: ${result.sessionId})`);
  }
}

export async function interactiveCommand(
  ctx: CliContext,
  agentId: string,
  sessionId?: string
): Promise<void> {
  // Spawn or get agent
  const agent = await ctx.tc.agent(agentId);

  // Session ID will be assigned by server if not provided
  // If user provides "bob", server will make it "bob-{crypto}" for security
  let currentSessionId: string | undefined = sessionId;

  console.log(`Interactive session with '${agentId}'`);
  if (currentSessionId) {
    console.log(`Session: ${currentSessionId} (will be secured by server)`);
  }
  console.log(`Workspace: ${agent.info.workspace}`);
  console.log(`Type 'exit' to quit.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${agentId}> `, async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        rl.close();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        const result = await agent.chat(trimmed, { sessionId: currentSessionId });
        const isFirstMessage = !currentSessionId;
        currentSessionId = result.sessionId; // Update with server-assigned ID
        if (isFirstMessage) {
          console.log(`(session: ${currentSessionId})`);
        }
        console.log(`[${agentId}]: ${result.response}\n`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
      }

      prompt();
    });
  };

  prompt();

  // Wait for readline to close
  await new Promise<void>((resolve) => {
    rl.on("close", resolve);
  });
}

export async function listCommand(ctx: CliContext): Promise<void> {
  const agents = await ctx.tc.list();

  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }

  console.log("NAME\t\t\tSTATUS\t\tPORT\t\tWORKSPACE");
  console.log("─".repeat(80));

  for (const info of agents) {
    const name = info.id.padEnd(20);
    const status = info.status.padEnd(12);
    const port = info.port ? String(info.port).padEnd(8) : "-".padEnd(8);
    console.log(`${name}\t${status}\t${port}\t${info.workspace}`);
  }
}

export async function statusCommand(
  ctx: CliContext,
  agentId: string
): Promise<void> {
  const agent = await ctx.tc.get(agentId);
  if (!agent) {
    console.error(`Agent '${agentId}' not found.`);
    process.exit(1);
  }

  const info = await agent.status();
  console.log(`Agent: ${info.id}`);
  console.log(`Status: ${info.status}`);
  if (info.port) {
    console.log(`Port: ${info.port}`);
    console.log(`PID: ${info.pid}`);
  }
  console.log(`Workspace: ${info.workspace}`);
  console.log(`Session Dir: ${info.sessionDir}`);
  console.log(`Memory Dir: ${info.memoryDir}`);
  console.log(`Created: ${new Date(info.createdAt).toISOString()}`);
}

export async function stopCommand(
  ctx: CliContext,
  agentId: string
): Promise<void> {
  const agent = await ctx.tc.get(agentId);
  if (!agent) {
    console.error(`Agent '${agentId}' not found.`);
    process.exit(1);
  }

  await agent.stop();
  console.log(`Agent '${agentId}' stopped.`);
}

export async function cleanupCommand(
  ctx: CliContext,
  agentId: string | null,
  all: boolean
): Promise<void> {
  if (all) {
    const agents = await ctx.tc.list();
    for (const info of agents) {
      const agent = await ctx.tc.get(info.id);
      if (agent) {
        await agent.destroy({ cleanup: true });
        console.log(`Cleaned up agent '${info.id}'`);
      }
    }
    console.log(`Cleaned up ${agents.length} agents.`);
  } else if (agentId) {
    const agent = await ctx.tc.get(agentId);
    if (!agent) {
      console.error(`Agent '${agentId}' not found.`);
      process.exit(1);
    }

    await agent.destroy({ cleanup: true });
    console.log(`Agent '${agentId}' cleaned up.`);
  } else {
    console.error("Specify an agent ID or use --all");
    process.exit(1);
  }
}
