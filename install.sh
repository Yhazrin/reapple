#!/bin/bash
# Install a self-contained runtime outside Desktop/Downloads (launchd TCC restrictions).
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${REAPPLE_HOME:-$HOME/.reapple}"
APP="${REAPPLE_APP:-/Applications/NeteaseMusic.app}"
NODE="${REAPPLE_NODE:-$(command -v node || true)}"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ ! -x "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
[ -d "$APP" ] || { echo "找不到网易云：$APP" >&2; exit 1; }
[ -x "$NODE" ] || { echo '需要 Node.js 22 或以上。请安装 https://nodejs.org 后重试。' >&2; exit 1; }
"$NODE" -e 'if(Number(process.versions.node.split(".")[0])<22 || typeof WebSocket!=="function")process.exit(1)' || { echo '需要 Node.js 22 或以上（内置 WebSocket）。' >&2; exit 1; }
mkdir -p "$HOME_DIR" "$HOME/.local/bin" "$HOME/Library/LaunchAgents"
chmod 700 "$HOME_DIR"
launchctl bootout "gui/$UID/com.reapple.music" 2>/dev/null || true
TEMP="$(mktemp -d "$HOME_DIR/runtime-new.XXXXXX")"
trap 'rm -rf "$TEMP"' EXIT
for item in bin agent config; do cp -R "$REPO/$item" "$TEMP/"; done
cp "$REPO/install.sh" "$TEMP/"
mkdir -p "$TEMP/payload"
cp "$REPO/payload/stage.js" "$TEMP/payload/"
[ ! -d "$HOME_DIR/runtime" ] || { rm -rf "$HOME_DIR/runtime-previous"; mv "$HOME_DIR/runtime" "$HOME_DIR/runtime-previous"; }
mv "$TEMP" "$HOME_DIR/runtime"
[ ! -f "$HOME_DIR/stage.js" ] || cp "$HOME_DIR/stage.js" "$HOME_DIR/stage.previous.js"
cp "$HOME_DIR/runtime/payload/stage.js" "$HOME_DIR/stage.js"
[ -f "$HOME_DIR/config.json" ] || cp "$HOME_DIR/runtime/config/config.json" "$HOME_DIR/config.json"
printf '%s\n' "$NODE" > "$HOME_DIR/node-path"
LINK="$HOME/.local/bin/reapple"
if [ ! -e "$LINK" ] && [ ! -L "$LINK" ]; then ln -s "$HOME_DIR/runtime/bin/reapple" "$LINK"; fi
# A terminal command is convenient, but the included .command files work without PATH setup.
PROFILE="$HOME/.zprofile"
LINE='export PATH="$HOME/.local/bin:$PATH" # Reapple Music CLI'
if ! grep -Fq '# Reapple Music CLI' "$PROFILE" 2>/dev/null; then printf '\n%s\n' "$LINE" >> "$PROFILE"; touch "$HOME_DIR/profile-added"; fi
REAPPLE_NODE="$NODE" REAPPLE_HOME="$HOME_DIR" REAPPLE_APP="$APP" bash "$HOME_DIR/runtime/bin/reapple" on
printf '\n安装完成，可删除下载文件夹。重开终端即可使用 reapple。\n无需 PATH 的卸载命令：bash "%s/runtime/bin/reapple" uninstall\n' "$HOME_DIR"
