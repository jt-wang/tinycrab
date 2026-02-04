/**
 * Subagent tools for tinycrab agent.
 *
 * Gives the AI agent tools to spawn and manage subagents.
 * Follows OpenClaw-style design:
 * - Non-blocking spawn (returns immediately)
 * - No nested spawning (subagents can't spawn subagents)
 * - Async announce-back when subagent completes
 * - Limited tool access for subagents
 */

import { Type, type Static } from "@sinclair/typebox";
import type { SubagentManager, Subagent } from "../subagent.js";

// Tool result types matching pi-agent-core
interface TextContent {
  type: "text";
  text: string;
}

interface AgentToolResult<T> {
  content: TextContent[];
  details: T;
}

// Parameter schemas
const SpawnSubagentParams = Type.Object({
  task: Type.String({
    description:
      "The task for the subagent to perform. Be specific and include all necessary context.",
  }),
  label: Type.Optional(
    Type.String({
      description:
        "A short label for this subagent (e.g., 'research', 'code-review'). Used in status updates.",
    })
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({
      description:
        "Maximum time in seconds for the subagent to complete. Default: no timeout.",
      minimum: 0,
    })
  ),
});

const StopSubagentParams = Type.Object({
  subagentId: Type.String({
    description: "The ID of the subagent to stop.",
  }),
});

const ListSubagentsParams = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("running"),
      Type.Literal("completed"),
      Type.Literal("failed"),
    ], {
      description: "Filter by status. Omit to list all subagents.",
    })
  ),
});

type SpawnSubagentInput = Static<typeof SpawnSubagentParams>;
type StopSubagentInput = Static<typeof StopSubagentParams>;
type ListSubagentsInput = Static<typeof ListSubagentsParams>;

export interface SubagentToolDetails {
  action: "spawn" | "stop" | "list";
  success: boolean;
  subagentId?: string;
  error?: string;
}

export interface SubagentToolContext {
  /** The subagent manager instance */
  manager: SubagentManager;
  /** Channel to report results back to */
  channel: string;
  /** Chat ID to report results back to */
  chatId: string;
  /** Whether the caller is itself a subagent (blocks nested spawning) */
  isSubagent?: boolean;
}

/**
 * Creates subagent tools bound to a SubagentManager and context.
 *
 * @param context - The context including manager and routing info
 * @returns Array of subagent tools
 */
export function createSubagentTools(context: SubagentToolContext) {
  const { manager, channel, chatId, isSubagent } = context;

  const spawnSubagentTool = {
    name: "spawn_subagent",
    description:
      "Spawn a background agent to work on a task independently. " +
      "The subagent runs in parallel and will announce its results when complete. " +
      "Use this for: research tasks, long-running operations, parallel work items, " +
      "or any task that doesn't need immediate results. " +
      "Returns immediately with a subagent ID - don't wait for results.",
    parameters: SpawnSubagentParams,
    label: "Spawn Subagent",
    execute: async (
      _toolCallId: string,
      params: SpawnSubagentInput
    ): Promise<AgentToolResult<SubagentToolDetails>> => {
      // Block nested spawning - subagents can't spawn subagents
      if (isSubagent) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Subagents cannot spawn other subagents. Complete your task and report back to the main agent.",
            },
          ],
          details: {
            action: "spawn",
            success: false,
            error: "nested_spawn_blocked",
          },
        };
      }

      try {
        const subagentId = await manager.spawn({
          task: params.task,
          label: params.label,
          channel,
          chatId,
          timeoutSeconds: params.timeoutSeconds,
        });

        const label = params.label ? ` "${params.label}"` : "";
        return {
          content: [
            {
              type: "text",
              text: `Spawned subagent${label} (id: ${subagentId}). It will work on the task in the background and announce results when complete.`,
            },
          ],
          details: {
            action: "spawn",
            success: true,
            subagentId,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to spawn subagent: ${message}`,
            },
          ],
          details: {
            action: "spawn",
            success: false,
            error: message,
          },
        };
      }
    },
  };

  const stopSubagentTool = {
    name: "stop_subagent",
    description:
      "Stop a running subagent. Use this if the task is no longer needed " +
      "or if you want to cancel a long-running operation.",
    parameters: StopSubagentParams,
    label: "Stop Subagent",
    execute: async (
      _toolCallId: string,
      params: StopSubagentInput
    ): Promise<AgentToolResult<SubagentToolDetails>> => {
      const stopped = manager.stop(params.subagentId);

      if (stopped) {
        return {
          content: [
            {
              type: "text",
              text: `Stopped subagent ${params.subagentId}.`,
            },
          ],
          details: {
            action: "stop",
            success: true,
            subagentId: params.subagentId,
          },
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Subagent ${params.subagentId} not found or already stopped.`,
            },
          ],
          details: {
            action: "stop",
            success: false,
            subagentId: params.subagentId,
            error: "not_found_or_stopped",
          },
        };
      }
    },
  };

  const listSubagentsTool = {
    name: "list_subagents",
    description:
      "List all subagents and their status. " +
      "Use this to check on background tasks.",
    parameters: ListSubagentsParams,
    label: "List Subagents",
    execute: async (
      _toolCallId: string,
      params: ListSubagentsInput
    ): Promise<AgentToolResult<SubagentToolDetails>> => {
      const subagents = manager.list(
        params.status ? { status: params.status } : undefined
      );

      if (subagents.length === 0) {
        const filter = params.status ? ` with status "${params.status}"` : "";
        return {
          content: [
            {
              type: "text",
              text: `No subagents found${filter}.`,
            },
          ],
          details: {
            action: "list",
            success: true,
          },
        };
      }

      const formatted = subagents
        .map((s) => {
          const label = s.label ? ` "${s.label}"` : "";
          const runtime = s.completedAt
            ? ` (${Math.round((s.completedAt - s.createdAt) / 1000)}s)`
            : ` (running ${Math.round((Date.now() - s.createdAt) / 1000)}s)`;
          const result =
            s.status === "completed"
              ? ` - ${s.result?.slice(0, 100)}${(s.result?.length ?? 0) > 100 ? "..." : ""}`
              : s.status === "failed"
                ? ` - Error: ${s.error}`
                : "";
          return `- ${s.id}${label}: ${s.status}${runtime}${result}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Subagents (${subagents.length}):\n${formatted}`,
          },
        ],
        details: {
          action: "list",
          success: true,
        },
      };
    },
  };

  return [
    spawnSubagentTool,
    stopSubagentTool,
    listSubagentsTool,
  ];
}

/**
 * Tool names that subagents should NOT have access to.
 * This prevents subagents from spawning more subagents or accessing
 * session management functionality.
 */
export const SUBAGENT_DENIED_TOOLS = [
  "spawn_subagent",
  "stop_subagent",
  "list_subagents",
  // Memory tools - pass info in spawn task instead
  "remember",
  "recall",
  // Cron tools - main agent orchestrates scheduling
  "cron_schedule",
  "cron_list",
  "cron_cancel",
];
