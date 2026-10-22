## 0.1.2 — stage 97 — 2026-10-22

- Install the whole runtime under `~/.reapple/runtime`, fixing launchd access denials on Desktop/Downloads and deleted source directories.
- Resident launch agent restores injection after normal quit/reopen, waits for a real page, records Node/app paths, and never force-kills a refusing host.
- Refresh payload on upgrade; validate Node.js >=22; add double-click install/start/off/uninstall commands and a usable terminal CLI.
- Recover capsule controls without test IDs, reattach lost owned styles, rebuild remounted controls, and fall back to native UI for unknown core layouts.
- Reconcile a live matching payload instead of trusting its version marker alone; off/uninstall disarms its known document script.
- Verified on NetEase macOS 3.1.12: normal reopen restored stage97 in 4.169s; actual closed-host check stayed closed. This is one observed run, not a cross-device latency guarantee.

# Changelog

## Capsule checkpoint — stage96

- Native-measured floating capsule with live NetEase controls and existing icon motion.
- Independent capsule switch; frosted / enhanced-glass approximation / solid materials.
- Reversible presentation, long-title truncation, reduced-motion handling.
- Previous settings and native-layout corrections retained; guarded hot-upgrade recovery removes pre92 inline geometry through the native host layout callback.

## Settings checkpoint — stage92 (`stage-92-settings`)

- Native-style Reapple Music settings tab and local preference persistence.
- Hovered-line and manual-browsing lyric unblur; native original/translation/romanization modes.
- Remove native lyric selected-time indicator without removing playback timers.
- Correct host layout restoration when disabled, and stale CEF registration handling.
- Includes the earlier icon-motion, artwork/title spacing and native-underlay fixes.
