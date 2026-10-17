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

**These are screen coordinates, and the section below is page coordinates.** Apple Music's
window sits at (0, 33) — the menu bar — so page y = screen y − 33 and page x = screen x.
Mixing the two is the same mistake as the `zoom: 2` one below, in a smaller disguise: a 33pt
discrepancy that reads as "the footer is nearly right" instead of "the footer is wrong".

## The song info and the transport

**Re-take this section at a 1291pt window.** The numbers above were taken at 1512pt, and
the rail does not scale with the window — it holds its metrics and re-centres — so the two
are not comparable. `axrail` dumps every `Music.nowPlaying.*` control in page coordinates
(window-relative), which is the frame `getBoundingClientRect` reports inside NetEase and so
the two can be differenced directly.

At 1291 × 949, page coordinates:

| control | frame | identifier |
|---|---|---|
| artwork | 190.8, 264.8 · 264 × 264 | `Music.nowPlaying.artwork` |
| title + subtitle | 118, 596.5 · 309.5 × 37.5 | `Music.nowPlaying.title-*.subtitle` |
| favourite | 443.5, 602 · 26 × 26 | `Music.nowPlaying.favoriteButton` |
| context menu | 477.5, 602 · 26 × 26 | `Music.nowPlaying.contextMenu` |
| scrubber | 142, 651 · 361.5 × 15 | `Music.nowPlaying.playbackSlider` |
| elapsed | 142, 668 · 22.5 × 13 | `…playbackSlider.leadingTimestamp` |
| remaining | 474.5, 668 · 29 × 13 | `…playbackSlider.trailingTimestamp` |
| quality | 292, 668 · 62.5 × 13 | `Music.nowPlaying.audioBadge` |
| shuffle | 142, 700 · 30 × 30 | `Music.nowPlaying.leadingAccessoryButton` |
| previous | 213, 691 · 48 × 48 | `Music.nowPlaying.leadingTransportControl` |
| play | 309, 701 · 28 × 28 | `Music.nowPlaying.playbackTransportControl` |
| next | 385, 691 · 48 × 48 | `Music.nowPlaying.trailingTransportControl` |
| repeat | 473.5, 700 · 30 × 30 | `Music.nowPlaying.trailingAccessoryButton` |

Two things in that table are easy to read past.

**The title button's frame is not its text.** It starts at x 118 and the text starts at
143 — 25pt of inset — and the frame's 37.5pt height includes padding above the title's cap
top and below the subtitle's baseline. Differencing the frame against a text block and
reading the mismatch as a bug is the mistake; the ink is what has to land.

**The transport boxes have different heights but one centre.** 48, 28, 30 — and all five
centres sit on page y 715. So they are centred on a line, not top-aligned, which is what
one row height plus `top: 50%` buys. Their x is not a fixed pitch either: the centres are
15 / 95 / 181 / 267 / 346.5 from the column's left edge, so the gaps run 80, 86, 86, 79.5 —
wider in the middle, tighter at the ends. As fractions of the 361.5 column: 4.148,
26.280, 50.069, 73.858, 95.851 %. The accessory pair is flush — shuffle's box starts at
the column's left edge and repeat's ends at its right.

### The type, and why it took two instruments

**Apple exposes no font for this string.** The whole block is one `AXButton` whose
`AXDescription` carries both lines; `AXFont` is empty on it and there is no `AXStaticText`
child to ask instead. That is not a gap in the harness — it was checked by dumping the
subtree under the node. So the size has to come off pixels, and pixels disagree:

| method | title |
|---|---|
| thresholded cap height ÷ an assumed cap ratio | 18.2pt |
| advance width of "Sweet Tangerine" ÷ assumed glyph advances | 13.4pt |

Neither is trustworthy alone; both depend on a constant remembered rather than measured.
What settles it is **calibrating against a face whose size is already known**, and the
replica is one. Its subtitle renders `HOYO-MiX` at exactly 9.8187pt, so its cap band is a
direct reading of SF Pro's cap ratio:

```
HOYO-MiX  cap band 7.00 pt ÷ 9.8187 pt = .7129
```

.7129 against SF Pro's .71 is a thousandth off, which is the check that the ruler is
sound. Apple's title caps then measure **13.00pt** and its subtitle caps **11.00pt**:

```
title    13.00 ÷ .7129 = 18.2 pt   weight 600
subtitle 11.00 ÷ .7129 = 15.4 pt   weight 400
```

Line heights are solved from Apple's **baselines**, not chosen as a ratio. With SF's
ascent .952 and descent .213, a line box of `L` puts its baseline at `L/2 − .007·size`
from the top; inverting Apple's title baseline, 15.9pt below the top of its own block,
gives **18.4**, and the subtitle's, 32.6pt below, gives **17.1**. Those two land both
baselines on 612.4 and 629.1 with nothing left over.

### The mistake that made this look like a font bug

`--u` is the artwork column's scale, `width × 0.28 / 423.4`, and it multiplies every size
in the rail. 423.4 is the column width **at a 1512pt window**. At 1291 it comes out
`.8538`, so the title rendered at 12.8pt and read as a font problem for as long as it took
to notice the scale rather than the size. `--u` also entered a second time, through
`- 58.4 * u` in the stack's pin, which is why the rail sat 22–40pt below Apple's rows
rather than merely being small.

Type and the rail's vertical rhythm are now absolute points, and the stack is pinned to
Apple's song-info block at page y 596.5 of 949. Verified after the change: head top,
both timestamps, and all five transport boxes match Apple to within a rounding step.

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
