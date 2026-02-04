/**
 * Local backend for tinycrab SDK.
 * Each agent runs as a separate HTTP server process.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  Agent,
  AgentInfo,
  AgentOptions,
  Backend,
  TinycrabOptions,
} from "./types.js";
import { LocalAgent } from "./local-agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface AgentRecord {
  info: AgentInfo;
  agent: LocalAgent;
  process?: ChildProcess;
}

export class LocalBackend implements Backend {
  private agents = new Map<string, AgentRecord>();
  private dataDir: string;
  private provider: string;
  private model: string;
  private apiKey: string | undefined;
  private nextPort = 9000; // Starting port for agent servers
  private portLock: Promise<void> = Promise.resolve(); // Serialize port allocation

  constructor(options: TinycrabOptions) {
    this.dataDir = path.resolve(options.dataDir || "./.tinycrab");
    this.provider = options.provider || "openai";
    this.model = options.model || "gpt-4o";
    this.apiKey = options.apiKey;
  }

  async init(): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(path.join(this.dataDir, "agents"), { recursive: true });

    // Load existing agents from disk
    await this.loadExistingAgents();
  }

  private async loadExistingAgents(): Promise<void> {
    const agentsDir = path.join(this.dataDir, "agents");

    try {
      const entries = await fs.readdir(agentsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agentId = entry.name;
          const metaPath = path.join(agentsDir, agentId, "meta.json");

          try {
            const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
            const agentDir = path.join(agentsDir, agentId);

            // Check if server is still running (pid file exists and process alive)
            const pidFile = path.join(agentDir, "server.pid");
            let isRunning = false;
            let pid: number | undefined;
            let port: number | undefined;

            try {
              const pidStr = await fs.readFile(pidFile, "utf-8");
              pid = parseInt(pidStr, 10);
              port = meta.port;

              // Check if process is alive
              process.kill(pid, 0);
              isRunning = true;

              // Verify server is responding
              try {
                const response = await fetch(
                  `http://127.0.0.1:${port}/health`
                );
                if (!response.ok) {
                  isRunning = false;
                }
              } catch {
                isRunning = false;
              }
            } catch {
              // No PID file or process not alive
              await fs.unlink(pidFile).catch(() => {});
            }

            const info: AgentInfo = {
              id: agentId,
              status: isRunning ? "running" : "stopped",
              workspace: path.join(agentDir, "workspace"),
              sessionDir: path.join(agentDir, "sessions"),
              memoryDir: path.join(agentDir, "memory"),
              createdAt: meta.createdAt,
              port: isRunning ? port : undefined,
              pid: isRunning ? pid : undefined,
            };

            // Track port if running
            if (isRunning && port) {
              this.nextPort = Math.max(this.nextPort, port + 1);
            }

            const agent = new LocalAgent(agentId, info);
            this.agents.set(agentId, { info, agent });
          } catch {
            // Skip agents without valid metadata
          }
        }
      }
    } catch {
      // No agents directory yet
    }
  }

  private async findAvailablePort(): Promise<number> {
    // Serialize port allocation to prevent race conditions in parallel spawns
    return new Promise((resolve, reject) => {
      this.portLock = this.portLock.then(async () => {
        // Find an available port by checking if it's in use
        while (true) {
          const port = this.nextPort++;
          const isInUse = await this.isPortInUse(port);
          if (!isInUse) {
            resolve(port);
            return;
          }
          // Safety: don't scan forever
          if (this.nextPort > 65535) {
            reject(new Error("No available ports found"));
            return;
          }
        }
      });
    });
  }

  private async isPortInUse(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(500),
      });
      return response.ok; // Port is in use if we get a response
    } catch {
      return false; // Port is free (connection refused or timeout)
    }
  }

  private async startAgentServer(
    agentId: string,
    port: number
  ): Promise<ChildProcess> {
    // Find the agent-server script
    // In development: src/sdk/agent-server.ts via tsx
    // In production: dist/sdk/agent-server.js via node
    const isDev = __dirname.includes("/src/");
    const serverScript = isDev
      ? path.join(__dirname, "agent-server.ts")
      : path.join(__dirname, "agent-server.js");

    const args = [
      "--id",
      agentId,
      "--port",
      String(port),
      "--data-dir",
      this.dataDir,
      "--provider",
      this.provider,
      "--model",
      this.model,
    ];

    const command = isDev ? "npx" : "node";
    const fullArgs = isDev ? ["tsx", serverScript, ...args] : [serverScript, ...args];

    // Use pipe for stdin to pass API key securely
    // This is more secure than env vars (not visible via `env` command)
    // or command line args (not visible in `ps aux`)
    // Use 'ignore' for stdout, 'inherit' for stderr to see errors
    const child = spawn(command, fullArgs, {
      stdio: ["pipe", "ignore", "inherit"],
      detached: true,
    });

    // Pass API key via stdin (secure: only in process memory)
    if (this.apiKey && child.stdin) {
      child.stdin.write(this.apiKey + "\n");
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    // Don't let parent wait for child
    child.unref();

    // Wait for server to be ready
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) {
          return child;
        }
      } catch {
        // Server not ready yet
      }
    }

    // Server didn't start in time
    child.kill();
    throw new Error(`Agent server failed to start within timeout`);
  }

  async spawn(id: string, _options?: AgentOptions): Promise<Agent> {
    // Check if agent already exists and is running
    const existing = this.agents.get(id);
    if (existing && existing.info.status === "running") {
      return existing.agent;
    }

    // Get or create port
    const port = existing?.info.port || (await this.findAvailablePort());

    // Create agent directories if new
    const agentDir = path.join(this.dataDir, "agents", id);
    const workspace = path.join(agentDir, "workspace");
    const sessionDir = path.join(agentDir, "sessions");
    const memoryDir = path.join(agentDir, "memory");

    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(memoryDir, { recursive: true });

    // Start the server process
    const child = await this.startAgentServer(id, port);

    const info: AgentInfo = {
      id,
      status: "running",
      workspace,
      sessionDir,
      memoryDir,
      createdAt: existing?.info.createdAt || Date.now(),
      port,
      pid: child.pid,
    };

    // Save metadata
    await fs.writeFile(
      path.join(agentDir, "meta.json"),
      JSON.stringify({ createdAt: info.createdAt, port }, null, 2)
    );

    const agent = new LocalAgent(id, info);
    this.agents.set(id, { info, agent, process: child });

    return agent;
  }

  async get(id: string): Promise<Agent | null> {
    const record = this.agents.get(id);
    return record?.agent || null;
  }

  async list(): Promise<AgentInfo[]> {
    // Refresh status before returning
    const infos: AgentInfo[] = [];

    for (const [id, record] of this.agents) {
      const info = { ...record.info };

      // Check if still running
      if (info.status === "running" && info.port) {
        try {
          const response = await fetch(`http://127.0.0.1:${info.port}/health`);
          if (!response.ok) {
            info.status = "stopped";
            info.port = undefined;
            info.pid = undefined;
          }
        } catch {
          info.status = "stopped";
          info.port = undefined;
          info.pid = undefined;
        }
      }

      record.info = info;
      infos.push(info);
    }

    return infos;
  }

  async close(): Promise<void> {
    // Stop all running agent servers to free up ports
    const stopPromises: Promise<void>[] = [];
    for (const [_id, record] of this.agents) {
      if (record.info.status === "running" && record.info.port) {
        stopPromises.push(
          fetch(`http://127.0.0.1:${record.info.port}/stop`, { method: "POST" })
            .then(() => {})
            .catch(() => {}) // Ignore errors - server might already be stopped
        );
      }
    }
    await Promise.all(stopPromises);

    // Give servers time to shut down and release ports
    if (stopPromises.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    this.agents.clear();
  }
}
