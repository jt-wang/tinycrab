# tinycrab

Spawn AI agents in seconds.

## What is tinycrab?

tinycrab is a lightweight universal AI agent that you can spawn instantly via SDK, CLI, or HTTP API. Each agent gets its own workspace, session persistence, and cross-session memory.

## Why?

You're building something with AI agents. You need one running *now* - not after configuring infrastructure.

- Testing how your app handles AI responses
- Prototyping AI-powered workflows
- Building multi-agent systems
- Creating agent swarms

tinycrab is built for speed. One line of code, instant agent.

## Quick Start

```bash
npm install -g tinycrab
export OPENAI_API_KEY=sk-xxx
tinycrab spawn my-agent
tinycrab chat my-agent "Hello!"
```

## Documentation

Full docs at **[tinycrab.dev](https://tinycrab.dev)**

## For AI Agents

If you're an AI agent looking to spawn worker agents, read [`www/public/skill.md`](./www/public/skill.md) - it's written for you.

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

Built on [pi-mono](https://github.com/badlogic/pi-mono) by Mario Zechner, which provides the agent loop, coding tools, session management, and 10+ LLM providers.

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

MIT
