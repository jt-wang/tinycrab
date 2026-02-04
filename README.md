# tinycrab

Lightweight universal agent - self-hosted or deployed to the cloud.

Built with TypeScript + pi-mono SDK (~200 LOC) by leveraging `@mariozechner/pi-coding-agent`'s complete `createAgentSession()` API.

## One-Click Deploy

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/tinycrab)

After clicking, set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in Railway's Variables tab.

### Fly.io

```bash
# Install flyctl, then:
fly launch --copy-config --name my-tinycrab
fly secrets set OPENAI_API_KEY=sk-xxx
```

Or use the web dashboard after `fly launch` to set secrets.

## CLI Usage

```bash
# Install globally
npm install -g tinycrab

# Set API key
export OPENAI_API_KEY=sk-xxx

# Spawn an agent (starts HTTP server)
tinycrab spawn analyst
# Agent 'analyst' spawned at ./.tinycrab/agents/analyst/
# Server running on port 9000 (pid: 12345)

# Chat with the agent (creates new session)
tinycrab chat analyst "My name is Alice"
# [analyst]: Got it, Alice!
# (session: abc12345)

# Continue same session with -s flag
tinycrab chat analyst "What is my name?" -s abc12345
# [analyst]: Your name is Alice

# Interactive mode (maintains session throughout)
tinycrab chat analyst -i
# Interactive session with 'analyst'
# Session: def67890
# analyst> What's in my workspace?
# [analyst]: Your workspace contains...
# analyst> exit

# List all agents (shows port when running)
tinycrab list
# NAME          STATUS    PORT      WORKSPACE
# analyst       running   9000      ./.tinycrab/agents/analyst/

# Stop an agent (keeps files)
tinycrab stop analyst

# Cleanup (delete agent and files)
tinycrab cleanup analyst

# Cleanup all agents
tinycrab cleanup --all
```

## SDK Usage

Spawn and manage AI agents programmatically:

```typescript
import { Tinycrab } from 'tinycrab';

const tc = new Tinycrab({
  apiKey: process.env.OPENAI_API_KEY,
  dataDir: './my-agents',  // Where agent workspaces live
});

// Spawn an agent (starts HTTP server process)
const agent = await tc.agent('analyst');

// Chat with the agent - each call can be a different session
const result1 = await agent.chat('My name is Alice');
console.log(result1.response);       // "Got it, Alice!"
console.log(result1.sessionId);      // "abc12345" - save this for continuity

// Continue the same conversation using sessionId
const result2 = await agent.chat('What is my name?', { sessionId: result1.sessionId });
console.log(result2.response);       // "Your name is Alice"

// Start a different conversation (new session)
const result3 = await agent.chat('My name is Bob');
console.log(result3.sessionId);      // "xyz98765" - different session

// Agent can read/write files in its workspace using its tools
await agent.chat('List all files in your workspace');
await agent.chat('Read report.txt and summarize it');

// Cleanup when done
await agent.destroy({ cleanup: true });  // Stops server, deletes workspace
```

Each agent runs as an independent HTTP server process:
```
./my-agents/
└── agents/
    ├── analyst/
    │   ├── workspace/           # Agent's working directory
    │   ├── sessions/            # Multiple conversation threads
    │   │   ├── abc12345/        # Alice's conversation
    │   │   └── xyz98765/        # Bob's conversation
    │   ├── memory/              # Shared memory (remember/recall)
    │   ├── meta.json            # Agent metadata (port, createdAt)
    │   └── server.pid           # Process ID of running server
    └── writer/
        └── ...
```

## Features

**What pi-mono provides:**
- Agent loop with tool execution
- Tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`
- Session management + persistence
- Model registry (10+ providers)
- Skills/extensions loading
- Streaming, thinking levels, compaction

**What tinycrab adds:**
- **SDK** for programmatic agent spawning
- Message bus for multi-channel communication
- CLI and HTTP channel adapters
- Docker-first deployment
- Cloud platform support (Fly.io, Railway, Render)

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run in CLI mode
npm run dev cli

# Run in HTTP mode
npm run dev http

# Run both modes
npm run dev both
```

### Docker

```bash
# Build image
npm run docker:build

# Run with API key (OpenAI is the default provider)
docker run -p 8080:8080 -e OPENAI_API_KEY=sk-xxx tinycrab

# Or use docker-compose
OPENAI_API_KEY=sk-xxx docker-compose up

# Use Anthropic instead
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-xxx -e AGENT_PROVIDER=anthropic tinycrab
```

### Cloud Deployment

**Fly.io (recommended):**
```bash
fly launch
fly secrets set ANTHROPIC_API_KEY=sk-xxx
```

**Railway:**
```bash
railway login
railway up
```

**Render:**
Connect your repository and set `ANTHROPIC_API_KEY` in the dashboard.

## API

### Health Check

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

### Chat

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List files in the current directory"}'

# {"response":"...","session_id":"abc12345"}
```

With session persistence:
```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What was my last question?", "session_id": "abc12345"}'
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | API key for OpenAI models (default) |
| `ANTHROPIC_API_KEY` | - | API key for Anthropic models |
| `AGENT_PROVIDER` | `openai` | LLM provider (openai, anthropic, etc.) |
| `AGENT_MODEL` | `gpt-4o` | Model to use |
| `AGENT_PORT` | `8080` | HTTP server port |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  CLI Input  │────▶│              │────▶│                 │
└─────────────┘     │  MessageBus  │     │  Agent Session  │
┌─────────────┐     │              │     │  (pi-mono SDK)  │
│ HTTP /chat  │────▶│              │◀────│                 │
└─────────────┘     └──────────────┘     └─────────────────┘
```

- **MessageBus**: Routes messages between channels and the agent
- **CLI Channel**: Terminal REPL interface
- **HTTP Channel**: REST API using Fastify
- **Subagent**: Background task execution

## File Structure

```
tinycrab/
├── src/
│   ├── index.ts          # Main entry point
│   ├── bus.ts            # Message bus
│   ├── subagent.ts       # Background tasks
│   └── channels/
│       ├── cli.ts        # CLI adapter
│       └── http.ts       # HTTP adapter
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── Dockerfile
├── docker-compose.yml
├── fly.toml
└── render.yaml
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Why Docker-First?

The agent requires filesystem access for bash/file tools, which eliminates serverless platforms.

| Platform | Filesystem | Long-running | Verdict |
|----------|------------|--------------|---------|
| Vercel | No | No (60s) | Not supported |
| CloudFlare Workers | No | No (30s) | Not supported |
| AWS Lambda | No | Limited (15min) | Not supported |
| **Docker/Fly.io** | Yes | Yes | Supported |

## Acknowledgements

tinycrab is inspired by these excellent projects:

- **[OpenClaw](https://github.com/openclaw/openclaw)** by Peter Steinberger (MIT) - Multi-platform AI agent with structured memory
- **[nanobot](https://github.com/HKUDS/nanobot)** (MIT) - Lightweight AI agent framework
- **[mini-claw](https://github.com/htlin222/mini-claw)** - Telegram bot for persistent AI conversations
- **[pi-mono](https://github.com/badlogic/pi-mono)** by Mario Zechner - The SDK that powers tinycrab

## License

MIT
