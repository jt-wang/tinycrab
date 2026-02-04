/**
 * E2E tests for Docker container with real LLM.
 *
 * Prerequisites:
 * - Docker container running: docker compose up -d
 * - API key configured in container via .env
 *
 * Run with: npm run test:e2e -- docker.e2e
 */

import { describe, it, expect, beforeAll } from "vitest";

const DOCKER_URL = process.env.DOCKER_URL || "http://localhost:8080";

async function isDockerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${DOCKER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe("Docker E2E (Real LLM)", () => {
  let dockerAvailable = false;

  beforeAll(async () => {
    dockerAvailable = await isDockerRunning();
    if (!dockerAvailable) {
      console.log(
        "\n⚠️  Docker container not running. Skipping Docker E2E tests."
      );
      console.log("   Start with: docker compose up -d\n");
    }
  });

  it("should have healthy container", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const response = await fetch(`${DOCKER_URL}/health`);
    expect(response.status).toBe(200);

    const data = (await response.json()) as { status: string };
    expect(data.status).toBe("ok");
  });

  it("should handle basic chat", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const response = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is 7 + 8? Reply with just the number.",
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string; session_id: string };
    expect(data.response).toContain("15");
    expect(data.session_id).toBeDefined();
  }, 60000);

  it("should maintain session state", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const sessionId = `docker-session-${Date.now()}`;

    // First message - set a value
    const r1 = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "I am going to tell you a code word. The code word is: MANGO. " +
          "Please confirm by saying 'Code word received: MANGO'",
        session_id: sessionId,
      }),
    });

    expect(r1.status).toBe(200);
    const data1 = (await r1.json()) as { response: string };
    expect(data1.response.toLowerCase()).toContain("mango");

    // Small delay to ensure session is saved
    await new Promise((r) => setTimeout(r, 500));

    // Second message - recall the value
    const r2 = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What was the code word I told you earlier in this conversation?",
        session_id: sessionId,
      }),
    });

    const data2 = (await r2.json()) as { response: string };
    expect(data2.response.toLowerCase()).toContain("mango");
  }, 90000);

  it("should handle concurrent requests", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const requests = [
      fetch(`${DOCKER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Say only the word 'red'",
          session_id: `concurrent-docker-1-${Date.now()}`,
        }),
      }),
      fetch(`${DOCKER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Say only the word 'green'",
          session_id: `concurrent-docker-2-${Date.now()}`,
        }),
      }),
    ];

    const responses = await Promise.all(requests);
    const data = await Promise.all(
      responses.map((r) => r.json() as Promise<{ response: string }>)
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(data[0].response.toLowerCase()).toContain("red");
    expect(data[1].response.toLowerCase()).toContain("green");
  }, 120000);

  it("should handle invalid requests", async ({ skip }) => {
    if (!dockerAvailable) skip();

    // Missing message field
    const response = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBeDefined();
  });

  it("should handle /status command", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const response = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "/status",
        session_id: `status-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    expect(data.response).toMatch(/Sessions|Memory|Cron/i);
  }, 30000);

  it("should schedule cron job via chat", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const response = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "Use cron_schedule to schedule a job named 'docker-test' with message 'hello' in 60 minutes. " +
          "Confirm the job was scheduled.",
        session_id: `cron-docker-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    expect(data.response.toLowerCase()).toMatch(/schedul|job|docker-test/i);
  }, 60000);

  it("should list cron jobs via chat", async ({ skip }) => {
    if (!dockerAvailable) skip();

    const response = await fetch(`${DOCKER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Use cron_list to show all scheduled cron jobs.",
        session_id: `cron-list-docker-${Date.now()}`,
      }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { response: string };
    // Response should mention jobs or indicate none exist
    expect(data.response.toLowerCase()).toMatch(/job|schedul|no|list/i);
  }, 60000);
});
