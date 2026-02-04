import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CronService } from "../../src/cron/service.js";
import { createCronTools } from "../../src/tools/cron.js";

describe("Cron Tools Integration", () => {
  let tempDir: string;
  let storePath: string;
  let service: CronService;
  let tools: ReturnType<typeof createCronTools>;
  let executedJobs: Array<{ id: string; message: string }>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-cron-integration-"));
    storePath = path.join(tempDir, "cron.json");
    executedJobs = [];

    service = new CronService({
      storePath,
      executeJob: async (job) => {
        if (job.payload.kind === "agentTurn") {
          executedJobs.push({ id: job.id, message: job.payload.message });
        }
        return "executed";
      },
    });
    await service.start();

    tools = createCronTools(service);
  });

  afterEach(async () => {
    service.stop();
    vi.useRealTimers();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const scheduleTool = () => tools.find((t) => t.name === "cron_schedule")!;
  const listTool = () => tools.find((t) => t.name === "cron_list")!;
  const cancelTool = () => tools.find((t) => t.name === "cron_cancel")!;

  describe("full workflow: schedule -> list -> cancel", () => {
    it("completes full lifecycle", async () => {
      // Schedule
      const scheduleResult = await scheduleTool().execute("call-1", {
        name: "workflow-test",
        message: "Test message",
        inMinutes: 30,
      });
      expect(scheduleResult.details.success).toBe(true);
      const jobId = scheduleResult.details.jobId!;

      // List
      const listResult = await listTool().execute("call-2", {});
      expect(listResult.details.count).toBe(1);
      expect(listResult.content[0].text).toContain("workflow-test");
      expect(listResult.content[0].text).toContain(jobId);

      // Cancel
      const cancelResult = await cancelTool().execute("call-3", { jobId });
      expect(cancelResult.details.success).toBe(true);

      // Verify cancelled
      const finalList = await listTool().execute("call-4", {});
      expect(finalList.details.count).toBe(0);
    });
  });

  describe("job execution timing", () => {
    it("executes one-shot job at scheduled time", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Schedule job for 5 minutes from now
      await scheduleTool().execute("call-1", {
        name: "timed-job",
        message: "Execute me",
        inMinutes: 5,
      });

      expect(executedJobs).toHaveLength(0);

      // Advance time by 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

      expect(executedJobs).toHaveLength(1);
      expect(executedJobs[0].message).toBe("Execute me");
    });

    it("deletes one-shot job after execution", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const scheduleResult = await scheduleTool().execute("call-1", {
        name: "one-shot",
        message: "Delete me after",
        inMinutes: 1,
      });

      // Job exists before execution
      let jobs = await service.list({ includeDisabled: true });
      expect(jobs).toHaveLength(1);

      // Execute
      await vi.advanceTimersByTimeAsync(60 * 1000 + 100);

      // Job deleted after execution
      jobs = await service.list({ includeDisabled: true });
      expect(jobs).toHaveLength(0);
    });

    it("keeps recurring job after execution", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await scheduleTool().execute("call-1", {
        name: "recurring",
        message: "Keep me around",
        everyMinutes: 5,
      });

      // Execute once
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

      expect(executedJobs).toHaveLength(1);

      // Job still exists
      const jobs = await service.list({ includeDisabled: true });
      expect(jobs).toHaveLength(1);

      // Execute again
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

      expect(executedJobs).toHaveLength(2);
    });
  });

  describe("persistence", () => {
    it("persists scheduled jobs to disk", async () => {
      // Schedule a job
      const scheduleResult = await scheduleTool().execute("call-1", {
        name: "persistent-job",
        message: "I should persist",
        everyMinutes: 60,
      });
      const jobId = scheduleResult.details.jobId!;

      // Stop service and verify file exists
      service.stop();

      const fileContent = await fs.readFile(storePath, "utf-8");
      const data = JSON.parse(fileContent);

      expect(data.jobs).toHaveLength(1);
      expect(data.jobs[0].id).toBe(jobId);
      expect(data.jobs[0].name).toBe("persistent-job");
    });

    it("loads jobs from disk on startup", async () => {
      // Schedule and stop
      await scheduleTool().execute("call-1", {
        name: "to-reload",
        message: "Reload me",
        everyMinutes: 60,
      });
      service.stop();

      // Create new service
      const newService = new CronService({
        storePath,
        executeJob: async () => "ok",
      });
      await newService.start();

      const jobs = await newService.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe("to-reload");

      newService.stop();
    });
  });

  describe("multiple jobs", () => {
    it("manages multiple independent jobs", async () => {
      // Schedule multiple jobs
      const job1 = await scheduleTool().execute("call-1", {
        name: "job-1",
        message: "First",
        inMinutes: 10,
      });
      const job2 = await scheduleTool().execute("call-2", {
        name: "job-2",
        message: "Second",
        everyMinutes: 30,
      });
      const job3 = await scheduleTool().execute("call-3", {
        name: "job-3",
        message: "Third",
        cronExpr: "0 9 * * *",
      });

      // List all
      const listResult = await listTool().execute("call-4", {});
      expect(listResult.details.count).toBe(3);

      // Cancel one
      await cancelTool().execute("call-5", { jobId: job2.details.jobId! });

      // Verify two remain
      const afterCancel = await listTool().execute("call-6", {});
      expect(afterCancel.details.count).toBe(2);
      expect(afterCancel.content[0].text).toContain("job-1");
      expect(afterCancel.content[0].text).not.toContain("job-2");
      expect(afterCancel.content[0].text).toContain("job-3");
    });
  });

  describe("edge cases", () => {
    it("handles very short intervals", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await scheduleTool().execute("call-1", {
        name: "short-interval",
        message: "Quick",
        everyMinutes: 1,
      });

      // First execution at t+1min
      await vi.advanceTimersByTimeAsync(60 * 1000 + 100);
      expect(executedJobs).toHaveLength(1);

      // Job reschedules itself, so we verify it executed at least once
      // (The timing of recurring jobs with fake timers is complex due to rescheduling)
    });

    it("handles job with description", async () => {
      await scheduleTool().execute("call-1", {
        name: "described-job",
        message: "Test",
        description: "This is a detailed description of what the job does",
        inMinutes: 30,
      });

      const jobs = await service.list();
      expect(jobs[0].description).toBe("This is a detailed description of what the job does");
    });
  });
});
