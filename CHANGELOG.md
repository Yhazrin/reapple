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
