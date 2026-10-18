# Stage92 — settings, lyric browsing, and reversible native layout

NetEase Settings → **Reapple Music** is injected into the existing anchor navigation.
It uses the host checkbox/radio/section classes, remains accessible with the player
replica disabled, and restores the original sections when another native tab is chosen.

- Hover removes blur only from that lyric line. Manual wheel/touch/keyboard browsing
  removes blur from every lyric line. Normal automatic tracking keeps the focus blur.
- Recovery reuses the existing 1500ms ownership window; this is not an Apple timing measurement.
- Original / translation / romanization uses NetEase's native `setting/changeLyricMode`.
  These are mutually exclusive native modes. Missing alternatives are not fabricated.
  Right-click the existing lyric button for a non-permanent shortcut menu.
- The native `ScrollableLyricDisplayContainer_spqfaoe` selected-time seek indicator
  is hidden only while the replica is active. Playback elapsed/remaining times remain.
- Switches apply immediately, stage a boolean-only record in localStorage, and the
  existing local watcher atomically saves it to `~/.reapple/config.json` within about20s.
  A newer external config wins over stale pending changes. Cold app restart was not
  exercised; disposal/reinjection from the saved config was exercised.
- A stale CEF new-document registration (`Script not found`) is treated as already
  removed; other protocol errors still propagate. Registration is rearmed with preferences.

## Native layout ownership

Older payloads wrote `position:fixed !important` and rail geometry directly onto the
native `.display` node. Removing `html.kabi-on` therefore left the native record and
lyrics overlapping. Stage92 moves all replica rail geometry into class-scoped CSS
with root custom properties. Native width/height are never overwritten by the replica.
Borrowed controls and popup styles are returned when disabled and on disposal.
The already-running pre92 node was recovered once with the host's own Qt updateSize
callback, without restarting the app or changing playback.

Observed same-input enable/disable/enable: stage91 and actual rollback91 leave the
native record/lyric boxes overlapping; stage92 returns static native flow, no overlap,
and the native slider. Stage90/actual rollback90 keep hover/manual blur;92 clears it.
Actual CDP wheel moved scrollTop0→180, all filters none, selected-time indicator's
native inline display:flex overridden to computed none; bottom times remain grid.
No broad test suite was added or run.
