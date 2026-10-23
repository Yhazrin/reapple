#!/bin/bash
# Resident, bounded watcher: never starts a closed host unless --start was requested.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${REAPPLE_HOME:-$HOME/.reapple}"
APP="${REAPPLE_APP:-/Applications/NeteaseMusic.app}"
PORT="${REAPPLE_PORT:-9333}"
LOG="${REAPPLE_LOG:-$HOME_DIR/agent.log}"
NODE="${REAPPLE_NODE:-$(cat "$HOME_DIR/node-path" 2>/dev/null || true)}"
[ -d "$APP" ] && [ -x "$NODE" ] || exit 1
retry_pid=""; last_inject=0; failures=0
pass() {
  [ ! -f "$HOME_DIR/disabled" ] || return 0
  local pid args now
  pid="$(pgrep -x NeteaseMusic | head -1 || true)"
  if [ -z "$pid" ]; then retry_pid=""; last_inject=0; rm -f "$HOME_DIR/pending-restart"; return 0; fi
  args="$(ps -ww -p "$pid" -o args= || true)"
  if [[ "$args" != *"--remote-debugging-port=${PORT}"* ]]; then
    # Passive observation must never interrupt playback or relaunch the host.
    printf '%s\n' "$pid" > "$HOME_DIR/pending-restart"
    if [ "${1:-}" != "--restart" ]; then return 2; fi
    [ "$retry_pid" != "$pid" ] || return 2
    retry_pid="$pid"
    osascript -e 'tell application "NeteaseMusic" to quit' >/dev/null 2>&1 || return 2
    for ((i=0;i<40;i++)); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then return 2; fi
    [ ! -f "$HOME_DIR/disabled" ] || return 0
    open -a "$APP" --args "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" || return 1
    last_inject=0
  fi
  rm -f "$HOME_DIR/pending-restart"
  now=$(date +%s)
  [ "$((now-last_inject))" -ge 10 ] || return 0
  curl -sf -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null || return 1
  if REAPPLE_HOME="$HOME_DIR" REAPPLE_PORT="$PORT" "$NODE" "$DIR/inject.mjs" >>"$LOG" 2>&1; then last_inject="$now"; failures=0; else failures=$((failures+1)); return 1; fi
  if [ -f "$LOG" ] && [ "$(wc -c <"$LOG")" -gt 1048576 ]; then
    tail -c 262144 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}
if [ "${1:-}" = --once ]; then pass; exit $?; fi
if [ "${1:-}" = --start ] || [ "${1:-}" = --restart ]; then
  if ! pgrep -x NeteaseMusic >/dev/null; then open -a "$APP" --args "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT"; fi
  for ((attempt=0;attempt<20;attempt++)); do
    pass "${1:-}"; result=$?
    if [ "$result" = 2 ]; then echo '网易云正在运行，需要确认重启后才能启用。当前播放未被打断。'; exit 2; fi
    [ "$result" != 0 ] || [ "$last_inject" = 0 ] || exit 0
    sleep 1
  done
  echo "reapple: injection failed; see $LOG" >&2; exit 1
fi
trap 'exit 0' TERM INT
while true; do
  if [ -n "${REAPPLE_OWNER_PID:-}" ] && ! kill -0 "$REAPPLE_OWNER_PID" 2>/dev/null; then exit 0; fi
  pass || true
  sleep 2
done
