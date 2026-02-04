/**
 * Session manager for tinycrab.
 *
 * Manages pi-mono sessions per conversation with proper concurrency handling.
 * Each unique session key gets its own AgentSession, allowing true parallel conversations.
 */

import { createAgentSession, codingTools, AuthStorage } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { buildSessionKey, type SessionKeyParts } from "./session-key.js";

// Tool type from pi-agent-core
type Tool = (typeof codingTools)[number];

export type SessionConfig = {
  provider?: string;
  model?: string;
  workspace?: string;
  agentDir?: string;
  /** Additional tools to include (e.g., memory tools) */
  additionalTools?: Tool[];
  /** Shared auth storage for API keys (required for secure key handling) */
  authStorage?: AuthStorage;
};

type ManagedSession = {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  createdAt: number;
  lastAccessedAt: number;
  /** Promise chain for sequential operations on this session */
  opChain: Promise<void>;
};

/**
 * Session manager with per-conversation isolation.
 *
 * Key features:
 * - Session-per-conversation (no shared state between conversations)
 * - Promise chaining for sequential operations within a session
 * - Concurrent operations across different sessions
 * - LRU eviction to prevent memory bloat
 */
export class SessionManager {
  private readonly config: SessionConfig;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pendingCreations = new Map<string, Promise<ManagedSession>>();
  private readonly maxSessions: number;
  private readonly sessionTtlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: SessionConfig = {}, opts?: { maxSessions?: number; sessionTtlMs?: number }) {
    this.config = config;
    this.maxSessions = opts?.maxSessions ?? 100;
    this.sessionTtlMs = opts?.sessionTtlMs ?? 30 * 60 * 1000; // 30 minutes
    this.startCleanup();
  }

  /**
   * Get or create a session for the given key parts.
   */
  async getOrCreate(parts: SessionKeyParts): Promise<ManagedSession["session"]> {
    const key = buildSessionKey(parts);
    return this.getOrCreateByKey(key);
  }

  /**
   * Get or create a session by raw key.
   * Uses pending creations map to prevent race conditions when multiple
   * requests try to create the same session simultaneously.
   */
  async getOrCreateByKey(sessionKey: string): Promise<ManagedSession["session"]> {
    // Check for existing session
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      return existing.session;
    }

    // Check if creation is already in progress
    const pending = this.pendingCreations.get(sessionKey);
    if (pending) {
      const managed = await pending;
      return managed.session;
    }

    // Evict oldest sessions if at capacity
    if (this.sessions.size >= this.maxSessions) {
      this.evictOldest();
    }

    // Create with deduplication
    const creationPromise = this.createManagedSession(sessionKey);
    this.pendingCreations.set(sessionKey, creationPromise);

    try {
      const managed = await creationPromise;
      this.sessions.set(sessionKey, managed);
      return managed.session;
    } finally {
      this.pendingCreations.delete(sessionKey);
    }
  }

  /**
   * Execute an operation on a session with proper sequencing.
   * Operations on the same session are chained; different sessions run concurrently.
   */
  async withSession<T>(
    parts: SessionKeyParts,
    fn: (session: ManagedSession["session"]) => Promise<T>
  ): Promise<T> {
    const key = buildSessionKey(parts);
    return this.withSessionByKey(key, fn);
  }

  /**
   * Execute an operation on a session by raw key.
   */
  async withSessionByKey<T>(
    sessionKey: string,
    fn: (session: ManagedSession["session"]) => Promise<T>
  ): Promise<T> {
    const session = await this.getOrCreateByKey(sessionKey);
    const managed = this.sessions.get(sessionKey)!;

    // Chain this operation after any pending operations
    const result = managed.opChain.then(
      () => fn(session),
      () => fn(session) // Run even if previous op failed
    );

    // Update the chain (resolve to void to prevent memory leaks)
    managed.opChain = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  /**
   * Close a specific session.
   */
  async closeSession(sessionKey: string): Promise<void> {
    const managed = this.sessions.get(sessionKey);
    if (!managed) {
      return;
    }

    // Wait for pending operations
    await managed.opChain;

    // Close the pi-mono session if it has a close method
    if (typeof (managed.session as any).close === "function") {
      await (managed.session as any).close();
    }

    this.sessions.delete(sessionKey);
  }

  /**
   * Close all sessions and stop cleanup.
   */
  async close(): Promise<void> {
    this.stopCleanup();

    const keys = Array.from(this.sessions.keys());
    await Promise.all(keys.map((key) => this.closeSession(key)));
  }

  /**
   * List active session keys.
   */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  private async createManagedSession(sessionKey: string): Promise<ManagedSession> {
    const provider = this.config.provider || process.env.AGENT_PROVIDER || "openai";
    const modelId = this.config.model || process.env.AGENT_MODEL || "gpt-4o";
    // Use type assertion for dynamic provider/model from env vars
    const model = (getModel as any)(provider, modelId);

    const { session } = await createAgentSession({
      model,
      tools: codingTools,
      // Custom tools are registered separately so they appear in the model's tool list
      customTools: this.config.additionalTools as any,
      cwd: this.config.workspace,
      agentDir: this.config.agentDir,
      authStorage: this.config.authStorage,
    });

    return {
      session,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      opChain: Promise.resolve(),
    };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, managed] of this.sessions.entries()) {
      if (managed.lastAccessedAt < oldestTime) {
        oldestTime = managed.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      // Fire-and-forget close
      void this.closeSession(oldestKey);
    }
  }

  private startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - this.sessionTtlMs;

      for (const [key, managed] of this.sessions.entries()) {
        if (managed.lastAccessedAt < cutoff) {
          void this.closeSession(key);
        }
      }
    }, Math.max(60_000, this.sessionTtlMs / 6));

    this.cleanupTimer.unref?.();
  }

  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
