import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CronService } from "../../src/cron/service.js";
import {
  createCronTools,
  parseAtTime,
  parseSchedule,
  formatNextRun,
} from "../../src/tools/cron.js";

describe("cron tools", () => {
  let tempDir: string;
  let storePath: string;
  let service: CronService;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-cron-tools-"));
    storePath = path.join(tempDir, "cron.json");

    service = new CronService({
      storePath,
      executeJob: async () => "executed",
    });
    await service.start();

    tools = createCronTools(service);
  });

  afterEach(async () => {
    service.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("helper functions", () => {
    describe("parseAtTime", () => {
      it("parses HH:MM format for future time today", () => {
        const now = new Date();
        now.setHours(10, 0, 0, 0);
        vi.setSystemTime(now);

        const result = parseAtTime("14:30");
        const date = new Date(result);

        expect(date.getHours()).toBe(14);
        expect(date.getMinutes()).toBe(30);

        vi.useRealTimers();
      });

      it("schedules for tomorrow if time has passed", () => {
        const now = new Date();
        now.setHours(15, 0, 0, 0);
        vi.setSystemTime(now);

        const result = parseAtTime("14:30");
        const date = new Date(result);

        // Should be tomorrow
        expect(date.getDate()).toBe(now.getDate() + 1);
        expect(date.getHours()).toBe(14);
        expect(date.getMinutes()).toBe(30);

        vi.useRealTimers();
      });

      it("parses ISO 8601 datetime", () => {
        const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
        const isoString = futureDate.toISOString();

        const result = parseAtTime(isoString);

        expect(result).toBe(Date.parse(isoString));
      });

      it("throws for past ISO 8601 datetime", () => {
        const pastDate = new Date(Date.now() - 3600000);
        const isoString = pastDate.toISOString();

        expect(() => parseAtTime(isoString)).toThrow("in the past");
      });

      it("throws for invalid time format", () => {
        expect(() => parseAtTime("invalid")).toThrow("Invalid time format");
      });

      it("throws for invalid HH:MM values", () => {
        expect(() => parseAtTime("25:00")).toThrow("Invalid time");
        expect(() => parseAtTime("10:60")).toThrow("Invalid time");
      });
    });

    describe("parseSchedule", () => {
      it("parses inMinutes as one-shot", () => {
        const before = Date.now();
        const result = parseSchedule({ name: "test", message: "msg", inMinutes: 30 });
        const after = Date.now();

        expect(result.schedule.kind).toBe("at");
        expect(result.deleteAfterRun).toBe(true);

        const atMs = (result.schedule as { kind: "at"; atMs: number }).atMs;
        expect(atMs).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
        expect(atMs).toBeLessThanOrEqual(after + 30 * 60 * 1000);
      });

      it("parses at as one-shot", () => {
        const now = new Date();
        now.setHours(10, 0, 0, 0);
        vi.setSystemTime(now);

        const result = parseSchedule({ name: "test", message: "msg", at: "14:00" });

        expect(result.schedule.kind).toBe("at");
        expect(result.deleteAfterRun).toBe(true);

        vi.useRealTimers();
      });

      it("parses everyMinutes as recurring", () => {
        const result = parseSchedule({ name: "test", message: "msg", everyMinutes: 60 });

        expect(result.schedule.kind).toBe("every");
        expect(result.deleteAfterRun).toBe(false);

        const schedule = result.schedule as { kind: "every"; everyMs: number };
        expect(schedule.everyMs).toBe(60 * 60 * 1000);
      });

      it("parses cronExpr as recurring", () => {
        const result = parseSchedule({
          name: "test",
          message: "msg",
          cronExpr: "0 9 * * 1-5",
          timezone: "America/New_York",
        });

        expect(result.schedule.kind).toBe("cron");
        expect(result.deleteAfterRun).toBe(false);

        const schedule = result.schedule as { kind: "cron"; expr: string; tz?: string };
        expect(schedule.expr).toBe("0 9 * * 1-5");
        expect(schedule.tz).toBe("America/New_York");
      });

      it("throws when no timing option provided", () => {
        expect(() => parseSchedule({ name: "test", message: "msg" })).toThrow(
          "Must provide one timing option"
        );
      });

      it("throws when multiple timing options provided", () => {
        expect(() =>
          parseSchedule({ name: "test", message: "msg", inMinutes: 30, everyMinutes: 60 })
        ).toThrow("Provide only ONE timing option");
      });
    });

    describe("formatNextRun", () => {
      it("returns 'not scheduled' for undefined", () => {
        expect(formatNextRun(undefined)).toBe("not scheduled");
      });

      it("returns 'overdue' for past time", () => {
        expect(formatNextRun(Date.now() - 1000)).toBe("overdue");
      });

      it("returns 'in < 1 minute' for near future", () => {
        expect(formatNextRun(Date.now() + 30000)).toBe("in < 1 minute");
      });

      it("formats minutes correctly", () => {
        expect(formatNextRun(Date.now() + 5 * 60 * 1000)).toBe("in 5 minutes");
        expect(formatNextRun(Date.now() + 1 * 60 * 1000 + 30000)).toBe("in 1 minute");
      });

      it("formats hours and minutes correctly", () => {
        const result = formatNextRun(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
        expect(result).toBe("in 2h 30m");
      });

      it("formats days correctly", () => {
        const result = formatNextRun(Date.now() + 2 * 24 * 60 * 60 * 1000);
        expect(result).toMatch(/^in 2d \(/);
      });
    });
  });

  describe("cron_schedule tool", () => {
    const scheduleTool = () => tools.find((t) => t.name === "cron_schedule")!;

    it("schedules job with inMinutes", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "reminder",
        message: "Check emails",
        inMinutes: 30,
      });

      expect(result.details.success).toBe(true);
      expect(result.details.jobId).toBeDefined();
      expect(result.content[0].text).toContain("one-shot");
      expect(result.content[0].text).toContain("reminder");

      const jobs = await service.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe("reminder");
      expect(jobs[0].deleteAfterRun).toBe(true);
    });

    it("schedules job with at", async () => {
      const now = new Date();
      now.setHours(10, 0, 0, 0);
      vi.setSystemTime(now);

      const result = await scheduleTool().execute("test-call", {
        name: "morning-standup",
        message: "Time for standup",
        at: "14:00",
      });

      expect(result.details.success).toBe(true);
      expect(result.content[0].text).toContain("one-shot");

      vi.useRealTimers();
    });

    it("schedules recurring job with everyMinutes", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "health-check",
        message: "Run health check",
        everyMinutes: 60,
      });

      expect(result.details.success).toBe(true);
      expect(result.content[0].text).toContain("recurring");

      const jobs = await service.list();
      expect(jobs[0].deleteAfterRun).toBeFalsy();
    });

    it("schedules recurring job with cronExpr", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "daily-summary",
        message: "Generate daily summary",
        cronExpr: "0 17 * * 1-5",
        timezone: "America/New_York",
        description: "Run at 5pm on weekdays",
      });

      expect(result.details.success).toBe(true);
      expect(result.content[0].text).toContain("recurring");

      const jobs = await service.list();
      expect(jobs[0].description).toBe("Run at 5pm on weekdays");
    });

    it("returns error when no timing option provided", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "invalid",
        message: "test",
      });

      expect(result.details.success).toBe(false);
      expect(result.details.error).toContain("Must provide one timing option");
      expect(result.content[0].text).toContain("Failed to schedule");
    });

    it("returns error when multiple timing options provided", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "invalid",
        message: "test",
        inMinutes: 30,
        everyMinutes: 60,
      });

      expect(result.details.success).toBe(false);
      expect(result.details.error).toContain("Provide only ONE timing option");
    });

    it("returns error for invalid at format", async () => {
      const result = await scheduleTool().execute("test-call", {
        name: "invalid",
        message: "test",
        at: "invalid-time",
      });

      expect(result.details.success).toBe(false);
      expect(result.details.error).toContain("Invalid time format");
    });
  });

  describe("cron_list tool", () => {
    const listTool = () => tools.find((t) => t.name === "cron_list")!;
    const scheduleTool = () => tools.find((t) => t.name === "cron_schedule")!;

    it("returns empty list message when no jobs", async () => {
      const result = await listTool().execute("test-call", {});

      expect(result.details.success).toBe(true);
      expect(result.details.count).toBe(0);
      expect(result.content[0].text).toBe("No scheduled jobs.");
    });

    it("lists scheduled jobs", async () => {
      await scheduleTool().execute("call-1", {
        name: "job-1",
        message: "First job",
        inMinutes: 30,
      });

      await scheduleTool().execute("call-2", {
        name: "job-2",
        message: "Second job",
        everyMinutes: 60,
      });

      const result = await listTool().execute("test-call", {});

      expect(result.details.success).toBe(true);
      expect(result.details.count).toBe(2);
      expect(result.content[0].text).toContain("job-1");
      expect(result.content[0].text).toContain("job-2");
      expect(result.content[0].text).toContain("(one-shot)");
    });

    it("includes disabled jobs when requested", async () => {
      await service.add({
        name: "enabled-job",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "agentTurn", message: "test" },
      });

      await service.add({
        name: "disabled-job",
        enabled: false,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "agentTurn", message: "test" },
      });

      const enabledOnly = await listTool().execute("test-call", {});
      expect(enabledOnly.details.count).toBe(1);

      const all = await listTool().execute("test-call", { includeDisabled: true });
      expect(all.details.count).toBe(2);
    });

    it("shows message preview truncated", async () => {
      const longMessage =
        "This is a very long message that should be truncated in the output display because it exceeds fifty characters";

      await scheduleTool().execute("call-1", {
        name: "long-message-job",
        message: longMessage,
        inMinutes: 30,
      });

      const result = await listTool().execute("test-call", {});

      expect(result.content[0].text).toContain("...");
      expect(result.content[0].text).not.toContain(longMessage);
    });
  });

  describe("cron_cancel tool", () => {
    const cancelTool = () => tools.find((t) => t.name === "cron_cancel")!;
    const scheduleTool = () => tools.find((t) => t.name === "cron_schedule")!;

    it("cancels existing job", async () => {
      const scheduled = await scheduleTool().execute("call-1", {
        name: "to-cancel",
        message: "test",
        inMinutes: 30,
      });

      const jobId = scheduled.details.jobId!;

      const result = await cancelTool().execute("test-call", { jobId });

      expect(result.details.success).toBe(true);
      expect(result.details.jobId).toBe(jobId);
      expect(result.content[0].text).toContain("Cancelled");

      const jobs = await service.list({ includeDisabled: true });
      expect(jobs).toHaveLength(0);
    });

    it("returns error for non-existent job", async () => {
      const result = await cancelTool().execute("test-call", { jobId: "non-existent-id" });

      expect(result.details.success).toBe(false);
      expect(result.details.error).toBe("Job not found");
      expect(result.content[0].text).toContain("not found");
    });
  });
});
