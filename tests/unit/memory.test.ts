import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileMemoryProvider } from "../../src/memory/file-provider.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("FileMemoryProvider", () => {
  let tempDir: string;
  let provider: FileMemoryProvider;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tinycrab-memory-test-"));
    provider = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
  });

  afterEach(async () => {
    await provider.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should add and retrieve a memory entry", async () => {
    const entry = await provider.add({
      content: "Test memory content",
      importance: 0.8,
      tags: ["test"],
    });

    expect(entry.id).toBeDefined();
    expect(entry.createdAt).toBeDefined();
    expect(entry.content).toBe("Test memory content");
    expect(entry.importance).toBe(0.8);
    expect(entry.tags).toEqual(["test"]);

    const retrieved = await provider.get(entry.id);
    expect(retrieved).toEqual(entry);
  });

  it("should search memories by query", async () => {
    await provider.add({ content: "I love TypeScript", importance: 0.7 });
    await provider.add({ content: "Python is also great", importance: 0.6 });
    await provider.add({ content: "TypeScript and React work well together", importance: 0.8 });

    const results = await provider.search({ query: "TypeScript", maxResults: 10 });

    expect(results.length).toBe(3);
    // TypeScript entries should score higher
    expect(results[0].entry.content).toContain("TypeScript");
  });

  it("should filter by tags", async () => {
    await provider.add({ content: "Work task 1", importance: 0.7, tags: ["work"] });
    await provider.add({ content: "Personal note", importance: 0.6, tags: ["personal"] });
    await provider.add({ content: "Work task 2", importance: 0.8, tags: ["work"] });

    const results = await provider.search({ tags: ["work"] });

    expect(results.length).toBe(2);
    results.forEach((r) => expect(r.entry.tags).toContain("work"));
  });

  it("should persist entries to disk", async () => {
    await provider.add({ content: "Persistent memory", importance: 0.9 });
    await provider.close();

    // Create new provider pointing to same file
    const provider2 = new FileMemoryProvider(path.join(tempDir, "memory.jsonl"));
    const count = await provider2.count();
    expect(count).toBe(1);

    const results = await provider2.search({ query: "Persistent" });
    expect(results.length).toBe(1);
    expect(results[0].entry.content).toBe("Persistent memory");
  });

  it("should list entries with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await provider.add({ content: `Entry ${i}`, importance: 0.5 });
    }

    const page1 = await provider.list({ limit: 2, offset: 0 });
    expect(page1.length).toBe(2);

    const page2 = await provider.list({ limit: 2, offset: 2 });
    expect(page2.length).toBe(2);

    const page3 = await provider.list({ limit: 2, offset: 4 });
    expect(page3.length).toBe(1);
  });

  it("should count entries", async () => {
    expect(await provider.count()).toBe(0);

    await provider.add({ content: "Entry 1", importance: 0.5 });
    await provider.add({ content: "Entry 2", importance: 0.5 });

    expect(await provider.count()).toBe(2);
  });
});
