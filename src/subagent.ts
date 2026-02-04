/**
 * Subagent module for tinycrab.
 *
 * Supports spawning background agents with:
 * - Session isolation (separate session per subagent)
 * - No nested spawning (subagents can't spawn subagents)
 * - Limited tool access (no spawn, memory, cron tools)
 * - Async announce-back with stats (fire-and-forget model)
 */

import crypto from "node:crypto";
import { createAgentSession, codingTools, AuthStorage } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { MessageBus } from "./bus.js";
import { SUBAGENT_DENIED_TOOLS } from "./tools/subagent.js";

export type SubagentStatus = "running" | "completed" | "failed";

export type Subagent = {
  id: string;
  task: string;
  label?: string;
  status: SubagentStatus;
  createdAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
  /** Session key for isolation */
  sessionKey: string;
  /** Requester info for announce-back */
  requester: {
    channel: string;
    chatId: string;
  };
  /** Stats collected during execution */
  stats?: {
    runtimeMs: number;
    // Token usage if available from session
    tokensIn?: number;
    tokensOut?: number;
  };
  /** Abort controller for timeout */
  abortController?: AbortController;
};

export type SubagentManagerDeps = {
  bus: MessageBus;
  /** Channel to report back to */
  defaultChannel?: string;
  /** Chat ID to report back to */
  defaultChatId?: string;
  /** Shared auth storage for API keys (required for secure key handling) */
  authStorage?: AuthStorage;
  /** Parent session key (for session isolation) */
  parentSessionKey?: string;
};

export type SpawnParams = {
  task: string;
  label?: string;
  /** Channel to report completion to */
  channel?: string;
  /** Chat ID to report completion to */
  chatId?: string;
  /** Timeout in seconds (0 or undefined = no timeout) */
  timeoutSeconds?: number;
};

/**
 * Manages subagents with session isolation and async announce-back.
 */
export class SubagentManager {
  private readonly deps: SubagentManagerDeps;
  private readonly subagents = new Map<string, Subagent>();
  private currentChannel: string;
  private currentChatId: string;

  constructor(deps: SubagentManagerDeps) {
    this.deps = deps;
    this.currentChannel = deps.defaultChannel || "system";
    this.currentChatId = deps.defaultChatId || "main";
  }

  /**
   * Set the current routing context. Call this before processing each message
   * so that tools spawned from that message route back to the right place.
   */
  setCurrentContext(channel: string, chatId: string): void {
    this.currentChannel = channel;
    this.currentChatId = chatId;
  }

  /**
   * Get the current routing context.
   */
  getCurrentContext(): { channel: string; chatId: string } {
    return { channel: this.currentChannel, chatId: this.currentChatId };
  }

  /**
   * Spawn a new subagent to run a task.
   * Returns immediately with the subagent ID (non-blocking).
   */
  async spawn(params: SpawnParams): Promise<string> {
    const id = crypto.randomUUID().slice(0, 8);
    const channel = params.channel || this.currentChannel;
    const chatId = params.chatId || this.currentChatId;

    // Create isolated session key
    const parentKey = this.deps.parentSessionKey || "main";
    const sessionKey = `subagent:${parentKey}:${id}`;

    const subagent: Subagent = {
      id,
      task: params.task,
      label: params.label,
      status: "running",
      createdAt: Date.now(),
      sessionKey,
      requester: { channel, chatId },
    };

    // Setup timeout if specified
    if (params.timeoutSeconds && params.timeoutSeconds > 0) {
      subagent.abortController = new AbortController();
      setTimeout(() => {
        if (subagent.status === "running") {
          subagent.abortController?.abort();
          this.handleTimeout(subagent);
        }
      }, params.timeoutSeconds * 1000);
    }

    this.subagents.set(id, subagent);

    // Run in background (don't await)
    this.runSubagent(subagent);

    return id;
  }

  /**
   * Get subagent by ID.
   */
  get(id: string): Subagent | undefined {
    return this.subagents.get(id);
  }

  /**
   * List all subagents.
   */
  list(filter?: { status?: SubagentStatus }): Subagent[] {
    const all = Array.from(this.subagents.values());
    if (filter?.status) {
      return all.filter((s) => s.status === filter.status);
    }
    return all;
  }

  /**
   * Stop a running subagent.
   */
  stop(id: string): boolean {
    const subagent = this.subagents.get(id);
    if (!subagent || subagent.status !== "running") {
      return false;
    }

    subagent.abortController?.abort();
    subagent.status = "completed";
    subagent.completedAt = Date.now();
    subagent.result = "Stopped by request";
    subagent.stats = {
      runtimeMs: subagent.completedAt - subagent.createdAt,
    };

    // Announce the stop
    this.announceResult(subagent, "stopped");

    return true;
  }

  /**
   * Clean up completed subagents older than maxAge.
   */
  cleanup(maxAgeMs: number = 30 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let count = 0;

    for (const [id, subagent] of this.subagents.entries()) {
      if (
        subagent.status !== "running" &&
        (subagent.completedAt ?? 0) < cutoff
      ) {
        this.subagents.delete(id);
        count++;
      }
    }

    return count;
  }

  private handleTimeout(subagent: Subagent): void {
    subagent.status = "failed";
    subagent.completedAt = Date.now();
    subagent.error = "Timeout exceeded";
    subagent.stats = {
      runtimeMs: subagent.completedAt - subagent.createdAt,
    };

    this.announceResult(subagent, "timed out");
  }

  private async runSubagent(subagent: Subagent): Promise<void> {
    try {
      const provider = process.env.AGENT_PROVIDER || "openai";
      const modelId = process.env.AGENT_MODEL || "gpt-4o";
      const model = (getModel as any)(provider, modelId);

      // Create limited tool set for subagents (no spawn, memory, cron)
      const subagentTools = codingTools.filter(
        (tool) => !SUBAGENT_DENIED_TOOLS.includes(tool.name)
      );

      const { session } = await createAgentSession({
        model,
        tools: subagentTools as any,
        authStorage: this.deps.authStorage,
      });

      // Build system context for subagent
      const systemContext = this.buildSubagentContext(subagent);

      // Run the task with system context prepended
      const fullPrompt = `${systemContext}\n\nTask: ${subagent.task}`;
      await session.prompt(fullPrompt);

      const result = session.getLastAssistantText() || "Done";

      subagent.status = "completed";
      subagent.completedAt = Date.now();
      subagent.result = result;
      subagent.stats = {
        runtimeMs: subagent.completedAt - subagent.createdAt,
        // TODO: Extract token usage from session if available
      };

      // Announce completion to requester
      this.announceResult(subagent, "completed successfully");
    } catch (error) {
      // Check if aborted (timeout or stop)
      if (subagent.abortController?.signal.aborted) {
        return; // Already handled by timeout handler
      }

      const message = error instanceof Error ? error.message : String(error);

      subagent.status = "failed";
      subagent.completedAt = Date.now();
      subagent.error = message;
      subagent.stats = {
        runtimeMs: subagent.completedAt - subagent.createdAt,
      };

      this.announceResult(subagent, `failed: ${message}`);
    }
  }

  /**
   * Build system context for subagent explaining its limited role.
   */
  private buildSubagentContext(subagent: Subagent): string {
    const label = subagent.label ? ` "${subagent.label}"` : "";
    return `You are a background subagent${label} created to handle a specific task.

IMPORTANT GUIDELINES:
- Focus ONLY on the task assigned to you
- Your final message will be automatically reported to the main agent
- You cannot spawn other subagents (nested spawning is blocked)
- You do not have access to memory tools - all context is in the task description
- Complete your work thoroughly, then provide a clear summary of findings/results
- If you need clarification, state what's unclear in your response

Session: ${subagent.sessionKey}
Created: ${new Date(subagent.createdAt).toISOString()}`;
  }

  /**
   * Announce subagent result back to requester.
   */
  private async announceResult(
    subagent: Subagent,
    outcome: string
  ): Promise<void> {
    const { channel, chatId } = subagent.requester;
    const label = subagent.label ? ` "${subagent.label}"` : "";

    // Format runtime
    const runtimeMs = subagent.stats?.runtimeMs ?? 0;
    const runtimeStr = runtimeMs > 60000
      ? `${Math.round(runtimeMs / 60000)}m${Math.round((runtimeMs % 60000) / 1000)}s`
      : `${Math.round(runtimeMs / 1000)}s`;

    // Build stats line
    const statsLine = `runtime ${runtimeStr} | session ${subagent.sessionKey}`;

    // Build announcement message
    let content: string;
    if (subagent.status === "completed") {
      content = `[Subagent ${subagent.id}${label} ${outcome}]

Findings:
${subagent.result}

Stats: ${statsLine}`;
    } else if (subagent.status === "failed") {
      content = `[Subagent ${subagent.id}${label} ${outcome}]

Error: ${subagent.error}

Stats: ${statsLine}`;
    } else {
      content = `[Subagent ${subagent.id}${label} ${outcome}]

Stats: ${statsLine}`;
    }

    await this.deps.bus.publishOutbound({
      channel,
      chatId,
      content,
    });
  }
}

/**
 * Simple spawn function for backward compatibility.
 */
export async function spawn(
  bus: MessageBus,
  task: string,
  originChannel: string,
  originChatId: string,
  authStorage?: AuthStorage
): Promise<string> {
  const manager = new SubagentManager({ bus, authStorage });
  return manager.spawn({
    task,
    channel: originChannel,
    chatId: originChatId,
  });
}
