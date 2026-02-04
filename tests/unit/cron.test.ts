import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CronService } from "../../src/cron/service.js";
import type { CronJob } from "../../src/cron/types.js";

describe("CronService", () => {
  let tempDir: string;
  let storePath: string;
  let service: CronService;
  let executedJobs: Array<{ id: string; payload: CronJob["payload"] }>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-cron-"));
    storePath = path.join(tempDir, "cron.json");
    executedJobs = [];

    service = new CronService({
      storePath,
      executeJob: async (job) => {
        executedJobs.push({ id: job.id, payload: job.payload });
        return "executed";
      },
    });
  });

  afterEach(async () => {
    service.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("job management", () => {
    it("adds a job", async () => {
      await service.start();

      const job = await service.add({
        name: "Test Job",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "Hello" },
      });

      expect(job.id).toBeDefined();
      expect(job.name).toBe("Test Job");
      expect(job.enabled).toBe(true);
      expect(job.state.nextRunAtMs).toBeDefined();
    });

    it("lists jobs", async () => {
      await service.start();

      await service.add({
        name: "Job 1",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "1" },
      });

      await service.add({
        name: "Job 2",
        enabled: false,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "2" },
      });

      const enabledOnly = await service.list();
      expect(enabledOnly).toHaveLength(1);

      const all = await service.list({ includeDisabled: true });
      expect(all).toHaveLength(2);
    });

    it("updates a job", async () => {
      await service.start();

      const job = await service.add({
        name: "Original",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      const updated = await service.update(job.id, { name: "Updated" });

      expect(updated?.name).toBe("Updated");
      expect(updated?.updatedAtMs).toBeGreaterThanOrEqual(job.createdAtMs);
    });

    it("removes a job", async () => {
      await service.start();

      const job = await service.add({
        name: "To Remove",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      const removed = await service.remove(job.id);
      expect(removed).toBe(true);

      const jobs = await service.list({ includeDisabled: true });
      expect(jobs).toHaveLength(0);
    });

    it("returns false when removing non-existent job", async () => {
      await service.start();

      const removed = await service.remove("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("schedule types", () => {
    it("handles 'at' schedule (one-shot)", async () => {
      await service.start();

      const futureTime = Date.now() + 100;
      const job = await service.add({
        name: "One-shot",
        enabled: true,
        schedule: { kind: "at", atMs: futureTime },
        payload: { kind: "systemEvent", text: "once" },
      });

      expect(job.state.nextRunAtMs).toBeGreaterThanOrEqual(futureTime);
    });

    it("handles 'every' schedule (recurring)", async () => {
      await service.start();

      const job = await service.add({
        name: "Recurring",
        enabled: true,
        schedule: { kind: "every", everyMs: 1000 },
        payload: { kind: "systemEvent", text: "repeat" },
      });

      expect(job.state.nextRunAtMs).toBeDefined();
      expect(job.state.nextRunAtMs! - Date.now()).toBeLessThanOrEqual(1000);
    });

    it("handles 'cron' schedule", async () => {
      await service.start();

      const job = await service.add({
        name: "Cron",
        enabled: true,
        schedule: { kind: "cron", expr: "*/5 * * * *" }, // Every 5 minutes
        payload: { kind: "systemEvent", text: "cron" },
      });

      expect(job.state.nextRunAtMs).toBeDefined();
      // Next run should be within 5 minutes
      expect(job.state.nextRunAtMs! - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it("handles invalid cron expression gracefully", async () => {
      await service.start();

      const job = await service.add({
        name: "Invalid Cron",
        enabled: true,
        schedule: { kind: "cron", expr: "invalid" },
        payload: { kind: "systemEvent", text: "test" },
      });

      // Should fall back to 1 minute
      expect(job.state.nextRunAtMs).toBeDefined();
    });
  });

  describe("job execution", () => {
    it("runs a job manually", async () => {
      await service.start();

      const job = await service.add({
        name: "Manual",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "manual run" },
      });

      const result = await service.run(job.id, "force");

      expect(result).toBe("executed");
      expect(executedJobs).toHaveLength(1);
      expect(executedJobs[0].id).toBe(job.id);
    });

    it("skips job when not due in 'due' mode", async () => {
      await service.start();

      const job = await service.add({
        name: "Not Due",
        enabled: true,
        schedule: { kind: "at", atMs: Date.now() + 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      const result = await service.run(job.id, "due");

      expect(result).toBeUndefined();
      expect(executedJobs).toHaveLength(0);
    });

    it("throws when running non-existent job", async () => {
      await service.start();

      await expect(service.run("non-existent")).rejects.toThrow("Job not found");
    });

    it("handles deleteAfterRun jobs", async () => {
      await service.start();

      const job = await service.add({
        name: "One-time",
        enabled: true,
        deleteAfterRun: true,
        schedule: { kind: "at", atMs: Date.now() - 1000 }, // Already due
        payload: { kind: "systemEvent", text: "once" },
      });

      await service.run(job.id, "force");

      const jobs = await service.list({ includeDisabled: true });
      expect(jobs.find((j) => j.id === job.id)).toBeUndefined();
    });
  });

  describe("persistence", () => {
    it("persists jobs to file", async () => {
      await service.start();

      await service.add({
        name: "Persistent",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      service.stop();

      // Create new service with same store
      const service2 = new CronService({
        storePath,
        executeJob: async () => "ok",
      });
      await service2.start();

      const jobs = await service2.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe("Persistent");

      service2.stop();
    });

    it("handles missing store file", async () => {
      const service2 = new CronService({
        storePath: path.join(tempDir, "nonexistent.json"),
        executeJob: async () => "ok",
      });

      await service2.start();
      const jobs = await service2.list();
      expect(jobs).toHaveLength(0);

      service2.stop();
    });
  });

  describe("events", () => {
    it("emits events on job run", async () => {
      const events: Array<{ type: string; jobId: string }> = [];

      const service2 = new CronService({
        storePath,
        executeJob: async () => "ok",
        onEvent: (event) => {
          events.push({ type: event.type, jobId: event.job.id });
        },
      });
      await service2.start();

      const job = await service2.add({
        name: "Event Test",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      await service2.run(job.id, "force");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("run");
      expect(events[0].jobId).toBe(job.id);

      service2.stop();
    });

    it("emits error events on failure", async () => {
      const events: Array<{ type: string; error?: string }> = [];

      const service2 = new CronService({
        storePath,
        executeJob: async () => {
          throw new Error("Execution failed");
        },
        onEvent: (event) => {
          events.push({ type: event.type, error: event.error });
        },
      });
      await service2.start();

      const job = await service2.add({
        name: "Failing Job",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "systemEvent", text: "test" },
      });

      await expect(service2.run(job.id, "force")).rejects.toThrow();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(events[0].error).toContain("Execution failed");

      service2.stop();
    });
  });
});
