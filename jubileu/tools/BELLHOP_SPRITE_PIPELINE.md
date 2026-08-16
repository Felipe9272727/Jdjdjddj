# Bellhop sprite pipeline

The lobby receptionist uses authored key poses and in-betweens. Python is only
used for deterministic production work: chroma cleanup, extraction, shared
registration, static-counter locking, atlas packing and QC. It never generates
or interpolates poses.

## Animation rules

- Draw extremes first, then principal in-betweens, then micro in-betweens.
- Keep the camera, counter, hat size, shoulder width and hand contact points
  fixed unless their movement is part of the performance.
- Use anticipation, follow-through, arcs, overshoot and unequal timing; do not
  make every drawing equally spaced.
- Repeat only the closing neutral drawing required for a seamless loop.
- The counter is scenery. Its lower panel must be byte-identical throughout an
  atlas so its logo and wood grain cannot flash on mobile screens.
- Export indexed 256-color PNG. It keeps repeated scenery pixel-identical,
  avoids the purple alpha halos of lossy WebP and is substantially smaller
  than lossless WebP for these deliberately limited-color drawings.

## Idle assembly

After the raw magenta sheets have passed `generate2dsprite.py process`, run:

```sh
python3 tools/bellhop-keyframe-pipeline.py \
  --baseline /path/to/bellhop-baseline.png \
  --keys /path/to/processed/keys \
  --principal /path/to/processed/principal \
  --micro /path/to/processed/micro \
  --output src/assets/shop/bellhop-idle-atlas-v8.png \
  --preview /tmp/bellhop-idle-v8.gif \
  --report /tmp/bellhop-idle-v8.json
```

The resulting loop has 21 frames: one exact neutral, 19 authored transition
drawings, and one exact copy of the opening neutral. Three generated drawings
are rejected by visual continuity review instead of being kept merely to make
the frame count larger. The assembler also rejects a black-composited adjacent
frame delta above 9, which catches large one-frame silhouette pops.

## Existing performance stabilization

Do not redraw an approved performance merely to fix camera jitter. Register the
counter and lock only its lower scenery panel:

```sh
python3 tools/bellhop-atlas-stabilizer.py \
  --input src/assets/shop/bellhop-conversation-atlas-v6.webp \
  --output src/assets/shop/bellhop-conversation-atlas-v8.png \
  --columns 5 --frames 25 --cell 314 --target-y 222 \
  --counter-source /path/to/bellhop-baseline.png
```

Review the atlas and animated preview at native size before changing runtime
timing. Spatial stabilization and timing are separate animation decisions.
