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

Full documentation at **[tinycrab.dev](https://tinycrab.dev)** (coming soon) or see the [`www/`](./www) directory:

- [Quickstart](./www/src/app/[locale]/docs/quickstart/page.tsx)
- [SDK Reference](./www/src/app/[locale]/docs/sdk/page.tsx)
- [CLI Reference](./www/src/app/[locale]/docs/cli/page.tsx)
- [HTTP API](./www/src/app/[locale]/docs/api/page.tsx)
- [Deployment](./www/src/app/[locale]/docs/deploy/page.tsx)

## For AI Agents

If you're an AI agent looking to spawn worker agents, read [`www/public/skill.md`](./www/public/skill.md) - it's written for you.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  CLI Input  │────▶│              │────▶│                 │
└─────────────┘     │  MessageBus  │     │  Agent Session  │
┌─────────────┐     │              │     │  (pi-mono SDK)  │
│ HTTP /chat  │────▶│              │◀────│                 │
└─────────────┘     └──────────────┘     └─────────────────┘
```

Built on [pi-mono](https://github.com/badlogic/pi-mono) by Mario Zechner, which provides the agent loop, coding tools (bash, read, write, edit, grep, find), session management, and support for 10+ LLM providers.

tinycrab adds:
- SDK for programmatic agent spawning
- CLI for quick testing
- HTTP API for integration
- Docker-first deployment

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
