#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
BROWSER="$(command -v chromium || command -v google-chrome || command -v chromium-browser || true)"
if [ -z "$BROWSER" ]; then echo "No Chromium/Chrome browser found" >&2; exit 1; fi
cd "$ROOT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/knok-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -rf /tmp/knok-chrome-*' EXIT
sleep .5
PAYLOAD=$(node --input-type=module - <<'NODE'
import {encodePayload} from './src/core.mjs';
const s=[['02','01:00','08:00'],['03','01:00','04:00'],['04','01:00','04:00'],['06','11:00','13:00'],['08','22:00','00:00'],['09','22:00','00:00'],['10','22:00','00:00'],['11','01:00','04:00'],['12','01:00','04:00'],['13','21:00','00:00'],['16','01:00','04:00'],['17','01:00','04:00'],['19','01:00','04:00'],['20','00:00','03:00'],['21','01:00','04:00'],['29','01:00','03:00'],['29','22:00','00:00'],['30','22:00','00:00']].map(([d,start,end])=>({date:`2026-09-${d}`,start,end}));
console.log(encodePayload(s,'smoke',{month:'2026-09',cellCount:30,eventNodeCount:18,parsedEventNodeCount:18,unparsedEventNodeCount:0,healthy:true}));
NODE
)
PROFILE=$(mktemp -d /tmp/knok-chrome-main-XXXX)
DOM=$($BROWSER --headless=new --no-sandbox --disable-gpu --user-data-dir="$PROFILE" --virtual-time-budget=2500 --dump-dom "http://127.0.0.1:$PORT/#knok=$PAYLOAD" 2>/dev/null)
grep -q '18 turnos' <<<"$DOM"
grep -q '647' <<<"$DOM"
PROFILE2=$(mktemp -d /tmp/knok-chrome-mock-XXXX)
MOCK=$($BROWSER --headless=new --no-sandbox --disable-gpu --user-data-dir="$PROFILE2" --virtual-time-budget=2000 --dump-dom "http://127.0.0.1:$PORT/tests/mock-knok.html" 2>/dev/null)
grep -q 'Sincronizar · 18' <<<"$MOCK"
echo 'browser smoke: ok'
