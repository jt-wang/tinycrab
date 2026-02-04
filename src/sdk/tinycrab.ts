/**
 * Tinycrab SDK - Main entry point.
 *
 * @example
 * ```typescript
 * import { Tinycrab } from '@tinycrab/sdk';
 *
 * const tc = new Tinycrab({ apiKey: process.env.OPENAI_API_KEY });
 *
 * const agent = await tc.agent('my-agent');
 * const response = await agent.chat('Hello!');
 * console.log(response);
 *
 * await agent.destroy({ cleanup: true });
 * ```
 */

import { randomBytes } from "node:crypto";
import type {
  Agent,
  AgentInfo,
  AgentOptions,
  Backend,
  SpawnOptions,
  TinycrabOptions,
} from "./types.js";
import { LocalBackend } from "./local-backend.js";

export class Tinycrab {
  private backend: Backend | null = null;
  private options: TinycrabOptions;
  private initPromise: Promise<void> | null = null;

  constructor(options: TinycrabOptions = {}) {
    this.options = {
      mode: "local",
      dataDir: "./.tinycrab",
      provider: "openai",
      model: "gpt-4o",
      ...options,
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    };
  }

  /**
   * Initialize the backend (called automatically on first use).
   */
  private async ensureInit(): Promise<Backend> {
    if (this.backend) {
      return this.backend;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.backend!;
    }

    this.initPromise = this.init();
    await this.initPromise;
    return this.backend!;
  }

  private async init(): Promise<void> {
    const mode = this.options.mode || "local";

    switch (mode) {
      case "local":
        this.backend = new LocalBackend(this.options);
        break;
      case "docker":
        // TODO: Implement DockerBackend
        throw new Error("Docker mode not yet implemented");
      case "remote":
        // TODO: Implement RemoteBackend
        throw new Error("Remote mode not yet implemented");
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    await this.backend.init();
  }

  /**
   * Spawn a new agent with auto-generated ID.
   *
   * @param options - Spawn options (optional prefix for the ID)
   * @returns The agent instance
   *
   * @example
   * ```typescript
   * // Auto-generated ID: "agent-a8f3c9e2b1d4f5e6"
   * const agent1 = await tc.spawn();
   *
   * // With prefix: "player-a8f3c9e2b1d4f5e6"
   * const agent2 = await tc.spawn({ prefix: "player" });
   *
   * // Spawn many agents
   * const players = await Promise.all(
   *   Array.from({ length: 10 }, () => tc.spawn({ prefix: "player" }))
   * );
   * ```
   */
  async spawn(options?: SpawnOptions): Promise<Agent> {
    const prefix = options?.prefix || "agent";
    const suffix = randomBytes(8).toString("hex");
    const id = `${prefix}-${suffix}`;

    const backend = await this.ensureInit();
    return backend.spawn(id, options);
  }

  /**
   * Get or create an agent by ID.
   *
   * @param id - Unique identifier for the agent
   * @param options - Agent options
   * @returns The agent instance
   *
   * @example
   * ```typescript
   * const agent = await tc.agent('analyst');
   * await agent.chat('Analyze this data...');
   * ```
   */
  async agent(id: string, options?: AgentOptions): Promise<Agent> {
    const backend = await this.ensureInit();
    return backend.spawn(id, options);
  }

  /**
   * Get an existing agent by ID.
   *
   * @param id - Agent ID
   * @returns The agent or null if not found
   */
  async get(id: string): Promise<Agent | null> {
    const backend = await this.ensureInit();
    return backend.get(id);
  }

  /**
   * List all agents.
   *
   * @returns Array of agent info
   */
  async list(): Promise<AgentInfo[]> {
    const backend = await this.ensureInit();
    return backend.list();
  }

  /**
   * Close the SDK and release resources.
   */
  async close(): Promise<void> {
    if (this.backend) {
      await this.backend.close();
      this.backend = null;
    }
    this.initPromise = null;
  }
}
