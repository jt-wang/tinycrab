/**
 * Local agent implementation.
 * Communicates with the agent's HTTP server.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  Agent,
  AgentInfo,
  ChatOptions,
  ChatResult,
  DestroyOptions,
} from "./types.js";

export class LocalAgent implements Agent {
  private _info: AgentInfo;

  constructor(
    public readonly id: string,
    info: AgentInfo
  ) {
    this._info = info;
  }

  get info(): AgentInfo {
    return this._info;
  }

  private getServerUrl(): string {
    if (!this._info.port) {
      throw new Error(`Agent '${this.id}' is stopped`);
    }
    return `http://127.0.0.1:${this._info.port}`;
  }

  async chat(message: string, options?: ChatOptions): Promise<ChatResult> {
    const url = this.getServerUrl();

    const body: { message: string; session_id?: string } = { message };
    if (options?.sessionId) {
      body.session_id = options.sessionId;
    }

    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json() as { response: string; session_id: string };
    return {
      response: data.response,
      sessionId: data.session_id,
    };
  }

  async status(): Promise<AgentInfo> {
    // Check if server is still running
    if (this._info.port) {
      try {
        const response = await fetch(`http://127.0.0.1:${this._info.port}/health`);
        if (response.ok) {
          return { ...this._info, status: "running" };
        }
      } catch {
        // Server not responding
      }
      this._info = { ...this._info, status: "stopped", port: undefined, pid: undefined };
    }

    return { ...this._info, status: "stopped" };
  }

  async stop(): Promise<void> {
    if (this._info.port) {
      try {
        // Ask server to stop gracefully
        await fetch(`http://127.0.0.1:${this._info.port}/stop`, {
          method: "POST",
        });
      } catch {
        // Server might already be down or killed
      }

      // Also try to kill the process directly
      if (this._info.pid) {
        try {
          process.kill(this._info.pid, "SIGTERM");
        } catch {
          // Process might already be dead
        }
      }
    }

    this._info = { ...this._info, status: "stopped", port: undefined, pid: undefined };
  }

  async destroy(options?: DestroyOptions): Promise<void> {
    await this.stop();

    if (options?.cleanup) {
      // Delete the entire agent directory
      const agentDir = path.dirname(this._info.workspace);
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  }
}
