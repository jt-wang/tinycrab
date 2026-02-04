/**
 * SDK types for tinycrab.
 */

export type TinycrabMode = 'local' | 'docker' | 'remote';

export interface TinycrabOptions {
  /** API key for LLM provider (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** LLM provider (default: 'openai') */
  provider?: string;
  /** Model to use (default: 'gpt-4o') */
  model?: string;
  /** Mode: 'local' | 'docker' | 'remote' (default: 'local') */
  mode?: TinycrabMode;
  /** Data directory for agent workspaces (default: './.tinycrab') */
  dataDir?: string;
  /** Remote URL (required for 'remote' mode) */
  url?: string;
  /** Docker image (default: 'tinycrab:latest', for 'docker' mode) */
  image?: string;
}

export interface AgentOptions {
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Additional tools to provide */
  tools?: unknown[];
}

export interface SpawnOptions extends AgentOptions {
  /** Prefix for auto-generated agent ID (e.g., "player" → "player-a8f3c9e2...") */
  prefix?: string;
}

export interface AgentInfo {
  /** Agent ID */
  id: string;
  /** Agent status */
  status: 'running' | 'stopped';
  /** Workspace path */
  workspace: string;
  /** Session path */
  sessionDir: string;
  /** Memory path */
  memoryDir: string;
  /** Created timestamp */
  createdAt: number;
  /** Server port (when running) */
  port?: number;
  /** Server process ID (when running) */
  pid?: number;
}

export interface ChatOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Session ID for conversation continuity (auto-generated if not provided) */
  sessionId?: string;
}

export interface DestroyOptions {
  /** Delete workspace files (default: false) */
  cleanup?: boolean;
}

export interface ChatResult {
  /** The agent's response */
  response: string;
  /** Session ID (use this for follow-up messages) */
  sessionId: string;
}

export interface Agent {
  /** Agent ID */
  readonly id: string;
  /** Agent info */
  readonly info: AgentInfo;
  /** Send a message and get response with session info */
  chat(message: string, options?: ChatOptions): Promise<ChatResult>;
  /** Get agent status */
  status(): Promise<AgentInfo>;
  /** Stop the agent (keeps files) */
  stop(): Promise<void>;
  /** Destroy the agent */
  destroy(options?: DestroyOptions): Promise<void>;
}

export interface Backend {
  /** Initialize backend */
  init(): Promise<void>;
  /** Spawn an agent */
  spawn(id: string, options?: AgentOptions): Promise<Agent>;
  /** Get existing agent */
  get(id: string): Promise<Agent | null>;
  /** List all agents */
  list(): Promise<AgentInfo[]>;
  /** Cleanup backend resources */
  close(): Promise<void>;
}
