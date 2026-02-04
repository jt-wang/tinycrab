/**
 * Cron tools for tinycrab agent.
 *
 * Gives the agent tools to schedule, list, and cancel cron jobs.
 * Uses simplified time parameters for natural language interaction.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { CronService } from "../cron/service.js";
import type { CronSchedule, CronJob } from "../cron/types.js";

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

const CronScheduleParams = Type.Object({
  name: Type.String({
    description: "A descriptive name for the job (e.g., 'daily-summary', 'reminder-call-mom')",
  }),
  message: Type.String({
    description: "The prompt/message to send to the agent when the job fires",
  }),
  inMinutes: Type.Optional(
    Type.Number({
      description: "Schedule job to run in N minutes from now (one-shot)",
      minimum: 1,
    })
  ),
  at: Type.Optional(
    Type.String({
      description:
        "Schedule job at specific time: HH:MM (24h format, today or next occurrence) or ISO 8601 datetime (one-shot)",
    })
  ),
  everyMinutes: Type.Optional(
    Type.Number({
      description: "Schedule job to run every N minutes (recurring)",
      minimum: 1,
    })
  ),
  cronExpr: Type.Optional(
    Type.String({
      description:
        "Standard cron expression for complex schedules (recurring). E.g., '0 9 * * 1-5' for weekdays at 9am",
    })
  ),
  timezone: Type.Optional(
    Type.String({
      description: "Timezone for 'at' or 'cronExpr' (e.g., 'America/New_York'). Default: system timezone",
    })
  ),
  description: Type.Optional(
    Type.String({
      description: "Optional description of what this job does",
    })
  ),
});

const CronListParams = Type.Object({
  includeDisabled: Type.Optional(
    Type.Boolean({
      description: "Include disabled jobs in the list. Default: false",
    })
  ),
});

const CronCancelParams = Type.Object({
  jobId: Type.String({
    description: "The ID of the job to cancel",
  }),
});

type CronScheduleInput = Static<typeof CronScheduleParams>;
type CronListInput = Static<typeof CronListParams>;
type CronCancelInput = Static<typeof CronCancelParams>;

export interface CronToolDetails {
  action: "schedule" | "list" | "cancel";
  success: boolean;
  jobId?: string;
  count?: number;
  error?: string;
}

/**
 * Parse 'at' time parameter into milliseconds timestamp.
 * Supports:
 * - HH:MM (24h format) - schedules for today or tomorrow if time has passed
 * - ISO 8601 datetime string
 */
export function parseAtTime(at: string, timezone?: string): number {
  // Try HH:MM format first
  const timeMatch = at.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid time: ${at}. Hours must be 0-23, minutes 0-59.`);
    }

    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  // Try ISO 8601 datetime
  const parsed = Date.parse(at);
  if (!isNaN(parsed)) {
    if (parsed <= Date.now()) {
      throw new Error(`Time '${at}' is in the past.`);
    }
    return parsed;
  }

  throw new Error(
    `Invalid time format: '${at}'. Use HH:MM (24h) or ISO 8601 datetime.`
  );
}

/**
 * Parse schedule parameters into CronSchedule.
 * Exactly one timing option must be provided.
 */
export function parseSchedule(params: CronScheduleInput): {
  schedule: CronSchedule;
  deleteAfterRun: boolean;
} {
  const timingOptions = [
    params.inMinutes !== undefined,
    params.at !== undefined,
    params.everyMinutes !== undefined,
    params.cronExpr !== undefined,
  ];
  const providedCount = timingOptions.filter(Boolean).length;

  if (providedCount === 0) {
    throw new Error(
      "Must provide one timing option: inMinutes, at, everyMinutes, or cronExpr"
    );
  }
  if (providedCount > 1) {
    throw new Error(
      "Provide only ONE timing option: inMinutes, at, everyMinutes, or cronExpr"
    );
  }

  if (params.inMinutes !== undefined) {
    const atMs = Date.now() + params.inMinutes * 60 * 1000;
    return {
      schedule: { kind: "at", atMs },
      deleteAfterRun: true, // One-shot
    };
  }

  if (params.at !== undefined) {
    const atMs = parseAtTime(params.at, params.timezone);
    return {
      schedule: { kind: "at", atMs },
      deleteAfterRun: true, // One-shot
    };
  }

  if (params.everyMinutes !== undefined) {
    const everyMs = params.everyMinutes * 60 * 1000;
    return {
      schedule: { kind: "every", everyMs, anchorMs: Date.now() },
      deleteAfterRun: false, // Recurring
    };
  }

  if (params.cronExpr !== undefined) {
    return {
      schedule: { kind: "cron", expr: params.cronExpr, tz: params.timezone },
      deleteAfterRun: false, // Recurring
    };
  }

  // Should never reach here due to validation above
  throw new Error("Invalid schedule parameters");
}

/**
 * Format next run time for display.
 */
export function formatNextRun(nextRunAtMs?: number): string {
  if (!nextRunAtMs) {
    return "not scheduled";
  }

  const now = Date.now();
  const diffMs = nextRunAtMs - now;

  if (diffMs < 0) {
    return "overdue";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return "in < 1 minute";
  }
  if (diffMinutes < 60) {
    return `in ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
  }
  if (diffHours < 24) {
    const mins = diffMinutes % 60;
    return `in ${diffHours}h ${mins}m`;
  }

  const date = new Date(nextRunAtMs);
  return `in ${diffDays}d (${date.toLocaleString()})`;
}

/**
 * Format job info for list display.
 */
function formatJob(job: CronJob): string {
  const status = job.enabled ? "✓" : "✗";
  const oneShot = job.deleteAfterRun ? " (one-shot)" : "";
  const nextRun = formatNextRun(job.state.nextRunAtMs);
  const msgPreview =
    job.payload.kind === "agentTurn"
      ? job.payload.message.slice(0, 50) + (job.payload.message.length > 50 ? "..." : "")
      : job.payload.text.slice(0, 50) + (job.payload.text.length > 50 ? "..." : "");

  return `[${status}] ${job.name}${oneShot}
   ID: ${job.id}
   Next: ${nextRun}
   Message: "${msgPreview}"`;
}

/**
 * Creates cron tools bound to a specific CronService.
 */
export function createCronTools(cron: CronService) {
  const scheduleTool = {
    name: "cron_schedule",
    description:
      "Schedule a task to run at a specific time or on a recurring basis. " +
      "Use inMinutes for 'in 30 minutes', at for 'at 9am', everyMinutes for 'every hour', " +
      "or cronExpr for complex schedules like 'weekdays at 9am'.",
    parameters: CronScheduleParams,
    label: "Schedule Cron Job",
    execute: async (
      _toolCallId: string,
      params: CronScheduleInput
    ): Promise<AgentToolResult<CronToolDetails>> => {
      try {
        const { schedule, deleteAfterRun } = parseSchedule(params);

        const job = await cron.add({
          name: params.name,
          description: params.description,
          enabled: true,
          deleteAfterRun,
          schedule,
          payload: {
            kind: "agentTurn",
            message: params.message,
          },
        });

        const nextRun = formatNextRun(job.state.nextRunAtMs);
        const type = deleteAfterRun ? "one-shot" : "recurring";

        return {
          content: [
            {
              type: "text",
              text: `Scheduled ${type} job "${job.name}" (ID: ${job.id}). Next run: ${nextRun}`,
            },
          ],
          details: {
            action: "schedule",
            success: true,
            jobId: job.id,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Failed to schedule job: ${message}`,
            },
          ],
          details: {
            action: "schedule",
            success: false,
            error: message,
          },
        };
      }
    },
  };

  const listTool = {
    name: "cron_list",
    description: "List all scheduled cron jobs with their status and next run time.",
    parameters: CronListParams,
    label: "List Cron Jobs",
    execute: async (
      _toolCallId: string,
      params: CronListInput
    ): Promise<AgentToolResult<CronToolDetails>> => {
      const jobs = await cron.list({ includeDisabled: params.includeDisabled });

      if (jobs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No scheduled jobs.",
            },
          ],
          details: {
            action: "list",
            success: true,
            count: 0,
          },
        };
      }

      const formatted = jobs.map(formatJob).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Scheduled jobs (${jobs.length}):\n\n${formatted}`,
          },
        ],
        details: {
          action: "list",
          success: true,
          count: jobs.length,
        },
      };
    },
  };

  const cancelTool = {
    name: "cron_cancel",
    description: "Cancel a scheduled cron job by its ID.",
    parameters: CronCancelParams,
    label: "Cancel Cron Job",
    execute: async (
      _toolCallId: string,
      params: CronCancelInput
    ): Promise<AgentToolResult<CronToolDetails>> => {
      const removed = await cron.remove(params.jobId);

      if (!removed) {
        return {
          content: [
            {
              type: "text",
              text: `Job not found: ${params.jobId}`,
            },
          ],
          details: {
            action: "cancel",
            success: false,
            jobId: params.jobId,
            error: "Job not found",
          },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Cancelled job: ${params.jobId}`,
          },
        ],
        details: {
          action: "cancel",
          success: true,
          jobId: params.jobId,
        },
      };
    },
  };

  return [scheduleTool, listTool, cancelTool];
}
