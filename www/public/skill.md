# tinycrab

Spawn AI agents fast. For testing, prototyping, or when you just need an agent running now.

## Install

```bash
npm install -g tinycrab
```

Or as a dependency:

```bash
npm install tinycrab
```

## Usage

### CLI

```bash
# 1. Set API key
export OPENAI_API_KEY=sk-xxx

# 2. Spawn an agent (this starts an HTTP server for this agent)
tinycrab spawn worker

# 3. Chat with it
tinycrab chat worker "Create a Python script that reads CSV files"

# 4. Continue the conversation (use session ID from previous response)
tinycrab chat worker "Now add error handling" -s <session-id>

# 5. Clean up when done
tinycrab cleanup worker
```

### SDK

```typescript
import { Tinycrab } from 'tinycrab';

const tc = new Tinycrab({
  apiKey: process.env.OPENAI_API_KEY,
});

// Spawn agent
const agent = await tc.agent('worker');

// Chat
const result = await agent.chat('Create a Python script');
console.log(result.response);
console.log(result.sessionId); // save this for follow-up

// Continue conversation
await agent.chat('Add error handling', { sessionId: result.sessionId });

// Clean up
await agent.destroy({ cleanup: true });
```

### HTTP API

First, spawn an agent (via CLI or SDK). Then call its HTTP endpoint:

```bash
# Spawn first (this starts HTTP server on a port, e.g., 9000)
tinycrab spawn worker
# Output: Server running on port 9000

# Then call HTTP
curl -X POST http://localhost:9000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Response: {"response": "...", "session_id": "abc123"}
```

Or run standalone with Docker:

```bash
docker run -p 8080:8080 -e OPENAI_API_KEY=sk-xxx ghcr.io/jt-wang/tinycrab
```

## What Agents Can Do

Each agent has these tools (from pi-mono):

| Tool | Description |
|------|-------------|
| `bash` | Run shell commands |
| `read` | Read files |
| `write` | Create/overwrite files |
| `edit` | Edit existing files |
| `grep` | Search file contents |
| `find` | Find files |
| `ls` | List directories |

Plus tinycrab-specific:
- `remember` / `recall` - Persistent memory across sessions

## CLI Commands

| Command | Description |
|---------|-------------|
| `tinycrab spawn <name>` | Create agent, start its HTTP server |
| `tinycrab chat <name> "msg"` | Send message |
| `tinycrab chat <name> "msg" -s <id>` | Continue session |
| `tinycrab chat <name> -i` | Interactive mode |
| `tinycrab list` | List agents |
| `tinycrab stop <name>` | Stop (keep files) |
| `tinycrab cleanup <name>` | Delete agent and files |

## API Reference

### POST /chat

```json
// Request
{"message": "your message", "session_id": "optional"}

// Response
{"response": "agent response", "session_id": "abc123"}
```

### GET /health

Returns `{"status": "ok"}`

## LLM Providers

Set via environment variable:

| Provider | Env Var |
|----------|---------|
| OpenAI (default) | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| XAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |

## Links

- GitHub: https://github.com/jt-wang/tinycrab
- Docs: https://tinycrab.dev/docs
