/**
 * Session key utilities for tinycrab.
 *
 * Session keys identify unique conversations:
 * - `cli:main` - Default CLI session
 * - `http:{sessionId}` - HTTP API sessions
 * - `telegram:dm:{userId}` - Telegram DM
 * - `discord:channel:{channelId}` - Discord channel
 */

export type SessionKeyParts = {
  channel: string;
  chatId: string;
  threadId?: string;
};

/**
 * Build a session key from parts.
 * Format: `{channel}:{chatId}` or `{channel}:{chatId}:thread:{threadId}`
 */
export function buildSessionKey(parts: SessionKeyParts): string {
  const base = `${normalize(parts.channel)}:${normalize(parts.chatId)}`;
  if (parts.threadId) {
    return `${base}:thread:${normalize(parts.threadId)}`;
  }
  return base;
}

/**
 * Parse a session key into parts.
 */
export function parseSessionKey(sessionKey: string): SessionKeyParts | null {
  const trimmed = sessionKey.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const threadIdx = trimmed.indexOf(":thread:");
  if (threadIdx > 0) {
    const base = trimmed.slice(0, threadIdx);
    const threadId = trimmed.slice(threadIdx + 8);
    const baseParts = parseBaseKey(base);
    if (!baseParts) {
      return null;
    }
    return { ...baseParts, threadId };
  }

  return parseBaseKey(trimmed);
}

function parseBaseKey(key: string): { channel: string; chatId: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) {
    return null;
  }
  const channel = key.slice(0, idx);
  const chatId = key.slice(idx + 1);
  if (!channel || !chatId) {
    return null;
  }
  return { channel, chatId };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

/**
 * Get the parent session key for a thread.
 * Returns null if not a thread session.
 */
export function getParentSessionKey(sessionKey: string): string | null {
  const idx = sessionKey.indexOf(":thread:");
  if (idx <= 0) {
    return null;
  }
  return sessionKey.slice(0, idx);
}
