#!/usr/bin/env bash
# Headless test run: tests/run.sh "<prompt>" [extra claude args...]
# Runs in project/ with the plugin loaded for this session only.
cd "$(dirname "$0")/../project" || exit 1
P="$1"; shift
MSYS_NO_PATHCONV=1 timeout 600 claude -p "$P" --plugin-dir ../plugin --model haiku \
  --allowedTools "Workflow Write Read Glob Grep mcp__bmuz__step_done" \
  --append-system-prompt "Test harness: the creative is away. They already said their game is called Moon Goat. Never use AskUserQuestion; use that name." \
  "$@" < /dev/null 2>&1
echo "[exit $?]"
