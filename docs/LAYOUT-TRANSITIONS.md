# Stage90 — artwork/title coupling and native underlay transitions

Two narrowly scoped fixes on top of89; skip and play/pause animation logic unchanged.

## Artwork/title relationship

The old artwork used width×.28 while the title stayed at height×596.5/949. Those
independent anchors happen to agree at a1291×949 window but overlap at1512×949:
playing artwork bottom609pt, title top596.5pt, gap **−12.5pt**.

Native Apple Music AX was read at three sizes in both paused and playing states.
Screen y values have the window's33pt top offset removed below:

| Window | Artwork top | Artwork height | Title top | Gap |
|---|---:|---:|---:|---:|
|1291×949 |216 |361.5 |596.5 |19 |
|1512×949 |185 |423.5 |627.5 |19 |
|1512×800 |110.5 |423.5 |553 |19 |

Paused/playing report the same layout frames; the visible artwork's play/pause scale
is separate. Native window size, paused state and75.138999938965s position were restored.
The reference title/subtitle font and internal spacing are not changed by this fix.

The coupled layout, in painted points, is:

```
size = snap(.28 * viewportWidth)
top = snap((viewportHeight - size) / 2 - 78)
headTop = top + size + 19
```

`snap` uses device pixels. All three measured2px/pt samples fit with0pt residual.
The constants78 and19 are derived from these samples, not chosen to conceal overlap.
Final installed1512×949 view: artwork top185,height423.5,bottom608.5;
title top627.5, gap19pt. Horizontal lyric/queue occupancy remains the stage89 rule.

## Blank page behind opening/closing player

Native host behaviour, verified in its shipped JavaScript and current styles:

- `opening` / `closing` clear `body.vinyl-mode`, restoring native content visibility.
- `opened` may enable that class after1s, to cull the fully occluded main page.
- `.vinyl-mode .should-hide-under-vinyl-mode {content-visibility:hidden}` is host-owned.

The plugin added `html.kabi-on .should-hide-under-vinyl-mode {visibility:hidden!important}`.
Since `kabi-on` correctly remains active throughout player entrance/exit (preventing an
unstyled-player flash), that rule kept the underlying main page hidden during the whole
transition. The host had already restored it, but could not beat the plugin's rule.

Stage90 removes the offending rule at its source. It also scopes the existing host-facing
selectors to `#vinyl-page-container`, so native page headers, footer, covers and tabs are
not restyled globally while exposed.78 existing selector occurrences were scoped; no
late override stylesheet, blank masking layer or invented replacement animation was added.
The host still owns underlay culling while the player is fully open.

## Evidence and limits

Same original opener/closer input, per-rAF observations. Baseline89 and restored89:
all sampled exposed frames hide the main page (baseline43/43 in each direction;
rollback43 opening and42 closing). Modified90: no missing
main-page visibility samples; native player title remains suppressed throughout, preserving
the earlier flash fix. The final probe additionally uses compositor `elementFromPoint`
hit checks on exposed sidebar/nav/content, not only computed CSS flags.

The first summary counted an opacity0 **decorative background** as missing main content.
Its raw samples showed all essential nodes visible. The summary was corrected to the
actual sidebar/nav/main-content nodes, and compositor-hit checks were added to verify
that correction. No implementation workaround was added for a probe error.

The local four-role artifacts retain raw outputs, baseline/restored hashes and command
statuses. No broad suite, build, release or full Apple entrance-curve equivalence claim.
