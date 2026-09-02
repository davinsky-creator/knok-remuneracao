#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-8765}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/knok-http-smoke.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/" >/tmp/knok-index.html; then break; fi
  sleep 0.1
done
grep -q 'Dashboard v2.1' /tmp/knok-index.html
for path in styles.css src/app.js src/core.mjs manifest.webmanifest sw.js extension/manifest.json extension/content.js knok-remuneracao-extension.zip; do
  curl -fsS "http://127.0.0.1:$PORT/$path" >/dev/null
done
echo 'http smoke: ok'
