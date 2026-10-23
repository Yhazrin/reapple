#!/bin/bash
# Install a self-contained runtime outside Desktop/Downloads (launchd TCC restrictions).
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${REAPPLE_HOME:-$HOME/.reapple}"
APP="${REAPPLE_APP:-/Applications/NeteaseMusic.app}"
NODE="${REAPPLE_NODE:-}"
BUNDLED_NODE="$REPO/vendor/node/node"
if [ -z "$NODE" ] && [ -x "$BUNDLED_NODE" ]; then NODE="$BUNDLED_NODE"; fi
[ -n "$NODE" ] || NODE="$(command -v node || true)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ ! -x "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
[ -d "$APP" ] || { echo "找不到网易云：$APP" >&2; exit 1; }
[ -x "$NODE" ] || { echo '需要 Node.js 22 或以上。请安装 https://nodejs.org 后重试。' >&2; exit 1; }
"$NODE" -e 'if(Number(process.versions.node.split(".")[0])<22 || typeof WebSocket!=="function")process.exit(1)' || { echo '需要 Node.js 22 或以上（内置 WebSocket）。' >&2; exit 1; }
# Refuse ambiguous/destructive installation roots before any mutation.
case "$HOME_DIR" in ""|/|"$HOME") echo '不安全的组件目录' >&2; exit 2;; esac
mkdir -p "$HOME_DIR" "$HOME/.local/bin" "$HOME/Library/LaunchAgents"
chmod 700 "$HOME_DIR"
LOCK="$HOME_DIR/.install-lock"
RECOVER=0
if [ "${1:-}" = "--recover" ]; then
  [ -d "$LOCK" ] || { echo '没有待恢复的安装。'; exit 0; }
  owner="$(cat "$LOCK/pid" 2>/dev/null || true)"
  case "$owner" in ''|*[!0-9]*) ;; *)
    if kill -0 "$owner" 2>/dev/null; then echo '安装进程仍在运行，不能恢复。' >&2; exit 3; fi;; esac
  mkdir "$LOCK/.recovering" 2>/dev/null || { echo '已有恢复任务，或上次恢复异常退出。' >&2; exit 3; }
  RECOVER=1
else
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "安装被锁定。若上次异常退出，可运行：bash \"$REPO/install.sh\" --recover" >&2
    exit 3
  fi
  printf '%s\n' "$$" > "$LOCK/pid"
fi
TEMP=""; BACKUP=""; MUTATED=0; COMMITTED=0; WAS_LOADED=0
cleanup() {
  code=$?
  trap - EXIT
  set +e
  RECOVERY_FAILED=0
  if [ "$MUTATED" = 1 ] && [ "$COMMITTED" = 0 ]; then
    echo '安装未完成，正在恢复原有组件…' >&2
    launchctl bootout "gui/$UID/com.reapple.music" 2>/dev/null || true
    for item in runtime runtime-previous stage.js stage.previous.js config.json node-path disabled profile-added; do
      rm -rf "$HOME_DIR/$item" || RECOVERY_FAILED=1
      if [ -e "$BACKUP/$item" ]; then cp -RP "$BACKUP/$item" "$HOME_DIR/$item" || RECOVERY_FAILED=1; fi
    done
    if [ -e "$BACKUP/profile" ]; then cp -p "$BACKUP/profile" "$HOME/.zprofile" || RECOVERY_FAILED=1; else rm -f "$HOME/.zprofile"; fi
    if [ -e "$BACKUP/launcher" ] || [ -L "$BACKUP/launcher" ]; then
      rm -f "$HOME/.local/bin/reapple"; cp -P "$BACKUP/launcher" "$HOME/.local/bin/reapple" || RECOVERY_FAILED=1
    elif [ -L "$HOME/.local/bin/reapple" ]; then rm -f "$HOME/.local/bin/reapple"; fi
    plist="$HOME/Library/LaunchAgents/com.reapple.music.plist"
    if [ -e "$BACKUP/agent.plist" ]; then cp -p "$BACKUP/agent.plist" "$plist" || RECOVERY_FAILED=1; else rm -f "$plist"; fi
    if [ "$WAS_LOADED" = 1 ]; then launchctl bootstrap "gui/$UID" "$plist" >&2 || RECOVERY_FAILED=1; fi
  fi
  [ -z "$TEMP" ] || rm -rf "$TEMP"
  if [ "$RECOVERY_FAILED" = 1 ]; then
    printf '%s\n' "$BACKUP" > "$LOCK/recovery-backup"
    echo "自动恢复未完成，备份已保留：${BACKUP}；请勿删除安装锁。" >&2
    rmdir "$LOCK/.recovering" 2>/dev/null || true
    exit 1
  fi
  [ -z "$BACKUP" ] || rm -rf "$BACKUP"
  rm -rf "$LOCK"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [ "$RECOVER" = 1 ]; then
  BACKUP="$(cat "$LOCK/recovery-backup" 2>/dev/null || true)"
  if [ -z "$BACKUP" ] && [ ! -e "$LOCK/recovery-backup" ]; then
    # The journal is written before any installed file is changed.
    # A dead pre-commit owner therefore needs only its lock released.
    trap - EXIT
    rm -rf "$LOCK"
    echo '上次安装在替换组件前中断，原有组件未变，可重新安装。'
    exit 0
  fi
  case "$BACKUP" in "$HOME_DIR"/.install-backup.*) ;; *)
    BACKUP=""; echo '无完整恢复记录，保留锁以避免覆盖。' >&2
    trap - EXIT; rmdir "$LOCK/.recovering"; exit 4;; esac
  if [ ! -d "$BACKUP" ] || [ -L "$BACKUP" ]; then
    trap - EXIT; rmdir "$LOCK/.recovering"; echo '恢复备份不可用。' >&2; exit 4
  fi
  WAS_LOADED="$(cat "$BACKUP/was-loaded" 2>/dev/null || echo 0)"
  MUTATED=1
  exit 0
fi
BACKUP="$(mktemp -d "$HOME_DIR/.install-backup.XXXXXX")"
for item in runtime runtime-previous stage.js stage.previous.js config.json node-path disabled profile-added; do
  [ ! -e "$HOME_DIR/$item" ] || cp -RP "$HOME_DIR/$item" "$BACKUP/$item"
done
[ ! -e "$HOME/.zprofile" ] || cp -p "$HOME/.zprofile" "$BACKUP/profile"
if [ -e "$HOME/.local/bin/reapple" ] || [ -L "$HOME/.local/bin/reapple" ]; then cp -P "$HOME/.local/bin/reapple" "$BACKUP/launcher"; fi
[ ! -e "$HOME/Library/LaunchAgents/com.reapple.music.plist" ] || cp -p "$HOME/Library/LaunchAgents/com.reapple.music.plist" "$BACKUP/agent.plist"
launchctl print "gui/$UID/com.reapple.music" >/dev/null 2>&1 && WAS_LOADED=1
printf '%s\n' "$WAS_LOADED" > "$BACKUP/was-loaded"
TEMP="$(mktemp -d "$HOME_DIR/runtime-new.XXXXXX")"
for item in bin agent config; do cp -R "$REPO/$item" "$TEMP/"; done
cp "$REPO/install.sh" "$TEMP/"
if [ -d "$REPO/vendor/node" ]; then
  mkdir -p "$TEMP/vendor"
  cp -R "$REPO/vendor/node" "$TEMP/vendor/"
fi
mkdir -p "$TEMP/payload"
cp "$REPO/payload/stage.js" "$TEMP/payload/"
printf '%s\n' "$BACKUP" > "$LOCK/recovery-backup"
MUTATED=1
launchctl bootout "gui/$UID/com.reapple.music" 2>/dev/null || true
[ ! -d "$HOME_DIR/runtime" ] || { rm -rf "$HOME_DIR/runtime-previous"; mv "$HOME_DIR/runtime" "$HOME_DIR/runtime-previous"; }
mv "$TEMP" "$HOME_DIR/runtime"
[ ! -f "$HOME_DIR/stage.js" ] || cp "$HOME_DIR/stage.js" "$HOME_DIR/stage.previous.js"
cp "$HOME_DIR/runtime/payload/stage.js" "$HOME_DIR/stage.js"
[ -f "$HOME_DIR/config.json" ] || cp "$HOME_DIR/runtime/config/config.json" "$HOME_DIR/config.json"
# Never retain a path into a mounted DMG or temporary download directory.
if [ "$NODE" = "$BUNDLED_NODE" ]; then NODE="$HOME_DIR/runtime/vendor/node/node"; fi
printf '%s\n' "$NODE" > "$HOME_DIR/node-path"
LINK="$HOME/.local/bin/reapple"
if [ ! -e "$LINK" ] && [ ! -L "$LINK" ]; then ln -s "$HOME_DIR/runtime/bin/reapple" "$LINK"; fi
# A terminal command is convenient, but the included .command files work without PATH setup.
PROFILE="$HOME/.zprofile"
LINE='export PATH="$HOME/.local/bin:$PATH" # Reapple Music CLI'
if ! grep -Fq '# Reapple Music CLI' "$PROFILE" 2>/dev/null; then printf '\n%s\n' "$LINE" >> "$PROFILE"; touch "$HOME_DIR/profile-added"; fi
# The graphical manager installs first; enabling injection is a separate explicit action.
if [ "${REAPPLE_START:-1}" = "0" ]; then
  touch "$HOME_DIR/disabled"
  REAPPLE_HOME="$HOME_DIR" REAPPLE_NODE="$NODE" "$NODE" "$HOME_DIR/runtime/agent/detach.mjs"
  printf '\n组件已安装，注入未开启。可在 Reapple Music 管理窗口中启用。\n'
else
  REAPPLE_NODE="$NODE" REAPPLE_HOME="$HOME_DIR" REAPPLE_APP="$APP" bash "$HOME_DIR/runtime/bin/reapple" on
fi
COMMITTED=1
printf '\n安装完成，可删除下载文件夹。重开终端即可使用 reapple。\n无需 PATH 的卸载命令：bash "%s/runtime/bin/reapple" uninstall\n' "$HOME_DIR"
