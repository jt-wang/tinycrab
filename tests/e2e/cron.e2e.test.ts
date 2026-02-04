/**
 * E2E tests for cron tools with real LLM.
 *
 * Tests the agent's ability to use cron tools for scheduling.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MessageBus } from "../../src/bus.js";
import { SessionManager } from "../../src/session-manager.js";
import { CronService } from "../../src/cron/service.js";
import { createCronTools } from "../../src/tools/cron.js";
import { startHttp } from "../../src/channels/http.js";
import { AuthStorage } from "@mariozechner/pi-coding-agent";

const API_KEY = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
const PROVIDER = process.env.OPENAI_API_KEY ? "openai" : "anthropic";
const MODEL = process.env.OPENAI_API_KEY ? "gpt-4o-mini" : "claude-3-haiku-20240307";

const describeWithKey = API_KEY ? describe : describe.skip;

describeWithKey("Cron Tools E2E (Real LLM)", () => {
  let tempDir: string;
  let bus: MessageBus;
  let sessions: SessionManager;
  let cron: CronService;
  let port: number;
  let baseUrl: string;
  let processLoopRunning = true;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-cron-e2e-"));
    port = 40000 + Math.floor(Math.random() * 10000);
    baseUrl = `http://localhost:${port}`;

    bus = new MessageBus();

    // Create auth storage
    const authStorage = new AuthStorage();
    if (API_KEY) {
      authStorage.setRuntimeApiKey(PROVIDER, API_KEY);
    }

    // Create cron service
    cron = new CronService({
      storePath: path.join(tempDir, "cron.json"),
      executeJob: async (job) => {
        console.log(`[Cron E2E] Job executed: ${job.name}`);
        return "executed";
      },
    });
    await cron.start();

    // Create cron tools
    const cronTools = createCronTools(cron);

    // Create session manager with cron tools
    sessions = new SessionManager(
      {
        provider: PROVIDER,
        model: MODEL,
        workspace: process.cwd(),
        agentDir: path.join(tempDir, "agent"),
        additionalTools: cronTools as any,
        authStorage,
      },
      {
        maxSessions: 10,
        sessionTtlMs: 5 * 60 * 1000,
      }
    );

    // Start HTTP server
    await startHttp(bus, port);

    // Start process loop
    const processLoop = async () => {
      while (processLoopRunning) {
        try {
          const msg = await Promise.race([
            bus.consumeInbound(),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 100)
            ),
          ]);

          if (!msg) continue;

          const text = await sessions.withSession(
            { channel: msg.channel, chatId: msg.chatId },
            async (session) => {
              await session.prompt(msg.content);
              return session.getLastAssistantText() || "";
            }
          );

          await bus.publishOutbound({
            channel: msg.channel,
            chatId: msg.chatId,
            content: text,
          });
        } catch (err) {
          console.error("Process loop error:", err);
        }
      }
    };

    processLoop();
  });

  afterAll(async () => {
    processLoopRunning = false;
    cron.stop();
    await sessions.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should schedule a job via natural language", async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Remind me in 30 minutes to check the oven",
        session_id: `cron-schedule-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    console.log("Schedule response:", data.response);

    // Verify job was created
    const jobs = await cron.list();
    expect(jobs.length).toBeGreaterThan(0);

    const job = jobs.find(j =>
      j.payload.kind === "agentTurn" &&
      j.payload.message.toLowerCase().includes("oven")
    );
    expect(job).toBeDefined();
    expect(job!.deleteAfterRun).toBe(true); // Should be one-shot
  }, 60000);

  it("should list scheduled jobs", async () => {
    // First schedule a job
    await cron.add({
      name: "daily-standup-reminder",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      payload: { kind: "agentTurn", message: "Time for daily standup!" },
    });

    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What reminders do I have scheduled?",
        session_id: `cron-list-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    console.log("List response:", data.response);

    // Agent should show the job in the list
    expect(data.response.toLowerCase()).toMatch(/standup|daily|reminder|scheduled/i);
  }, 60000);

  it("should cancel a job via natural language", async () => {
    // First schedule a job and get its ID
    const job = await cron.add({
      name: "meeting-reminder",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000 },
      payload: { kind: "agentTurn", message: "You have a meeting!" },
    });

    // First ask to list, so the agent knows about the job
    const listResponse = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What scheduled jobs do I have?",
        session_id: `cron-cancel-${Date.now()}`,
      }),
    });
    const listData = (await listResponse.json()) as { response: string };
    console.log("List response:", listData.response);

    // Now ask to cancel the meeting reminder
    const cancelResponse = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Cancel the meeting reminder",
        session_id: `cron-cancel-${Date.now()}`,
      }),
    });

    expect(cancelResponse.status).toBe(200);

    const data = (await cancelResponse.json()) as { response: string };
    console.log("Cancel response:", data.response);

    // Verify job was removed
    const jobs = await cron.list({ includeDisabled: true });
    expect(jobs.find((j) => j.id === job.id)).toBeUndefined();
  }, 90000);

  it("should schedule recurring job via natural language", async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Every hour, remind me to drink water",
        session_id: `cron-recurring-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    console.log("Recurring schedule response:", data.response);

    // Verify recurring job was created
    const jobs = await cron.list();
    const job = jobs.find(j =>
      j.payload.kind === "agentTurn" &&
      j.payload.message.toLowerCase().includes("water")
    );
    expect(job).toBeDefined();
    expect(job!.deleteAfterRun).toBeFalsy(); // Should be recurring, not one-shot
  }, 60000);

  it("should schedule job at specific time via natural language", async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Set a reminder for 9:30 AM tomorrow to call mom",
        session_id: `cron-at-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    console.log("At-time schedule response:", data.response);

    // Verify job was created
    const jobs = await cron.list();
    const job = jobs.find(j =>
      j.payload.kind === "agentTurn" &&
      j.payload.message.toLowerCase().includes("mom")
    );
    expect(job).toBeDefined();
  }, 60000);

  it("should execute scheduled job at the scheduled time", async () => {
    // Track executions and LLM responses
    const executions: Array<{ name: string; message: string; llmResponse: string }> = [];

    // Replace executeJob to actually call the LLM and track what happens
    (cron as any).deps.executeJob = async (job: any) => {
      console.log(`\n[CRON FIRED] Job "${job.name}" at ${new Date().toISOString()}`);
      console.log(`[CRON MESSAGE] "${job.payload.message}"`);

      if (job.payload.kind === "agentTurn") {
        // Actually send to LLM and get response
        const llmResponse = await sessions.withSession(
          { channel: "cron", chatId: job.id },
          async (session) => {
            await session.prompt(job.payload.message);
            return session.getLastAssistantText() || "";
          }
        );

        console.log(`[LLM RESPONSE] "${llmResponse.substring(0, 200)}..."`);

        executions.push({
          name: job.name,
          message: job.payload.message,
          llmResponse,
        });

        return llmResponse;
      }
      return "executed";
    };

    // Schedule a job that asks the LLM to do something specific
    const sessionId = `cron-exec-${Date.now()}`;
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Schedule a reminder in 1 minute. When it fires, the message should be: 'What is 2+2? Answer with just the number.'",
        session_id: sessionId,
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { response: string };
    console.log("Schedule response:", data.response);

    // Verify job was scheduled
    const jobs = await cron.list();
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[jobs.length - 1]; // Get the most recent job
    console.log(`\nJob scheduled: "${job.name}"`);
    console.log(`Next run at: ${new Date(job!.state.nextRunAtMs!).toISOString()}`);
    console.log(`Current time: ${new Date().toISOString()}`);
    console.log(`\nWaiting ~65 seconds for job to execute...\n`);

    // Wait for job to execute (1 minute + 5 second buffer)
    await new Promise(resolve => setTimeout(resolve, 65000));

    // Verify job executed and LLM responded
    console.log(`\n--- EXECUTION SUMMARY ---`);
    console.log(`Jobs executed: ${executions.length}`);
    executions.forEach((e, i) => {
      console.log(`\n[${i + 1}] ${e.name}`);
      console.log(`    Message: ${e.message}`);
      console.log(`    Response: ${e.llmResponse.substring(0, 100)}...`);
    });

    // Find our specific job (the one that asks 2+2)
    const mathExecution = executions.find(e => e.message.includes("2+2"));
    expect(mathExecution).toBeDefined();
    console.log(`\n✓ Found math job execution`);
    console.log(`  Message: ${mathExecution!.message}`);
    console.log(`  Response: ${mathExecution!.llmResponse}`);

    // The LLM should have answered "4"
    expect(mathExecution!.llmResponse).toMatch(/4/);

    // One-shot job should be deleted after execution
    const jobsAfter = await cron.list({ includeDisabled: true });
    const jobStillExists = jobsAfter.find(j => j.id === job.id);
    console.log(`Job auto-deleted: ${!jobStillExists}`);
    expect(jobStillExists).toBeUndefined();

    console.log("\n✓ Full cron flow verified: Schedule → Execute → LLM processes → Auto-delete");
  }, 120000); // 2 minute timeout

});
