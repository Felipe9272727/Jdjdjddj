#!/usr/bin/env python3
"""Assemble the bellhop idle from authored key poses and in-betweens.

This script deliberately does not invent motion.  It only performs the safe
post-processing steps from the 2D animation pipeline: frame extraction,
counter registration, static-counter compositing, atlas packing and QC.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat


FRAME_SIZE = 314
TARGET_COUNTER_Y = 222
TARGET_COUNTER_X = FRAME_SIZE // 2


def natural_key(path: Path) -> tuple[object, ...]:
    return tuple(
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", path.name)
    )


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != (FRAME_SIZE, FRAME_SIZE):
        raise ValueError(f"{path}: expected {FRAME_SIZE}x{FRAME_SIZE}, got {image.size}")
    return image


def counter_anchor(image: Image.Image) -> tuple[int, int]:
    """Find the counter's long, persistent horizontal silhouette."""
    alpha = image.getchannel("A")
    threshold = int(FRAME_SIZE * 0.64)
    row_data: list[tuple[int, int, int] | None] = []
    for y in range(int(FRAME_SIZE * 0.68), int(FRAME_SIZE * 0.91)):
        best_start = best_end = 0
        run_start: int | None = None
        for x in range(FRAME_SIZE + 1):
            opaque = x < FRAME_SIZE and alpha.getpixel((x, y)) > 32
            if opaque and run_start is None:
                run_start = x
            elif not opaque and run_start is not None:
                if x - run_start > best_end - best_start:
                    best_start, best_end = run_start, x
                run_start = None
        row_data.append(
            (y, best_start, best_end)
            if best_end - best_start >= threshold
            else None
        )

    lower = [row for row in row_data if row is not None and row[0] >= int(FRAME_SIZE * 0.80)]
    if lower:
        centers = sorted((row[1] + row[2]) / 2 for row in lower)
        widths = sorted(row[2] - row[1] for row in lower)
        stable_center = centers[len(centers) // 2]
        stable_width = widths[len(widths) // 2]
        for index in range(len(row_data) - 5):
            run = row_data[index:index + 6]
            if all(
                row is not None
                and abs(((row[1] + row[2]) / 2) - stable_center) <= 5
                and row[2] - row[1] >= stable_width * 0.90
                for row in run
            ):
                valid = [row for row in run if row is not None]
                return round(stable_center), valid[0][0]

    groups: list[list[tuple[int, int, int]]] = []
    current: list[tuple[int, int, int]] = []
    for row in row_data + [None]:
        if row is None:
            if current:
                groups.append(current)
                current = []
        else:
            current.append(row)
    if groups:
        rows = max(groups, key=len)
        if len(rows) >= 6:
            left = sorted(row[1] for row in rows)[len(rows) // 2]
            right = sorted(row[2] for row in rows)[len(rows) // 2]
            return (left + right) // 2, rows[0][0]

    raise ValueError("counter anchor not found")


def translated(image: Image.Image, dx: int, dy: int) -> Image.Image:
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.alpha_composite(image, (dx, dy))
    return canvas


def normalize_drawing(image: Image.Image, canonical: Image.Image) -> Image.Image:
    anchor_x, anchor_y = counter_anchor(image)
    registered = translated(
        image,
        TARGET_COUNTER_X - anchor_x,
        TARGET_COUNTER_Y - anchor_y,
    )

    # The counter is scenery, not acting.  Reusing the exact same pixels in
    # every drawing removes the mobile "flash" caused by a slightly changing
    # logo, width or wood grain.  The character remains in front: a short
    # dilation of the above-counter silhouette preserves fingers resting on
    # the rim without leaking the generated counter into the result.
    result = Image.new("RGBA", registered.size, (0, 0, 0, 0))
    result.paste(
        canonical.crop((0, TARGET_COUNTER_Y, FRAME_SIZE, FRAME_SIZE)),
        (0, TARGET_COUNTER_Y),
    )
    alpha = registered.getchannel("A")
    above = Image.new("L", registered.size, 0)
    above.paste(alpha.crop((0, 0, FRAME_SIZE, TARGET_COUNTER_Y)), (0, 0))
    foreground = above.filter(ImageFilter.MaxFilter(11))
    foreground = ImageChops.multiply(foreground, alpha)
    cutoff = Image.new("L", registered.size, 0)
    cutoff.paste(255, (0, 0, FRAME_SIZE, TARGET_COUNTER_Y + 12))
    foreground = ImageChops.multiply(foreground, cutoff)
    result.paste(registered, (0, 0), foreground)
    return result


def frame_hash(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def pack_atlas(frames: list[Image.Image], columns: int) -> Image.Image:
    rows = (len(frames) + columns - 1) // columns
    atlas = Image.new("RGBA", (columns * FRAME_SIZE, rows * FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(
            frame,
            ((index % columns) * FRAME_SIZE, (index // columns) * FRAME_SIZE),
        )
    return atlas


def save_exact_indexed_png(image: Image.Image, output: Path) -> None:
    indexed = image.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(output, "PNG", optimize=True, compress_level=9)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--keys", type=Path, required=True)
    parser.add_argument("--principal", type=Path, required=True)
    parser.add_argument("--micro", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def numbered_frames(folder: Path, prefix: str, count: int) -> list[Image.Image]:
    paths = sorted(folder.glob(f"{prefix}-*.png"), key=natural_key)
    if len(paths) != count:
        raise ValueError(f"{folder}: expected {count} {prefix} frames, found {len(paths)}")
    return [load_rgba(path) for path in paths]


def main() -> None:
    args = parse_args()
    baseline = load_rgba(args.baseline)
    keys = numbered_frames(args.keys, "idle-keys", 4)
    principal = numbered_frames(args.principal, "idle-principal", 8)
    micro = numbered_frames(args.micro, "idle-micro", 10)

    # Visual-QC order: two small blink/breathing arcs and a clean return to
    # neutral. P5, P6 and M5 were deliberately rejected: each changed the
    # silhouette more than every available neighbouring drawing, so keeping
    # them would create the exact one-frame pop this pass is meant to remove.
    authored = [
        micro[6], micro[8], principal[2], micro[3], micro[9],
        principal[3], principal[7], micro[1], micro[2], principal[1],
        principal[0], principal[6], micro[0], micro[5], micro[7],
        keys[2], keys[1], keys[0], keys[3],
    ]
    frames = [baseline] + [normalize_drawing(frame, baseline) for frame in authored] + [baseline]
    if len(frames) != 21:
        raise AssertionError(f"expected 21 idle frames, got {len(frames)}")

    hashes = [frame_hash(frame) for frame in frames]
    if hashes[0] != hashes[-1]:
        raise AssertionError("loop endpoint must be an exact copy of the baseline")
    if len(set(hashes)) != 20:
        raise AssertionError("idle must contain 20 unique drawings plus its repeated endpoint")

    panel_box = (0, TARGET_COUNTER_Y + 18, FRAME_SIZE, FRAME_SIZE)
    panel_hashes = {frame_hash(frame.crop(panel_box)) for frame in frames}
    if len(panel_hashes) != 1:
        raise AssertionError("static counter pixels drift between idle frames")

    black = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 255))
    visible_frames = [Image.alpha_composite(black, frame).convert("RGB") for frame in frames]
    transition_deltas = [
        sum(ImageStat.Stat(ImageChops.difference(left, right)).mean) / 3
        for left, right in zip(visible_frames, visible_frames[1:])
    ]
    if max(transition_deltas) > 9.0:
        raise AssertionError(
            f"idle contains an abrupt frame transition ({max(transition_deltas):.2f})"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas = pack_atlas(frames, columns=4)
    if args.output.suffix.lower() != ".png":
        raise ValueError("the runtime atlas must use indexed PNG for exact repeated scenery")
    save_exact_indexed_png(atlas, args.output)

    durations = [
        420, 90, 90, 120, 160, 100, 100,
        120, 100, 100, 100, 120, 100, 100,
        100, 120, 140, 160, 140, 180, 500,
    ]
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        frames[0].save(
            args.preview,
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            disposal=2,
            transparency=0,
        )

    report = {
        "frameSize": FRAME_SIZE,
        "columns": 4,
        "frameCount": len(frames),
        "uniqueDrawings": len(set(hashes)),
        "rejectedDrawings": ["principal-5", "principal-6", "micro-5"],
        "loopEndpointExact": hashes[0] == hashes[-1],
        "staticCounterPanels": len(panel_hashes),
        "meanFrameDelta": round(sum(transition_deltas) / len(transition_deltas), 2),
        "maxFrameDelta": round(max(transition_deltas), 2),
        "cycleMs": sum(durations),
        "format": "indexed-png-256",
        "output": str(args.output),
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
