// Mock implementation of @mariozechner/pi-coding-agent
// This file provides types and mock implementations for development/testing

export interface Tool {
  name: string;
  description: string;
  execute: (args: unknown) => Promise<unknown>;
}

export interface AgentSession {
  prompt(message: string): Promise<void>;
  getLastAssistantText(): string | null;
}

export interface AgentSessionConfig {
  model?: unknown;
  tools?: Tool[];
  cwd?: string;
  agentDir?: string;
}

export const codingTools: Tool[] = [
  { name: "read", description: "Read a file", execute: async () => "" },
  { name: "bash", description: "Execute bash command", execute: async () => "" },
  { name: "edit", description: "Edit a file", execute: async () => "" },
  { name: "write", description: "Write a file", execute: async () => "" },
  { name: "grep", description: "Search file contents", execute: async () => "" },
  { name: "find", description: "Find files", execute: async () => [] },
  { name: "ls", description: "List directory", execute: async () => [] },
];

export async function createAgentSession(
  config: AgentSessionConfig
): Promise<{ session: AgentSession }> {
  let lastAssistantText: string | null = null;

  const session: AgentSession = {
    async prompt(message: string): Promise<void> {
      // Mock implementation - in real usage, this calls the LLM
      lastAssistantText = `Mock response to: ${message}`;
    },
    getLastAssistantText(): string | null {
      return lastAssistantText;
    },
  };

  return { session };
}
