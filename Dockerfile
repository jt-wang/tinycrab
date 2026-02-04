# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:22-slim

# Install git (needed for agent operations) and curl (for healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r tinycrab && useradd -r -g tinycrab tinycrab

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built code from builder
COPY --from=builder /app/dist ./dist/

# Create directories for data persistence and home directory
RUN mkdir -p /app/workspace /app/data /home/tinycrab && \
    chown -R tinycrab:tinycrab /app /home/tinycrab

USER tinycrab

# Environment (supported providers: openai, anthropic, google, groq, cerebras, xai, openrouter, mistral)
ENV HOME=/home/tinycrab
ENV NODE_ENV=production
ENV AGENT_PROVIDER=openai
ENV AGENT_MODEL=gpt-4o
ENV AGENT_WORKSPACE=/app/workspace
ENV AGENT_DATA_DIR=/app/data
ENV AGENT_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js", "http"]
