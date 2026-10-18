# Stage89 — previous/next activation and lyric-off queue layout

Built on stage87, preserving its measured play/pause replacement, cc stage86 features,
settings and native command routing. This is a local source update, not a new release.

## Previous/next reference

- Reference executable: Apple Music arm64, SHA256
  `92ef3f2a6b2daf100be76c314ca845a1f646710bf62295b6bc6f686ecf25756d`.
- Native identifiers: `Music.nowPlaying.leadingTransportControl` and
  `Music.nowPlaying.trailingTransportControl`; AX hit boxes48×48pt.
- One6s native screen recording, region195,714,250,66pt captured500×132px:
  Next then Previous via AXPress. Original track ID, paused state and1.052s position
  verified restored after capture. No Apple app modifications or asset extraction.
-234 decoded frames and234 matching presentation timestamps. Do not mistake advertised
  120fps for actual cadence: transition gaps range16.7–50ms.
- Stable two-arrow ink is66×38px at2px/pt (33×19pt). Each glyph layer is16.5×19pt.
  Existing reconstructed rounded-play contour is reused, not a shipped Apple path asset.
- The animation is not whole-button scaling: a new trailing-side arrow grows in, a
  full-size middle arrow moves one slot, and the outgoing arrow shrinks/fades away.
  Previous is spatially mirrored but retains its separately measured timings.

## Measurement and reconstruction limits

Subtract a locally fitted RGB background plane, estimate white-ink alpha, fit a stable
single-arrow template to each transition. Use disjoint ink components to seed the small
layers, avoiding low-opacity local minima that can mistake the main arrow edge for one.
Coordinate descent fits per-layer x, scale and relative opacity; hidden-layer geometry
is not identifiable and is normalised below the visibility threshold.

The public `SKIP-MOTION-SAMPLES.json` contains numerical samples only, no screen imagery,
song names, user library metadata, tokens or local usernames. The payload replays these
samples with linear interpolation, caps fitted relative alpha at1, and lands on stable
endpoints after each recorded window. This is a visual reconstruction of one activation
per direction, not Apple's internal timing definition or pixel-perfect equivalence.

The three SVG layers stay mounted. Animation completion restores an equivalent two-arrow
rest pose. Repeated accepted clicks dispatch their native command immediately, cancelling
old effects and retargeting from current presentation instead of accumulating animation
queues. Reduced-motion skips the effect; enabling it mid-flight settles all three layers.
There is no invented long-press repeat behaviour. Pointer-down/held feedback is not covered.

## Lyric-off queue bug

Stage87's `layoutLeft()` reserved the right column only for `footLyricsOn()`.
Therefore lyricsOFF→queueOPEN→click queue track kept artwork and song information
centred under the queue, rather than shifting them to the left quarter.

Stage89 derives column occupancy from **either visible component**:

```
left-column = (cfg.lyrics && footLyricsOn()) || (cfg.queue && footQueueOpen())
```

The manual lyric preference is never changed by opening/playing/closing the queue.
With neither component visible, the artwork and rail return to centre. The same rule
covers config.lyrics=false and ignores a disabled queue component.

Existing artwork/rail left transitions are retained; their .65s curve is not newly
claimed as measured Apple motion. Geometry checks wait until those transitions settle
rather than treating a mid-transition rectangle as the final layout.

## First-mount correction

An intermediate88 build installed the new glyphs before the legacy icon assignment,
which then overwrote them. Activation repaired that lazily, so the click-only check missed
it.89 installs the three-layer glyphs in the canonical icon setup instead; a fresh-mount
check observes three layers and33×19pt before either button has ever been pressed.

Measured fit residuals (normalised per pixel): next median .01567 / max .02330;
previous median .01397 / max .01972. Replay windows are700ms /683.333ms respectively;
these are captured presentation windows, not internal framework duration constants.

## Direct checks

Scoped native-model/DOM checks: previous and next both change the host track; three layer
animations run then settle; lyricOFF and config.lyrics=false scenarios open and play a
**different** visible queue track; artwork/rail use the left column, then return to centre
on close without turning lyrics on. Baseline87 and restored87 retain the original bug
and static skip icons. Rollback uses a separate copy with hash equality before restoring89.
No full suite, build, new release or whole-app1:1 claim.
