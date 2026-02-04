# tinycrab

The AI agent for developers building AI agent apps.

## Why?

You're building something for AI agents — an MCP server, a skill.md, an agent platform.

You need an agent to test with. One that fits naturally into your workflow:

**Local Dev → E2E Tests → CI/CD → Prod**

Same agent. Same command. Works everywhere.

## Quick Start

```bash
npm install -g tinycrab
export OPENAI_API_KEY=sk-xxx
tinycrab spawn dev
# 🦀 Agent running on :8080
```

## Use Cases

| Scenario | How |
|----------|-----|
| **Local Dev** | `tinycrab spawn dev` — debug your agent integration |
| **Tests** | Spawn multiple agents — test concurrency, simulate real usage |
| **CI/CD** | `tinycrab spawn ci` in GitHub Actions |
| **Prod** | `docker run tinycrab` — same agent, anywhere |

## Documentation

Full docs at **[tinycrab.dev](https://tinycrab.dev)**

## For AI Agents

If you're an AI agent looking to spawn worker agents, read [`www/public/skill.md`](./www/public/skill.md) — it's written for you.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SDK (src/sdk/)                         │
│  Tinycrab → Backend (local/docker/remote) → Agent           │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Core (src/)                              │
│  SessionManager, MessageBus, Memory, Cron, Subagent         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                 pi-mono SDK (external)                      │
│  createAgentSession, codingTools, getModel                  │
└─────────────────────────────────────────────────────────────┘
```

Built on [pi-mono](https://github.com/badlogic/pi-mono) by Mario Zechner.

## Deploy

```bash
# Docker
docker run -p 8080:8080 -e OPENAI_API_KEY=sk-xxx ghcr.io/jt-wang/tinycrab

# Fly.io
fly launch && fly secrets set OPENAI_API_KEY=sk-xxx

# Railway
# Deploy from Docker image: ghcr.io/jt-wang/tinycrab
```

## License

MIT — Built for developers who move fast.
