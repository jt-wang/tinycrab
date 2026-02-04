/**
 * Memory tools for tinycrab agent.
 *
 * Gives the agent tools to store and retrieve structured memories.
 * Uses pluggable MemoryProvider (default: FileMemoryProvider with JSONL storage).
 */

import { Type, type Static } from "@sinclair/typebox";
import type { MemoryProvider } from "../memory/types.js";

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
const RememberParams = Type.Object({
  content: Type.String({ description: "The information to remember" }),
  importance: Type.Optional(
    Type.Number({
      description: "How important this memory is (0-1). Use 0.9+ for critical facts, 0.7 for preferences, 0.5 for general notes. Default 0.5",
      minimum: 0,
      maximum: 1,
    })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags to categorize this memory (e.g., 'preference', 'decision', 'fact', 'todo')",
    })
  ),
  sessionId: Type.Optional(
    Type.String({
      description: "If provided, this memory is private to this session/user (e.g., their preferences, facts about them). Omit for global memories (tasks, general knowledge, project info).",
    })
  ),
});

const RecallParams = Type.Object({
  query: Type.String({ description: "What to search for in memory" }),
  maxResults: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return. Default 5",
      minimum: 1,
      maximum: 20,
    })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Filter by tags",
    })
  ),
  sessionId: Type.Optional(
    Type.String({
      description: "If provided, search both global memories and this session's private memories. Omit to search all memories.",
    })
  ),
});

type RememberInput = Static<typeof RememberParams>;
type RecallInput = Static<typeof RecallParams>;

export interface MemoryToolDetails {
  action: "remember" | "recall";
  success: boolean;
  id?: string;
  count?: number;
}

/**
 * Creates memory tools bound to a specific memory provider.
 */
export function createMemoryTools(memory: MemoryProvider) {
  const rememberTool = {
    name: "remember",
    description:
      "Store important information for later recall. Use this PROACTIVELY when you learn something worth remembering: " +
      "user preferences, project decisions, important facts, key dates, todos, or anything the user might ask about later. " +
      "Don't wait to be asked - if it's important, remember it immediately.",
    parameters: RememberParams,
    label: "Remember",
    execute: async (
      _toolCallId: string,
      params: RememberInput
    ): Promise<AgentToolResult<MemoryToolDetails>> => {
      const entry = await memory.add({
        content: params.content,
        importance: params.importance ?? 0.5,
        tags: params.tags,
        sessionId: params.sessionId,  // Private to session if provided
      });

      const scope = params.sessionId ? `private to session ${params.sessionId.slice(0, 8)}...` : "global";
      return {
        content: [
          {
            type: "text",
            text: `Remembered (${scope}): "${params.content.slice(0, 100)}${params.content.length > 100 ? "..." : ""}" (id: ${entry.id})`,
          },
        ],
        details: {
          action: "remember",
          success: true,
          id: entry.id,
        },
      };
    },
  };

  const recallTool = {
    name: "recall",
    description:
      "Search your memory for previously stored information. " +
      "Use this BEFORE answering questions about: prior work, decisions, user preferences, dates, people, todos, or past conversations. " +
      "If you're unsure whether you know something, check memory first.",
    parameters: RecallParams,
    label: "Recall",
    execute: async (
      _toolCallId: string,
      params: RecallInput
    ): Promise<AgentToolResult<MemoryToolDetails>> => {
      const results = await memory.search({
        query: params.query,
        maxResults: params.maxResults ?? 5,
        tags: params.tags,
        sessionId: params.sessionId,  // Filters to global + this session's private memories
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No memories found for: "${params.query}"`,
            },
          ],
          details: {
            action: "recall",
            success: true,
            count: 0,
          },
        };
      }

      const formatted = results
        .map((r, i) => {
          const meta: string[] = [];
          if (r.entry.tags?.length) meta.push(`tags: ${r.entry.tags.join(", ")}`);
          if (r.entry.sessionId) meta.push(`session: ${r.entry.sessionId.slice(0, 8)}...`);
          const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : "";
          return `${i + 1}. [score: ${r.score.toFixed(2)}] ${r.entry.content}${metaStr}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} memories:\n${formatted}`,
          },
        ],
        details: {
          action: "recall",
          success: true,
          count: results.length,
        },
      };
    },
  };

  return [rememberTool, recallTool];
}
