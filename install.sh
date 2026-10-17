#!/bin/bash
# reapple installer.  Thin on purpose: everything it does, `reapple on` can do again, and
# `reapple uninstall` reverses all of it.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
APP="${REAPPLE_APP:-/Applications/NeteaseMusic.app}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

bold "reapple — Apple Music's Now Playing page, inside NetEase Cloud Music"
printf '\n'

if [ ! -d "$APP" ]; then
  printf 'NetEase Cloud Music is not at %s\n' "$APP" >&2
  printf 'Set REAPPLE_APP to its path if it lives somewhere else, then re-run.\n' >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'node is required and was not found on PATH.\n' >&2
  printf 'Install Node (https://nodejs.org) and re-run.\n' >&2
  exit 1
fi

bash "$REPO/bin/reapple" on
