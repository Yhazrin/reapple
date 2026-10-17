#!/bin/bash
# Keep reapple attached to NetEase Cloud Music.
#
# Runs every 20s from launchd rather than living as a daemon, so there is nothing to crash, nothing
# to leak and nothing to clean up: launchd starts it, it does one pass, it exits. The pass is
# idempotent -- a build already at the current version is left alone.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${REAPPLE_HOME:-$HOME/.reapple}"
APP="${REAPPLE_APP:-/Applications/NeteaseMusic.app}"
PORT="${REAPPLE_PORT:-9333}"
LOG="${REAPPLE_LOG:-/tmp/reapple.log}"
NODE="${REAPPLE_NODE:-$(command -v node || echo /opt/homebrew/bin/node)}"

# The whole stage is off. Leave the host alone entirely -- no relaunch, no debugging port, nothing.
if [ -f "$HOME_DIR/disabled" ]; then exit 0; fi
if [ ! -d "$APP" ]; then exit 0; fi
if [ ! -x "$NODE" ]; then echo "reapple: node not found at $NODE" >>"$LOG"; exit 0; fi

pid="$(pgrep -x NeteaseMusic | head -1 || true)"
[ -z "$pid" ] && exit 0

# The debug port is the whole transport. Without it there is no page target and nothing to attach
# to. NetEase does not remember a flag across launches, so if the running copy lacks it the app has
# to be restarted -- and it has to be a clean quit, because a process holding the port will not
# release it for the new one to bind.
args="$(ps -ww -p "$pid" -o args= || true)"
if [[ "$args" != *"--remote-debugging-port=${PORT}"* ]]; then
  # Quit politely first: NetEase saves its state on exit and an immediate SIGKILL loses the queue.
  osascript -e 'tell application "NeteaseMusic" to quit' >/dev/null 2>&1 || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 16); do
    pgrep -x NeteaseMusic >/dev/null || break
    sleep 0.3
  done
  # Only if it is still there. At this point the polite exit has failed and the port is very likely
  # still held, so the hard kill is what actually frees it.
  pgrep -x NeteaseMusic >/dev/null && kill -9 "$pid" 2>/dev/null
  sleep 0.5
  open -a "$APP" --args "--remote-debugging-port=${PORT}" "--remote-allow-origins=*"
  for _ in $(seq 1 20); do
    pgrep -x NeteaseMusic >/dev/null && break
    sleep 0.3
  done
  sleep 2
fi

# The port answers before the CEF page target exists; attaching in that window fails harmlessly and
# the next pass catches it, so there is no need to make this a hard failure.
for _ in $(seq 1 10); do
  curl -sf -m 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null && break
  sleep 0.4
done

REAPPLE_HOME="$HOME_DIR" REAPPLE_PORT="$PORT" "$NODE" "$DIR/inject.mjs" >>"$LOG" 2>&1 || true

# Keep the log from growing without bound under a 20-second cadence.
[ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt 1048576 ] && : >"$LOG"
exit 0
