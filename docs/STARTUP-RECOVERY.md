# Reapple 0.1.2: installation and startup recovery

## User flow

1. Install Node.js 22+ from its official distribution, and install NetEase Cloud Music in `/Applications/NeteaseMusic.app`.
2. Extract the release ZIP and double-click `安装 Reapple.command`.
3. Let the installation finish. Quit/reopen Terminal to use `reapple`; the `.command` entries work without PATH changes.
4. Open NetEase as usual. Automatic recovery polls the host every two seconds. It only launches a closed host when the explicit start action is requested.
5. Manage switches in Settings → Reapple Music. Default capsule material remains frosted; glass is a web approximation, not system Liquid Glass.

If macOS blocks the unsigned script, review its source and use Finder's Open action / the system's normal security confirmation. This package is not notarized. Do not disable Gatekeeper globally.

## Installed files

- `~/.reapple/runtime/{agent,bin,config,payload}`: complete independent runtime.
- `~/.reapple/stage.js`: current payload, refreshed during upgrade.
- `~/.reapple/stage.previous.js`, `runtime-previous/`: prior installation snapshot when upgrading.
- `~/.reapple/config.json`: preserved preferences.
- `~/.reapple/node-path`: absolute Node executable used by the installer.
- `~/Library/LaunchAgents/com.reapple.music.plist`: generated XML with escaped paths and explicit environment.
- `~/.local/bin/reapple`: symlink to installed CLI, not source repository.
- `~/.zprofile`: one marked PATH line, removed by uninstall.
- `~/.reapple/agent.log`, `agent.err.log`: local diagnostics (not included in distribution).

No NetEase bundle changes, credential interception or remote control service is installed. CEF debug transport is requested on loopback port9333. Local processes that can reach that port can control the app; `关闭` detaches but the debug port ends only when NetEase quits. Uninstall followed by a normal reopen restores the unflagged app.

## Why an extra launch can happen

NetEase forgets debug flags between launches. Without patching its bundle/launcher, a
normal Dock/Finder launch therefore needs a graceful restart before CDP injection.
The watcher retries page readiness but does not repeatedly restart the same refusing
process or use SIGKILL. Actual recovery latency varies with app startup and macOS.

## Recovery behavior

The injector validates the version plus the live reconfigure function; it no longer
skips a damaged runtime just because the version marker remains. A normal pass
reattaches removed owned style nodes and reconciles the capsule. Semantic fallbacks
use the host's existing controls when `data-testid` is absent. Unknown core layouts
fall back to the complete native bar rather than a partly styled, nonfunctional capsule.
Native React children and playback handlers remain the originals.

## Focused verification

On the developer Mac / NetEase3.1.12:
- Baseline96, remove test IDs: cover34→60px, native comment reappears; removed stylesheet stays absent.
- Modified97, identical input: cover stays34px, comment hidden, removed stylesheet restored.
- Actual rollback96 copy: reproduces baseline; final97 reapplied.
- Normal quit remains closed for4.5s; normal Finder-style reopen auto-recovers one stage97 capsule in4.169s, no CLI reinjection command used.
- Full uninstall/reinstall and packaged-file hash results are recorded in the workspace verification ledger.

Other client versions and a fresh macOS user/login cycle have not been tested. A friend
whose host structure is not supported should retain a working native bar and send the
version plus `~/.reapple/agent.err.log` (review/redact local data first).
