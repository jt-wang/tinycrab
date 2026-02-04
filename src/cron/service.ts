/**
 * Cron service for tinycrab.
 *
 * Enables proactive agent behavior through scheduled tasks.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import cronParser from "cron-parser";
import type {
  CronJob,
  CronJobCreate,
  CronJobPatch,
  CronEvent,
  CronSchedule,
} from "./types.js";

export type CronServiceDeps = {
  storePath: string;
  onEvent?: (event: CronEvent) => void;
  executeJob: (job: CronJob) => Promise<string | undefined>;
};

type JobTimer = {
  jobId: string;
  timer: NodeJS.Timeout;
};

export class CronService {
  private readonly deps: CronServiceDeps;
  private jobs: CronJob[] = [];
  private timers = new Map<string, JobTimer>();
  private opChain: Promise<void> = Promise.resolve();
  private running = false;

  constructor(deps: CronServiceDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    await this.load();
    this.scheduleAllJobs();
  }

  stop(): void {
    this.running = false;
    for (const { timer } of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async list(opts?: { includeDisabled?: boolean }): Promise<CronJob[]> {
    return this.locked(async () => {
      if (opts?.includeDisabled) {
        return [...this.jobs];
      }
      return this.jobs.filter((j) => j.enabled);
    });
  }

  async add(input: CronJobCreate): Promise<CronJob> {
    return this.locked(async () => {
      const now = Date.now();
      const job: CronJob = {
        ...input,
        id: randomUUID(),
        createdAtMs: now,
        updatedAtMs: now,
        state: {
          ...input.state,
          nextRunAtMs: this.computeNextRun(input.schedule),
        },
      };

      this.jobs.push(job);
      await this.save();

      if (this.running && job.enabled) {
        this.scheduleJob(job);
      }

      return job;
    });
  }

  async update(id: string, patch: CronJobPatch): Promise<CronJob | null> {
    return this.locked(async () => {
      const idx = this.jobs.findIndex((j) => j.id === id);
      if (idx < 0) {
        return null;
      }

      const existing = this.jobs[idx];
      const updated: CronJob = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAtMs: existing.createdAtMs,
        updatedAtMs: Date.now(),
        state: {
          ...existing.state,
          ...patch.state,
        },
      };

      // Recompute next run if schedule changed
      if (patch.schedule) {
        updated.state.nextRunAtMs = this.computeNextRun(patch.schedule);
      }

      this.jobs[idx] = updated;
      await this.save();

      // Reschedule if running
      if (this.running) {
        this.cancelJobTimer(id);
        if (updated.enabled) {
          this.scheduleJob(updated);
        }
      }

      return updated;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.locked(async () => {
      const idx = this.jobs.findIndex((j) => j.id === id);
      if (idx < 0) {
        return false;
      }

      this.jobs.splice(idx, 1);
      await this.save();

      this.cancelJobTimer(id);
      return true;
    });
  }

  async run(id: string, mode: "due" | "force" = "force"): Promise<string | undefined> {
    return this.locked(async () => {
      const job = this.jobs.find((j) => j.id === id);
      if (!job) {
        throw new Error(`Job not found: ${id}`);
      }

      if (mode === "due" && job.state.nextRunAtMs && job.state.nextRunAtMs > Date.now()) {
        return undefined;
      }

      return this.executeJob(job);
    });
  }

  private async executeJob(job: CronJob): Promise<string | undefined> {
    const startMs = Date.now();
    job.state.runningAtMs = startMs;

    try {
      const result = await this.deps.executeJob(job);

      job.state.lastRunAtMs = startMs;
      job.state.lastDurationMs = Date.now() - startMs;
      job.state.lastStatus = "ok";
      job.state.lastError = undefined;
      job.state.runningAtMs = undefined;

      // Compute next run
      job.state.nextRunAtMs = this.computeNextRun(job.schedule);

      this.deps.onEvent?.({ type: "run", job, result });

      // Handle one-shot jobs
      if (job.deleteAfterRun) {
        const idx = this.jobs.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          this.jobs.splice(idx, 1);
        }
        this.cancelJobTimer(job.id);
      } else if (this.running && job.enabled) {
        this.scheduleJob(job);
      }

      await this.save();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      job.state.lastRunAtMs = startMs;
      job.state.lastDurationMs = Date.now() - startMs;
      job.state.lastStatus = "error";
      job.state.lastError = message;
      job.state.runningAtMs = undefined;
      job.state.nextRunAtMs = this.computeNextRun(job.schedule);

      this.deps.onEvent?.({ type: "error", job, error: message });

      if (this.running && job.enabled) {
        this.scheduleJob(job);
      }

      await this.save();
      throw err;
    }
  }

  private computeNextRun(schedule: CronSchedule): number {
    const now = Date.now();

    switch (schedule.kind) {
      case "at":
        return schedule.atMs > now ? schedule.atMs : now + 1000;

      case "every": {
        const anchor = schedule.anchorMs ?? now;
        const elapsed = now - anchor;
        const periods = Math.floor(elapsed / schedule.everyMs);
        return anchor + (periods + 1) * schedule.everyMs;
      }

      case "cron":
        // Simple cron parsing - for production, use a library like cron-parser
        return this.parseNextCron(schedule.expr, schedule.tz);
    }
  }

  private parseNextCron(expr: string, tz?: string): number {
    try {
      const interval = cronParser.parseExpression(expr, {
        currentDate: new Date(),
        tz: tz || undefined,
      });
      return interval.next().getTime();
    } catch {
      // Fallback: 1 minute if expression is invalid
      return Date.now() + 60_000;
    }
  }

  private scheduleAllJobs(): void {
    for (const job of this.jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }
  }

  private scheduleJob(job: CronJob): void {
    this.cancelJobTimer(job.id);

    const nextRun = job.state.nextRunAtMs ?? this.computeNextRun(job.schedule);
    const delay = Math.max(0, nextRun - Date.now());

    const timer = setTimeout(() => {
      this.timers.delete(job.id);
      void this.run(job.id, "force").catch((err) => {
        console.error(`Cron job ${job.id} failed:`, err);
      });
    }, delay);

    timer.unref?.();
    this.timers.set(job.id, { jobId: job.id, timer });
  }

  private cancelJobTimer(jobId: string): void {
    const existing = this.timers.get(jobId);
    if (existing) {
      clearTimeout(existing.timer);
      this.timers.delete(jobId);
    }
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.deps.storePath, "utf-8");
      const data = JSON.parse(content) as { version: number; jobs: CronJob[] };
      this.jobs = data.jobs ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      this.jobs = [];
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.deps.storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.deps.storePath,
      JSON.stringify({ version: 1, jobs: this.jobs }, null, 2),
      "utf-8"
    );
  }

  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(fn, fn);
    this.opChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
