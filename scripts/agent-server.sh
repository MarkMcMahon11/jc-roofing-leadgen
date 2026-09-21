#!/usr/bin/env bash
# Start an isolated production server for testing: ./scripts/agent-server.sh <port> [extra env, e.g. VERCEL=1]
# Own port, own empty data folder, fake Google-free address data, known admin password. Logs: /tmp/jc-test-<port>.log
set -e
PORT="${1:?usage: agent-server.sh <port>}"; shift || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="/tmp/jc-test-$PORT"
rm -rf "$DIR"; mkdir -p "$DIR"; echo "[]" > "$DIR/leads.json"
cd "$ROOT"
env DATA_DIR="$DIR" PLACES_MOCK=1 ADMIN_PASSWORD=testpw "$@" nohup npx next start -p "$PORT" > "/tmp/jc-test-$PORT.log" 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/api/quote" && { echo "ready http://localhost:$PORT  data=$DIR  admin password=testpw"; exit 0; }; sleep 1; done
echo "server did not start; see /tmp/jc-test-$PORT.log"; exit 1
