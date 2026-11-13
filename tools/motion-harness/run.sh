#!/usr/bin/env bash
# Synthetic-webcam motion harness — proves hit detection and the motion
# buttons work without a real camera. Feeds a generated Y4M video to headless
# Chrome's fake camera and reads hit / motion counters from the live modules
# over the DevTools protocol.
#
#   tools/motion-harness/run.sh sweep [seconds]   # hand sweeps through the enemies' path; Space starts
#   tools/motion-harness/run.sh wave  [seconds]   # hand waves over START; no keypress at all
#
# Requires: python3 + numpy, google-chrome (or CHROME=<path>), node >= 22.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MODE=${1:-sweep}; SECS=${2:-55}; PORT=${PORT:-9333}; DEV=${DEV_PORT:-5173}
CHROME=${CHROME:-google-chrome}
OUT="$HERE/out"; mkdir -p "$OUT"

[ -f "$OUT/$MODE.y4m" ] || python3 -I "$HERE/make_y4m.py" "$MODE" "$OUT/$MODE.y4m"

(cd "$ROOT" && npx vite --port "$DEV" --strictPort --host 127.0.0.1 --logLevel silent) & VITE=$!
CHROME_PID=
# Close everything this script started (Vite, Chrome and their children) on
# success, failure and signals. The pkill is a last resort scoped to this run's
# own browser profile directory.
kill_tree() {
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  trap - EXIT
  [ -n "${CHROME_PID:-}" ] && kill_tree "$CHROME_PID"
  kill_tree "$VITE"
  pkill -f -- "--user-data-dir=$OUT/profile-$MODE" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
until curl -sf -o /dev/null "http://127.0.0.1:$DEV/kiro-exorcise-game/"; do sleep 0.3; done

rm -rf "$OUT/profile-$MODE"; mkdir -p "$OUT/profile-$MODE"
"$CHROME" --headless=new --user-data-dir="$OUT/profile-$MODE" --no-first-run \
  --no-default-browser-check --disable-gpu --window-size=1280,720 \
  --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1" \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --use-file-for-fake-video-capture="$OUT/$MODE.y4m" \
  --autoplay-policy=no-user-gesture-required --remote-debugging-port="$PORT" \
  "http://127.0.0.1:$DEV/kiro-exorcise-game/" > "$OUT/chrome-$MODE.log" 2>&1 & CHROME_PID=$!

START=space; [ "$MODE" = wave ] && START=wave
node "$HERE/drive.mjs" "$PORT" $((SECS * 1000)) "$START"
