# Play/pause replacement — stage 87

This change builds on stage86, preserving its command routing, settings, typography,
queue and geometry. No Apple executable code or binary symbol asset is copied into the payload.

## Observed source

- Apple Music arm64 executable SHA256: `92ef3f2a6b2daf100be76c314ca845a1f646710bf62295b6bc6f686ecf25756d`.
- Native target: `Music.nowPlaying.playbackTransportControl`, AX28×28pt hit box.
- Screen region195,714,250,66pt, captured500×132px. Two AXPress actions:
  Play→Pause→Play, restoring the initial paused state. Playback position was not reset.
- The recording advertises120fps, but its presentation timestamps are irregular.
  Transition samples are16.7–41.7ms apart; this is **not** a120fps measurement.
- It is **not path morphing**. The old glyph scales down/fades out while the new glyph
  scales up/fades in; incoming scale peaks around1.09, settles around550ms.
- Stable thresholded ink bounds: play48×54px; pause42×55px, at2px/pt.

## Reconstruction

Stable play/pause frames from the same recording form two luminance templates.
Grid-search scale step .01; solve nonnegative two-template relative alpha by least squares.
The trace stores actual presentation times, not frame-index-derived times.
Median/max normalised per-pixel residual over the first550ms:

| Direction | Median RMSE | Max RMSE |
|---|---:|---:|
| play→pause | .01718 | .03436 |
| pause→play | .01273 | .02290 |

`TRANSPORT-MOTION-SAMPLES.json` retains the fit output without screenshots, song data,
or personal paths. Alpha below .025 makes hidden-layer scale unobservable; those entries
are normalised in the implementation. The first settled sample at550ms is set to the
stable endpoint. This is a bounded reconstruction from one pair of transitions, **not**
Apple's internal timing definition or a claim of pixel-perfect equality.

The existing path contours remain reconstructed. Their CSS width/height now match
measured ink bounds; this does not establish contour identity.

## Integration and safeguards

`syncPlayGlyph` keeps two SVG layers, animated by the browser compositor using linear
interpolation between measured samples. Only a model-state change starts replacement;
first mount is immediate. Native `playing/switchResumeOrPause` remains the only playback
action. The accessible label changes between播放/暂停 with the host state.

Retargeting takes current computed presentation, cancels previous animations, then
continues to the new endpoint. Reduced-motion starts immediately at the endpoint;
changing the preference mid-flight also cancels both animations and settles.

Directly checked in NetEase: both directions,75ms reversal, reduced-motion before and
during animation, then original paused state restored. Baseline86 and restored86 hard-cut
one SVG with no animation; modified87 uses two layers, changing scale/opacity and no
remaining animation at rest. No broader regression suite was run.

## Not covered

Previous/next glyph motion, pointer/keyboard pressed feedback, favourite/shuffle/repeat
symbol effects, full artwork/entrance animation equivalence, other Music/macOS versions.
This change does not publish a new release or replace the existing v0.1.1 download.
