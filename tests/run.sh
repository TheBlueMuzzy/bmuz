#!/usr/bin/env bash
# Headless test run: tests/run.sh "<prompt>" [extra claude args...]
# Runs in project/ with the plugin loaded for this session only, with the unattended-run settings.
# No hint to Claude about what to answer: a -p session is an auto run, so the engine alone keeps it from asking.
cd "$(dirname "$0")/../project" || exit 1
P="$1"; shift
MSYS_NO_PATHCONV=1 timeout 600 claude -p "$P" --plugin-dir ../plugin --model haiku \
  --settings ../plugin/settings/auto-run.json \
  --allowedTools "Workflow Write Read Glob Grep mcp__bmuz__step_done" \
  "$@" < /dev/null 2>&1
echo "[exit $?]"
