# Measurements

Where the numbers come from, so they can be re-taken and disagreed with.

## The rule

**Measure, don't reason.** No constant in `payload/stage.js` was chosen by eye, by analogy
with a screenshot, or by "that looks about right". Each one is a number read off a running
copy of Apple Music.

Two instruments, and which one is used depends on what is being asked:

| Question | Instrument | Why |
|---|---|---|
| Where is a control, how big is it | **AX** (`kAXPositionAttribute`, `kAXSizeAttribute`) | The AX frame is what Apple's own layout is written against. Reading it off a screenshot would bake in the Retina factor and any resampling. |
| What colour is a mark, how thick is it | **Screenshot pixels** (`screencapture -x -R "x,y,w,h"`, thresholded) | There is no accessibility attribute for "how bright is this dot". |

`screencapture -R` takes **comma**-separated values — `-R "650,108,580,52"`. Space-separated
is rejected outright, which reads like a malformed rectangle rather than a syntax error.

On a Retina display `-R` yields **2 device pixels per point**. Every number below is in
points; divide by two for the raw pixel offset.

## Coordinate frames

Apple's window sits at origin (0, 33) and is 1291 × 949 in the captures below. NetEase's
window is 1512 × 949 and its `<html>` carries `zoom: 2`, so `getBoundingClientRect` there
reports double the painted frame — see the note in the README.

## The queue panel

Panel: 585.5pt wide, right edge at x 1235.5, top at y 108.

**Pills** — band captured from screen 650, 108, 580 × 52:

| | |
|---|---|
| height | 36.0pt |
| width | 271.5pt |
| gap between them | 17.5pt |
| clear on each side | 13pt |
| fill | rgb(209, 208, 204), **opaque** — not glass |

The opacity matters. The mark's holes show the pill, not the album wash behind it, which is
what lets both glyphs be plain unfilled circles instead of needing a second shape.

**AutoPlay** — a lemniscate. Reading the ink run per scanline at the vertical midpoint gives
three runs: the two outer strokes and one continuous 8px blob through the middle. That blob
*is* the crossing. Solved back to a pair of equal rings: outer radius 4.5pt, stroke 1.5pt,
centres 9.5pt apart. Ink 18.5 × 8.5pt.

The AX label for the control reads `Infinity symbol AutoPlay`, which agrees.

**AutoMix** — two hollow rings of the same construction, overlapping harder: outer radius
6.0pt, stroke 2.0pt, centres 8.25pt apart. Ink 20.5 × 12.0pt.

At mid-height its scanline reads:

```
####.............########........########
```

The 8px merged run left of centre is both lobes' strokes landing on top of each other. It
reads as a filled disc at a glance. It is not filled, and the previous evenodd path — a ring
plus a solid right lobe — was wrong in both topology and size.

**Row `…`** — six rows deep in the live Up Next queue, captured from screen 1000, 180 at
250 × 300pt:

| | measured |
|---|---|
| dot diameter | 2.00pt |
| centre pitch | 5.50pt |
| total ink | 13.00pt |
| inset from the panel's right edge | 31.0pt |
| resting alpha | **.193** |
| hover | tinted, not brightened |

The alpha is solved per channel rather than guessed. Wash beside the dots: rgb(100, 89, 73).
Dot core: rgb(125, 117, 106). White-over-wash gives .195 / .194 / .195 — neutral across all
three channels, which is the signature of a white mark and not a tinted one.

Hover is different in kind: .313 red against .066 green and .125 blue, reproduced on two
separate rows. So it takes the artwork's own colour rather than a fixed tint, which is why
`--kabi-accent` exists.

## The footer

Both buttons are `AXCheckBox`, 56 × 56pt hit areas — **overlapping boxes on a 36pt pitch**,
which is the part that is easy to get wrong by reading them as two separate targets:

| | |
|---|---|
| lyrics button | x 1199, y 925.5 |
| queue button | x 1235, y 925 |
| hit area | 56 × 56pt each |
| pitch | 36pt |
| pill span | 1199 → 1291 = 92pt, flush to the window's right and bottom edges |

Identifiers: `Music.nowPlaying.footerButton.lyrics`, `Music.nowPlaying.footerButton.queue`,
`Music.nowPlaying.playbackSlider`.

## Traps this measurement work hit

Worth writing down, because each one cost real time and none of them announce themselves.

**A display-wide `SCContentFilter` returns zero frames when the target window is on a
background Space.** `startCapture()` succeeds, and then no callbacks arrive — which is
byte-for-byte indistinguishable from a TCC permission failure. Filtering on the window itself
(`SCContentFilter(desktopIndependentWindow:)`) also failed here. `screencapture -x -R` works
reliably; TCC was never the blocker.

**ScreenCaptureKit traps with `CGS_REQUIRE_INIT`** unless AppKit is initialised first in the
same process. `_ = NSApplication.shared` has to come before any AX or CoreGraphics window
server call, not after.

**Instruments lie more often than the app does.** Twice in one session a measurement tool
reported a fault on a page that was plainly rendering correctly: once a container query
matched a stale node, once an accessibility tree was read while the target app had lost the
foreground between the press and the capture. Both were fixed by asking the compositor
(`document.elementFromPoint` over a grid, sampled every animation frame) instead of trusting a
selector. When an instrument disagrees with the screen, the instrument is wrong until proven
otherwise.

**Pointer state has to be captured in the same breath as the frame.** Apple's hover states
only exist while the pointer is over the control, and activating an app between the warp and
the screenshot loses the frontmost app. Sequence matters: warp, *then* activate, *then*
capture.

**`<html>` has `zoom: 2` in NetEase.** `innerWidth` says 3024, the painted viewport is 1512.
Only `position: fixed` coordinates are in the painted frame. Any layout number measured
against the wrong frame is wrong by exactly 2×, which reads as "the layout is subtly off" and
is not.
