/**
 * Memory types for tinycrab.
 *
 * Universal interface for memory providers (file, SQLite, vector DB, etc.)
 */

export type MemoryEntry = {
  id: string;
  createdAt: number;
  content: string;
  importance: number;
  tags?: string[];
  sessionId?: string;  // If set, memory is private to this session
  source?: string;
  embedding?: number[];  // For vector providers
  metadata?: Record<string, unknown>;  // Extensible
};

export type MemorySearchOptions = {
  query?: string;
  tags?: string[];
  sessionId?: string;  // Filter to specific session (private memories)
  maxResults?: number;
  minScore?: number;
  weights?: {
    recency?: number;
    importance?: number;
    relevance?: number;
  };
};

export type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
  scores: {
    recency: number;
    importance: number;
    relevance: number;
  };
};

export interface MemoryProvider {
  add(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(opts: MemorySearchOptions): Promise<MemorySearchResult[]>;
  get(id: string): Promise<MemoryEntry | null>;
  list(opts?: { limit?: number; offset?: number; tags?: string[] }): Promise<MemoryEntry[]>;
  count(tags?: string[]): Promise<number>;
  close?(): Promise<void>;
}
