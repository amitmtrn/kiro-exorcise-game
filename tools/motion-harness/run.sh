#!/usr/bin/env bash
# Synthetic-webcam motion harness — proves hit detection and the motion
# buttons work without a real camera. Feeds a generated Y4M video to headless
# Chrome's fake camera and reads hit / motion counters from the live modules
# over the DevTools protocol.
#
#   tools/motion-harness/run.sh sweep [seconds]   # hand sweeps through the enemies' path; Space starts
#   tools/motion-harness/run.sh wave  [seconds]   # hand waves over START; no keypress at all
#   tools/motion-harness/run.sh demo  [seconds]   # ?demo=1&seed=$SEED (default 7): no camera at all, the
#                                                 # scripted ghost hand plays; reports getUserMedia calls and the card
#
# Requires: python3 + numpy, google-chrome (or CHROME=<path>), node >= 22.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MODE=${1:-sweep}; SECS=${2:-55}; PORT=${PORT:-9333}; DEV=${DEV_PORT:-5173}
CHROME=${CHROME:-google-chrome}
OUT="$HERE/out"; mkdir -p "$OUT"

# A leftover Chrome on the DevTools port would be attached to by drive.mjs: stale metrics.
if curl -sf -o /dev/null "http://127.0.0.1:$PORT/json"; then echo "DevTools port $PORT is already in use; refusing to attach to it (set PORT)" >&2; exit 1; fi

case "$MODE" in sweep|wave|demo) ;; *) echo "mode must be sweep, wave or demo" >&2; exit 1 ;; esac
SEED=${SEED:-7}
case "$SEED" in ''|*[!0-9]*) echo "SEED must be a non-negative integer" >&2; exit 1 ;; esac
# Demo mode needs no video at all: no fake camera, no permission flags (getUserMedia must never be called).
CAMERA_FLAGS=()
if [ "$MODE" != demo ]; then
  [ -f "$OUT/$MODE.y4m" ] || python3 -I "$HERE/make_y4m.py" "$MODE" "$OUT/$MODE.y4m"
  CAMERA_FLAGS=(--use-fake-ui-for-media-stream --use-fake-device-for-media-stream "--use-file-for-fake-video-capture=$OUT/$MODE.y4m")
fi

URL="http://127.0.0.1:$DEV/kiro-exorcise-game/"
# Something already listens on the dev port: measuring that server would be silently wrong.
if curl -sf -o /dev/null "$URL"; then echo "port $DEV is already serving a page; refusing to measure it (set DEV_PORT)" >&2; exit 1; fi

(cd "$ROOT" && npx --no-install vite --port "$DEV" --strictPort --host 127.0.0.1 --logLevel silent) & VITE=$!
CHROME_PID=
DRIVE_PID=
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
  [ -n "${DRIVE_PID:-}" ] && kill_tree "$DRIVE_PID"
  [ -n "${CHROME_PID:-}" ] && kill_tree "$CHROME_PID"
  kill_tree "$VITE"
  # pkill takes a regex: escape the profile path's metacharacters.
  local pat; pat=$(printf '%s' "--user-data-dir=$OUT/profile-$MODE" | sed 's/[][\.^$*+?(){}|/]/\\&/g')
  pkill -f -- "$pat" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Bounded wait (about 60 s); fail fast, non-zero, if Vite died (no node_modules, port taken).
for _ in $(seq 1 200); do
  curl -sf -o /dev/null "$URL" && break
  kill -0 "$VITE" 2>/dev/null || { echo "vite exited before serving $URL" >&2; exit 1; }
  sleep 0.3
done
curl -sf -o /dev/null "$URL" || { echo "vite did not serve $URL in time" >&2; exit 1; }

PAGE="http://127.0.0.1:$DEV/kiro-exorcise-game/"; [ "$MODE" = demo ] && PAGE="$PAGE?demo=1&seed=$SEED"
rm -rf "$OUT/profile-$MODE"; mkdir -p "$OUT/profile-$MODE"
"$CHROME" --headless=new --user-data-dir="$OUT/profile-$MODE" --no-first-run \
  --no-default-browser-check --disable-gpu --window-size=1280,720 \
  --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1" \
  ${CAMERA_FLAGS[@]+"${CAMERA_FLAGS[@]}"} \
  --autoplay-policy=no-user-gesture-required --remote-debugging-port="$PORT" \
  "$PAGE" > "$OUT/chrome-$MODE.log" 2>&1 & CHROME_PID=$!

START=space; [ "$MODE" = wave ] && START=wave; [ "$MODE" = demo ] && START=demo
# Background + wait so INT/TERM traps fire immediately instead of after drive.mjs ends.
node "$HERE/drive.mjs" "$PORT" $((SECS * 1000)) "$START" & DRIVE_PID=$!
wait "$DRIVE_PID"
