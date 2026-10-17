# reapple

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

The AutoPlay row is the one worth reading twice: the old comment claimed the two circles
"cross where Apple's cross" while its own numbers left a visible gap, so the mark rendered
as `oo` next to a comment asserting an `∞`. Reading the ink run per scanline showed one
continuous blob through the middle — the lobes touch. The numbers now say so.

Full measurement notes are in [`docs/MEASUREMENTS.md`](docs/MEASUREMENTS.md).

## Install

Requires macOS, NetEase Cloud Music in `/Applications`, and Node.

```sh
git clone https://github.com/Yhazrin/reapple.git
cd reapple
./install.sh
```

`install.sh` puts the payload and settings in `~/.reapple/`, installs a launchd agent, and
attaches. NetEase is restarted once, because the transport is a Chrome DevTools Protocol
endpoint and NetEase forgets its command line on every launch — there is no way around that
one, so it is done for you and only once.

Nothing is written inside `NeteaseMusic.app`. Uninstall is `reapple uninstall`.

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
| `miniBar` | on | reserved; not built yet |

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

The host hides its own chrome with `body.vinyl-mode` plus `content-visibility: hidden` on
seven `.should-hide-under-vinyl-mode` nodes while the playback page is up, and restores all
of it on the way out. `reapple` rides that rather than reimplementing it.

## Known gaps

Stated plainly, because a project that claims 1:1 and quietly isn't is worse than one that
says where it stops.

- **The queue row `…` has no menu yet.** The styling is measured and correct, including the
  hover state, which takes the artwork's own colour the way Apple's does. The actions are
  not built, and the reason is structural rather than unfinished: NetEase's player runs
  through a native command bridge, not the JS store. `store.dispatch` never sees playback
  at all — the only type that crosses it while a track advances is `host/onUpdate` — and
  `window.api`, the bridge handle, is an empty object. NetEase also renders its track rows
  with working context menus only on lists it owns; the playing list has no rendered rows
  anywhere in the DOM, so there is no host menu to delegate to. Building the menu means
  mapping the native bridge first.
- **Queue rows are not clickable to play.** Same reason.
- **The backdrop wash reads greyer than Apple's** on some albums.
- **Motion on the song info and playback bar** is faithful in curve and duration but not yet
  dug as deep as the layout and the queue.

## Licence

MIT — see [LICENSE](LICENSE).

reapple is not affiliated with, endorsed by, or sponsored by Apple Inc. or NetEase
Cloud Music. It contains no Apple code and no NetEase code. It reads Apple Music's *output*
the way a person does — by looking at it and measuring — and it reads NetEase's playback
state from the process's own public debugging endpoint while that process is running.

Apple, the Apple logo, iCloud, and Apple Music are trademarks of Apple Inc. NetEase Cloud
Music is a trademark of NetEase. Their names are used here only to identify what this
project is compatible with.
