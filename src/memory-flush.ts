/**
 * Pre-compaction memory flush for tinycrab.
 *
 * Before each user prompt, checks if context is near capacity.
 * If so, runs a silent "memory flush" turn to save important context
 * using the structured `remember` tool.
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";

export const MEMORY_FLUSH_PROMPT =
  "Pre-compaction memory flush. " +
  "Review the conversation and use the `remember` tool to store any important information that should be preserved: " +
  "user preferences, decisions made, key facts, todos, or anything worth remembering. " +
  "Use appropriate importance scores (0.9 for critical, 0.7 for preferences, 0.5 for general). " +
  "If nothing important to store, reply with NO_REPLY.";

/** Default threshold for triggering memory flush (80% of context) */
export const DEFAULT_FLUSH_THRESHOLD = 0.80;

export interface MemoryFlushConfig {
  /** Enable pre-compaction memory flush. Default: true */
  enabled?: boolean;
  /** Trigger flush when context usage exceeds this percent (0-1). Default: 0.80 */
  threshold?: number;
  /** Custom flush prompt. Default: MEMORY_FLUSH_PROMPT */
  prompt?: string;
}

/**
 * Check if memory flush should run based on context usage.
 */
export function shouldRunMemoryFlush(
  session: AgentSession,
  config: MemoryFlushConfig = {}
): boolean {
  if (config.enabled === false) {
    return false;
  }

  const threshold = config.threshold ?? DEFAULT_FLUSH_THRESHOLD;

  try {
    const usage = session.getContextUsage();
    if (!usage) {
      return false;
    }

    // Check if we're above the threshold
    return usage.percent >= threshold;
  } catch {
    // If we can't get context usage, don't flush
    return false;
  }
}

/**
 * Run memory flush prompt if needed.
 * Returns true if flush was run, false otherwise.
 */
export async function runMemoryFlushIfNeeded(
  session: AgentSession,
  config: MemoryFlushConfig = {}
): Promise<boolean> {
  if (!shouldRunMemoryFlush(session, config)) {
    return false;
  }

  const prompt = config.prompt ?? MEMORY_FLUSH_PROMPT;

  try {
    console.log("[tinycrab] Running pre-compaction memory flush...");
    await session.prompt(prompt);

    const response = session.getLastAssistantText() || "";
    if (response.includes("NO_REPLY")) {
      console.log("[tinycrab] Memory flush: nothing to store");
    } else {
      console.log("[tinycrab] Memory flush completed");
    }

    return true;
  } catch (err) {
    console.error("[tinycrab] Memory flush failed:", err);
    return false;
  }
}

/**
 * Wrapper that runs memory flush before user prompt if needed.
 */
export async function promptWithMemoryFlush(
  session: AgentSession,
  userPrompt: string,
  config: MemoryFlushConfig = {}
): Promise<void> {
  // Check and run memory flush before user's prompt
  await runMemoryFlushIfNeeded(session, config);

  // Run the actual user prompt
  await session.prompt(userPrompt);
}
