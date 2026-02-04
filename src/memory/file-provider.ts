/**
 * File-based memory provider for tinycrab.
 *
 * Uses append-only JSONL file for storage.
 * Suitable for simple deployments; can be replaced with SQLite/vector DB providers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  MemoryEntry,
  MemoryProvider,
  MemorySearchOptions,
  MemorySearchResult,
} from "./types.js";

const DEFAULT_WEIGHTS = {
  recency: 0.3,
  importance: 0.2,
  relevance: 0.5,
};

export class FileMemoryProvider implements MemoryProvider {
  private readonly filePath: string;
  private cache: MemoryEntry[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async add(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    const full: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    // Chain writes to prevent race conditions
    this.writeQueue = this.writeQueue.then(
      () => this.appendEntry(full),
      () => this.appendEntry(full)
    );
    await this.writeQueue;

    // Invalidate cache
    this.cache = null;

    return full;
  }

  async search(opts: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const entries = await this.loadEntries();
    const weights = {
      recency: opts.weights?.recency ?? DEFAULT_WEIGHTS.recency,
      importance: opts.weights?.importance ?? DEFAULT_WEIGHTS.importance,
      relevance: opts.weights?.relevance ?? DEFAULT_WEIGHTS.relevance,
    };
    const maxResults = opts.maxResults ?? 10;
    const minScore = opts.minScore ?? 0;

    // Filter by session: include global (no sessionId) + matching session
    let filtered = entries;
    if (opts.sessionId) {
      filtered = entries.filter(
        (e) => !e.sessionId || e.sessionId === opts.sessionId
      );
    }

    // Filter by tags if specified
    if (opts.tags && opts.tags.length > 0) {
      const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
      filtered = filtered.filter((e) =>
        e.tags?.some((t) => tagSet.has(t.toLowerCase()))
      );
    }

    // Score each entry
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days for recency decay

    const scored: MemorySearchResult[] = filtered.map((entry) => {
      // Recency: exponential decay
      const age = now - entry.createdAt;
      const recencyScore = Math.exp(-age / maxAge);

      // Importance: direct from entry
      const importanceScore = entry.importance;

      // Relevance: simple keyword matching (can be replaced with embeddings)
      const relevanceScore = opts.query
        ? this.computeRelevance(entry.content, opts.query)
        : 0.5;

      const score =
        weights.recency * recencyScore +
        weights.importance * importanceScore +
        weights.relevance * relevanceScore;

      return {
        entry,
        score,
        scores: {
          recency: recencyScore,
          importance: importanceScore,
          relevance: relevanceScore,
        },
      };
    });

    // Sort by score descending and filter
    return scored
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const entries = await this.loadEntries();
    return entries.find((e) => e.id === id) ?? null;
  }

  async list(opts?: { limit?: number; offset?: number; tags?: string[] }): Promise<MemoryEntry[]> {
    let entries = await this.loadEntries();

    // Filter by tags
    if (opts?.tags && opts.tags.length > 0) {
      const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
      entries = entries.filter((e) =>
        e.tags?.some((t) => tagSet.has(t.toLowerCase()))
      );
    }

    // Sort by creation time descending (most recent first)
    entries = entries.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 100;
    return entries.slice(offset, offset + limit);
  }

  async count(tags?: string[]): Promise<number> {
    let entries = await this.loadEntries();

    if (tags && tags.length > 0) {
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));
      entries = entries.filter((e) =>
        e.tags?.some((t) => tagSet.has(t.toLowerCase()))
      );
    }

    return entries.length;
  }

  async close(): Promise<void> {
    // Wait for pending writes
    await this.writeQueue;
    this.cache = null;
  }

  private async loadEntries(): Promise<MemoryEntry[]> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const entries: MemoryEntry[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as MemoryEntry;
          if (entry.id && entry.createdAt && entry.content !== undefined) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }

      this.cache = entries;
      return entries;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = [];
        return [];
      }
      throw err;
    }
  }

  private async appendEntry(entry: MemoryEntry): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
  }

  private computeRelevance(content: string, query: string): number {
    // Simple keyword matching (can be replaced with embeddings)
    const contentLower = content.toLowerCase();
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (queryTerms.length === 0) {
      return 0.5;
    }

    let matches = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matches++;
      }
    }

    return matches / queryTerms.length;
  }
}
