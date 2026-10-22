# Reapple Music

**Apple Music's Now Playing page, rebuilt inside NetEase Cloud Music on macOS.**

Open NetEase Cloud Music, click the album cover in the bottom bar, and you get Apple's
playback page — the album wash, the floating artwork, the scrubber, the synced lyrics, and
the Up Next queue — laid out and animated against NetEase's own playback state.

Not a theme. Not a skin. A reconstruction, built from measurements taken off Apple's
running app rather than from screenshots of it.

```
reapple on        # install, start, attach
reapple status    # what is installed, what is switched on
reapple config    # the component switches
reapple off       # detach, reversibly, without touching NetEase
```

---

## Why it exists

Every visual constant in here came off a screen. Apple's window was captured at 2 device
pixels per point, the ink was thresholded, the runs were measured, and the numbers went
into the stylesheet. When a measurement contradicted the code, the code lost.

That discipline is the whole project. A few of the things it has already caught:

| What | What the code believed | What the pixels said |
|---|---|---|
| AutoPlay glyph | two rings with a 0.78pt gap between them | a lemniscate — the lobes touch, ink 18.5 × 8.5pt |
| AutoMix glyph | an evenodd ring plus a solid disc | two hollow rings whose strokes overlap, ink 20.5 × 12.0pt |
| Queue `…` | 2.6pt dots at alpha .59 | 2.00pt dots at alpha **.193**, neutral across all three channels |
| Queue `…` position | 25pt from the panel edge | 31.0pt |
| Queue pills | 10pt gap, 9pt margins | 17.5pt gap, 13pt margins, fill rgb(209,208,204) |
| Song title | 15pt × the artwork column's scale | **18.2pt**, measured off Apple's ink |
| Transport hit boxes | sized by their own glyphs | **30 / 48 / 28 / 48 / 30**, from `Music.nowPlaying.*TransportControl` |

The song-title row is the one that taught the method. Apple's accessibility tree
exposes no font for that string at all — the whole block is a single `AXButton`
with the title and subtitle folded into its description and `AXFont` empty — so the
size had to come off the pixels, and the pixels alone are not enough: a thresholded
cap height gives 18.2pt and the glyph advances give 13.4, which is not a rounding
disagreement. What settled it was calibrating the cap ratio against the replica
itself, whose size is known exactly. `HOYO-MiX` measured 7.00pt of cap at a
rendered 9.8187pt — a ratio of .713, which is SF Pro's cap height to within a
thousandth. Apple's title caps then measure 13.00pt and its subtitle caps 11.00pt,
and 13.00/.713 is 18.2. A ruler you can check is worth more than a constant you
remember.

The AutoPlay row is worth reading twice: the old comment claimed the two circles
"cross where Apple's cross" while its own numbers left a visible gap, so the mark
rendered as `oo` next to a comment asserting an `∞`. Reading the ink run per
scanline showed one continuous blob through the middle — the lobes touch. The
numbers now say so.

Full measurement notes are in [`docs/MEASUREMENTS.md`](docs/MEASUREMENTS.md).

## Install

Requires macOS, NetEase Cloud Music in `/Applications`, and **Node.js 22 or newer** (built-in WebSocket).

For a downloaded ZIP: extract it and double-click **安装 Reapple.command**. The package also
contains **启动 Reapple.command**, **关闭 Reapple.command**, and **卸载 Reapple.command**.
They do not depend on terminal PATH. Review the scripts before running; the ZIP is not a signed
or notarized macOS app.

```sh
git clone https://github.com/Yhazrin/reapple.git
cd reapple
./install.sh
```

`install.sh` copies the complete runtime, payload and settings into `~/.reapple/`.
The launchd agent points **only to that installed runtime**, not Desktop, Downloads or
an extracted repository. You can delete the downloaded folder after installation.
Your existing settings survive upgrades, but the payload and agent are refreshed.

When you quit NetEase it stays closed. When you open it normally, the agent checks
within about two seconds; if the debug flag was lost it gracefully restarts NetEase
with the local debug port and reinjects when the app is ready. This may cause a brief
extra launch; injection is **not instantaneous**. A direct **启动 Reapple.command**
starts it with the needed flags. A hung/refusing host is never force-killed.

Nothing is written inside `NeteaseMusic.app`. Uninstall using the double-click entry,
`reapple uninstall` (new terminal), or this PATH-independent fallback:

```sh
bash "$HOME/.reapple/runtime/bin/reapple" uninstall
```

`reapple off` stops automatic recovery and detaches; `reapple on` enables it again.
Native Settings → Reapple Music → master switch disables the replica but leaves its
settings manager available. The CLI off/uninstall also disarms the known reload script.
Details and limitations: [startup recovery](docs/STARTUP-RECOVERY.md).

## Switches

Every component can be turned off independently, and a change takes effect on the next
animation frame — no reload, no restart.

```sh
reapple config                 # list, with what each one is
reapple config lyrics off
reapple config backdrop on
reapple config                 # back to normal
```

| Switch | Default | What it turns off |
|---|---|---|
| `playPage` | on | **master** — hands the whole page back to NetEase |
| `backdrop` | on | the sampled-and-graded album colour wash |
| `artwork` | on | the floating artwork card and its play/pause animation |
| `songInfo` | on | title / artist / album |
| `playbackBar` | on | elapsed, remaining, scrubber |
| `lyrics` | on | the synced lyric list and its scroll algorithm |
| `footer` | on | the two liquid-glass buttons, bottom right |
| `queue` | on | the Up Next sheet the right-hand button opens |
| `miniBar` | on | the floating playback capsule |

Settings live in `~/.reapple/config.json`. A key you delete falls back to its default, and
an unknown key is ignored rather than fatal, so the file is safe to trim.

`reapple off` is the escape hatch: it writes a marker the agent reads, unloads the agent,
and disposes the payload from the running page. NetEase keeps playing.

## How it works

```
launchd (every 20s)
  └── agent/watch.sh      relaunch NetEase with --remote-debugging-port if it lost the flag
        └── agent/inject.mjs   CDP over the debug port
              └── payload/stage.js
```

The payload is a single IIFE injected at `Page.addScriptToEvaluateOnNewDocument`, so it is
armed before first paint on every new document and survives a reload without re-injection.

Two guards carry most of the weight:

- **`STAGE_VERSION`** is declared once and every check reads it. Bumping it is what tears the
  old build down; nothing else can, which is why a version bump is the only way to ship a
  payload change.
- **The settings hash** is tracked separately from the version. A config-only edit must not
  rebuild the page — that would drop every handler and observer and rebuild for a one-line
  settings change — and a rebuild must not skip on a matching version, or editing
  `config.json` would silently do nothing until the next release. So the two are separate
  keys: version triggers teardown, settings trigger `window.__kabiReconfigure()`, and the
  payload re-reads the switches on its own tick regardless.

### Coordinate frame

`<html>` carries `zoom: 2`, so `innerWidth` and `getBoundingClientRect` report the 2×
backing frame while the painted viewport is half that. Only `position: fixed` coordinates
are in the painted frame. Every layout number in the payload was measured in painted points.

### Layout under the replica

The host owns `body.vinyl-mode` and its main-page `content-visibility` culling while
fully open. The plugin no longer applies a global visibility blanket: the real main
page remains painted during player entrance/exit, and player-only overrides are scoped
to `#vinyl-page-container`.

Artwork and title now share one vertical layout: the title is19pt below the artwork's
untransformed box, measured at1291×949,1512×949 and1512×800. See
[layout/transition evidence](docs/LAYOUT-TRANSITIONS.md).

## Known gaps

Stated plainly, because a project that claims 1:1 and quietly isn't is worse than one that
says where it stops.

- **The queue row `…` opens NetEase's real menu, but it opens it in the wrong place.**
  The styling is measured and correct, including the hover state, which takes the
  artwork's own colour the way Apple's does, and the actions are NetEase's own —
  播放, 下一首播放, 查看评论, 收藏, 下载, 分享, 复制链接 — because the row asks the
  host to build its menu rather than reimplementing one. What it cannot do is place it.
  `winhelper.popupMenu` is handed `{content, hotkey, left_border_size, menu_type}` and no
  coordinates at all, so the position has to arrive some other way; the only channel the
  host has is the click point in `actionPayload.rawEvent`, and the row now sends it, in the
  host's own shape. Verified so far: the menu appears, with the right actions. Not
  verified: that it appears at the mark. Last confirmed behaviour was the window's
  bottom-left corner, and the position has not been re-checked since the payload shape
  changed.
- **The song info and the playback bar are measured; their motion is not.** Layout, type
  size and hit geometry are off Apple's own tree, and every row of the rail now matches to
  within a rounding step. The transitions, timing curves and the artwork's play/pause
  motion are not all measured to the same depth as the layout. The play/pause replacement
  is now sampled from Apple's running app: two overlapping glyphs shrink/replace/overshoot,
  replayed with measured scale/relative-opacity samples rather than a guessed spring. Its
  ink bounds are measured too (play 24 × 27pt, pause 21 × 27.5pt); the underlying path
  contours remain the previous reconstruction, not newly extracted Apple vector assets.
  Previous/next activation now has separately sampled three-arrow hand-offs: an incoming
  arrow grows, the middle shifts, the outgoing shrinks, with mirrored previous geometry.
  Pointer-down/held feedback and exact vector contour equivalence remain unmeasured.
  See the scoped [play/pause notes](docs/TRANSPORT-MOTION.md) and
  [skip/queue-layout notes](docs/SKIP-MOTION.md).
- **The backdrop wash reads greyer than Apple's** on some albums.

## Licence

MIT — see [LICENSE](LICENSE).

reapple is not affiliated with, endorsed by, or sponsored by Apple Inc. or NetEase
Cloud Music. It contains no Apple code and no NetEase code. It reads Apple Music's *output*
the way a person does — by looking at it and measuring — and it reads NetEase's playback
state from the process's own public debugging endpoint while that process is running.

Apple, the Apple logo, iCloud, and Apple Music are trademarks of Apple Inc. NetEase Cloud
Music is a trademark of NetEase. Their names are used here only to identify what this
project is compatible with.

## In-app settings (stage92)

Open NetEase Settings → **Reapple Music** for immediate, persistent component switches,
hover/manual-browse lyric focus, and native original/translation/romanization modes.
The replica can be disabled without leaving native rail geometry behind. See
[settings and lyric behavior](docs/SETTINGS-LYRICS.md) for scope and observed checks.

## Floating playback capsule (stage96)

The bottom bar can now use Apple Music's measured **700×54pt** floating-capsule
layout, with34pt artwork and the original NetEase playback/seek/menu handlers.
Settings → Reapple Music provides a capsule switch plus **frosted** (default),
**enhanced glass** (explicit web approximation, not system Liquid Glass), and
**solid** materials. Turning the component or master switch off restores the
native bar immediately. [Geometry, adaptations and observations](docs/FLOATING-CAPSULE.md).

```sh
reapple config miniBar on
reapple config miniBarMaterial frosted # or glass / solid
```
