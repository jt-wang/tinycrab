# tinycrab Development Guide

This file helps AI assistants (and developers) understand the tinycrab codebase.

## Project Overview

tinycrab is a lightweight universal AI agent that can be:
- Used programmatically via SDK
- Controlled via CLI
- Deployed as HTTP server (Docker, Fly.io, Railway)

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

## Directory Structure

```
src/
├── sdk/                    # SDK for programmatic usage
│   ├── tinycrab.ts         # Main Tinycrab class
│   ├── local-backend.ts    # Local mode (separate workspaces)
│   ├── local-agent.ts      # Agent implementation
│   └── types.ts            # TypeScript interfaces
├── cli/                    # Command-line interface
│   ├── index.ts            # CLI entry point
│   └── commands.ts         # Command implementations
├── channels/               # Communication channels
│   ├── cli.ts              # CLI REPL
│   └── http.ts             # HTTP/REST API
├── memory/                 # Structured memory system
│   ├── file-provider.ts    # JSONL-based storage
│   └── types.ts            # Memory interfaces
├── tools/                  # Agent tools
│   └── memory.ts           # remember/recall tools
├── cron/                   # Scheduled tasks
├── bus.ts                  # Message routing
├── session-manager.ts      # Session-per-conversation
└── index.ts                # HTTP server entry point

tests/
├── unit/                   # Unit tests (mocked pi-mono)
├── integration/            # Integration tests
├── integration-http/       # HTTP API tests
└── e2e/                    # Real LLM tests (needs API key)
```

## Key Concepts

### SDK Modes

| Mode | Backend | Filesystem | Use Case |
|------|---------|------------|----------|
| `local` | LocalBackend | Separate dirs per agent | Development, scripts |
| `docker` | DockerBackend (TODO) | Isolated containers | Production |
| `remote` | RemoteBackend (TODO) | Server-side | Cloud deployment |

### Agent Lifecycle

```typescript
const tc = new Tinycrab({ apiKey, dataDir: './agents' });

// Spawn creates workspace at: ./agents/agents/{id}/
const agent = await tc.agent('my-agent');

// Chat uses pi-mono session
const response = await agent.chat('Hello');

// Cleanup
await agent.destroy({ cleanup: true }); // Deletes files
```

### Data Directory Structure

```
{dataDir}/
└── agents/
    └── {agent-id}/
        ├── meta.json      # Agent metadata
        ├── workspace/     # Agent's working directory
        ├── sessions/      # Conversation history
        └── memory/        # Structured memory (JSONL)
```

## Testing

```bash
npm test              # Unit + integration (mocked)
npm run test:e2e      # Real LLM (needs OPENAI_API_KEY)
npm run test:e2e:docker  # Docker e2e tests
```

Tests use vitest with path aliases to mock `@mariozechner/pi-coding-agent`.

### Docker E2E Tests

The `tests/e2e/docker.e2e.test.ts` file contains end-to-end tests that verify the Docker deployment works correctly. These tests:
- Build the Docker image
- Run a container with a real API key
- Test the `/health` and `/chat` endpoints
- Clean up containers after tests

Run with: `npm run test:e2e:docker` (requires `OPENAI_API_KEY` env var)

## Common Tasks

### Adding a new backend mode

1. Create `src/sdk/{mode}-backend.ts` implementing `Backend` interface
2. Add case in `Tinycrab.init()` (tinycrab.ts)
3. Add tests in `tests/unit/sdk/`

### Adding a new tool

1. Add tool definition in `src/tools/`
2. Register in `local-backend.ts` via `customTools`
3. Add tests

### Running the HTTP server

```bash
npm run dev http           # Development
npm run start http         # Production
docker-compose up          # Docker
```

## Dependencies

- `@mariozechner/pi-coding-agent` - Agent runtime, tools
- `@mariozechner/pi-ai` - Model providers
- `fastify` - HTTP server
- `cron-parser` - Cron scheduling
