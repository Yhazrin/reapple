# Floating capsule — stage96

## Native reference, not a new playback engine

Read from the running Apple Music app via macOS accessibility, without changing its
playback or window: the outer capsule is700×54pt,19pt above the main-window bottom.
Its content is inset9pt. The transport block uses28/28/36/28/28pt hit widths;
metadata is385pt wide with34pt artwork, and utilities use36pt hit regions.
The capsule is centred in the content area, excluding the sidebar.
See [native geometry](CAPSULE-NATIVE-GEOMETRY.json).

The NetEase version keeps the original React-owned cover, metadata, seek slider,
play/pause/skip, queue, lyric, quality, volume, favourite and more-menu controls.
It does not clone audio, intercept network requests, move React children or write
native inline layout. The queue button stays in its React parent, positioned in
the right utility slot through CSS. The native combined mode menu remains; a
separate repeat button dispatches the existing native repeat action.

Necessary adaptations: NetEase quality occupies Apple's AirPlay slot; favourite
is retained next to the more menu, and the native desktop-lyric function is kept.
Comment/collect shortcuts and counts are hidden from the compact surface, not removed
from NetEase's menus/pages. Long titles truncate rather than run two native marquee
copies across the controls. Type sizes13/12pt and capsule material are web adaptations,
not newly recovered Apple font/material implementation. Previous/next and play/pause
reuse the earlier measured/reconstructed Now Playing glyph motion, scaled for this bar;
they were not separately captured from the native mini player.

## Settings

NetEase **Settings → Reapple Music → 悬浮播放栏**:

- Enable/disable the capsule independently of the other component switches.
  The Reapple Music master switch also disables it.
- **高斯毛玻璃** (`frosted`, default):28px blur and1.45 saturation.
- **增强玻璃** (`glass`):20px blur, stronger saturation and rim highlights.
  This is explicitly a web approximation, **not Apple's system Liquid Glass**;
  no claim of equivalent refraction or compositor sampling is made.
- **纯色** (`solid`): no backdrop filter, less transparency/compositing work.

```sh
reapple config miniBar off
reapple config miniBar on
reapple config miniBarMaterial frosted
reapple config miniBarMaterial glass
reapple config miniBarMaterial solid
```

Preferences apply immediately and persist using the same local watcher. Only a
whitelisted boolean or one of the three fixed material names can cross that bridge.
Reduced-motion disables the decorative transitions; reduced-transparency requests
remove the backdrop filter. Light and dark native app appearances were observed.

## Focused observations

Same-input stage92 baseline / stage95 / actual rollback92:
full1512×92.5pt native bar →700×54pt floating capsule → full1512×92.5pt native bar.
Stage95 reapplied; stage96 retains this capsule implementation and adds guarded legacy-layout upgrade recovery. All five probed native controls retained hit reachability. Native
playback state2→1→2; repeat mode playOrder→playCycle and original mode restored.
Changing all three material radios updated the live filter; `solid` was read back
from the config file, then the original `frosted` preference was restored and saved.
Capsule-only off and master off both restore native presentation. The original
native button objects survive the switch; no extra glyphs remain when disabled.
Re-enabling creates one repeat button, not duplicates.

No broad test suite, app restart, independent capsule skip recording, or new claim
of pixel-identical liquid-glass rendering is included in this checkpoint.

## Hot-upgrade recovery (stage96)

A pre92 payload can leave old inline rail geometry even when a new payload no longer
writes it. Stage96 detects that exact legacy signature and, for the inspected host
layout/ref shape, invokes NetEase's own Qt updateSize callback to restore its native
sizes once. No guessed native dimensions are shipped. Real91→96 upgrade reproduced
fixed-position overlap before and static native flow/no overlap after, without an
app restart. If a future host changes that internal shape, the guarded repair logs
a restart-once warning rather than mutating an unknown layout. Tested host: macOS
NetEase3.1.12. No broad compatibility claim is implied.
