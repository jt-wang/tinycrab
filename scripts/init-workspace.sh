#!/bin/bash
# Initialize tinycrab workspace with memory system

WORKSPACE="${1:-$(pwd)}"

echo "Initializing tinycrab workspace at: $WORKSPACE"

# Create memory directory
mkdir -p "$WORKSPACE/memory"

# Copy AGENTS.md template if it doesn't exist
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../AGENTS.md.template"

if [ ! -f "$WORKSPACE/AGENTS.md" ]; then
  if [ -f "$TEMPLATE" ]; then
    cp "$TEMPLATE" "$WORKSPACE/AGENTS.md"
    echo "Created AGENTS.md with memory instructions"
  fi
fi

# Create empty MEMORY.md if it doesn't exist
if [ ! -f "$WORKSPACE/MEMORY.md" ]; then
  echo "# Long-term Memory" > "$WORKSPACE/MEMORY.md"
  echo "" >> "$WORKSPACE/MEMORY.md"
  echo "Store important facts, preferences, and decisions here." >> "$WORKSPACE/MEMORY.md"
  echo "Created MEMORY.md"
fi

echo "Workspace initialized!"
echo ""
echo "Memory files:"
echo "  - MEMORY.md (long-term facts)"
echo "  - memory/*.md (daily logs)"
