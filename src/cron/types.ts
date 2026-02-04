/**
 * Cron types for tinycrab.
 *
 * Supports three schedule types:
 * - `at`: One-shot at specific time
 * - `every`: Recurring interval
 * - `cron`: Standard cron expression
 */

export type CronSchedule =
  | { kind: "at"; atMs: number }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      /** Deliver response to a channel */
      deliver?: boolean;
      channel?: string;
      chatId?: string;
    };

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** Delete after first run (one-shot) */
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronJobState;
};

export type CronJobCreate = Omit<CronJob, "id" | "createdAtMs" | "updatedAtMs" | "state"> & {
  state?: Partial<CronJobState>;
};

export type CronJobPatch = Partial<Omit<CronJob, "id" | "createdAtMs" | "state">> & {
  state?: Partial<CronJobState>;
};

export type CronEvent = {
  type: "run" | "error" | "skip";
  job: CronJob;
  result?: string;
  error?: string;
};
