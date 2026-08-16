#!/usr/bin/env python3
"""Stabilize authored bellhop atlases without changing their performances."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def counter_anchor(image: Image.Image) -> tuple[int, int]:
    width, height = image.size
    alpha = image.getchannel("A")
    threshold = int(width * 0.64)
    rows: list[tuple[int, int, int] | None] = []
    for y in range(int(height * 0.68), int(height * 0.91)):
        best_start = best_end = 0
        run_start: int | None = None
        for x in range(width + 1):
            opaque = x < width and alpha.getpixel((x, y)) > 32
            if opaque and run_start is None:
                run_start = x
            elif not opaque and run_start is not None:
                if x - run_start > best_end - best_start:
                    best_start, best_end = run_start, x
                run_start = None
        rows.append(
            (y, best_start, best_end)
            if best_end - best_start >= threshold
            else None
        )

    lower = [row for row in rows if row is not None and row[0] >= int(height * 0.80)]
    if lower:
        centers = sorted((row[1] + row[2]) / 2 for row in lower)
        widths = sorted(row[2] - row[1] for row in lower)
        stable_center = centers[len(centers) // 2]
        stable_width = widths[len(widths) // 2]
        for index in range(len(rows) - 5):
            run = rows[index:index + 6]
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
    for row in rows + [None]:
        if row is None:
            if current:
                groups.append(current)
                current = []
        else:
            current.append(row)
    if groups:
        valid = max(groups, key=len)
        if len(valid) >= 6:
            left = sorted(row[1] for row in valid)[len(valid) // 2]
            right = sorted(row[2] for row in valid)[len(valid) // 2]
            return (left + right) // 2, valid[0][0]
    raise ValueError("counter anchor not found")


def translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    result.alpha_composite(image, (dx, dy))
    return result


def split_atlas(atlas: Image.Image, cell: int, columns: int, count: int) -> list[Image.Image]:
    frames = []
    for index in range(count):
        x = (index % columns) * cell
        y = (index // columns) * cell
        frames.append(atlas.crop((x, y, x + cell, y + cell)).convert("RGBA"))
    return frames


def save_exact_indexed_png(image: Image.Image, output: Path) -> None:
    indexed = image.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(output, "PNG", optimize=True, compress_level=9)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--cell", type=int, default=314)
    parser.add_argument("--target-y", type=int, required=True)
    parser.add_argument("--target-x", type=int)
    parser.add_argument("--counter-source", type=Path)
    parser.add_argument("--lock-offset", type=int, default=40)
    parser.add_argument("--full-counter", action="store_true")
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    atlas = Image.open(args.input).convert("RGBA")
    expected_rows = (args.frames + args.columns - 1) // args.columns
    expected_size = (args.columns * args.cell, expected_rows * args.cell)
    if atlas.size != expected_size:
        raise ValueError(f"{args.input}: expected atlas {expected_size}, got {atlas.size}")

    frames = split_atlas(atlas, args.cell, args.columns, args.frames)
    registered = []
    shifts = []
    target_x = args.target_x if args.target_x is not None else args.cell // 2
    for frame in frames:
        x, y = counter_anchor(frame)
        dx = 0 if args.full_counter else target_x - x
        dy = args.target_y - y
        if abs(dx) > 18 or abs(dy) > 18:
            raise ValueError(f"unsafe registration shift ({dx}, {dy}) in {args.input}")
        registered.append(translate(frame, dx, dy))
        shifts.append((dx, dy))

    # Only the lower wooden panel is scenery-locked.  Hands, props and the
    # expressive top rim remain untouched.  This removes the distracting logo
    # shimmer while retaining every authored acting choice.
    if args.counter_source:
        source = Image.open(args.counter_source).convert("RGBA")
        if source.size != (args.cell, args.cell):
            raise ValueError("counter source must be one frame at the selected cell size")
        sx, sy = counter_anchor(source)
        canonical = translate(source, target_x - sx, args.target_y - sy)
    else:
        canonical = registered[0]

    if args.full_counter:
        composited = []
        for frame in registered:
            result = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            result.paste(
                canonical.crop((0, args.target_y, args.cell, args.cell)),
                (0, args.target_y),
            )
            alpha = frame.getchannel("A")
            above = Image.new("L", frame.size, 0)
            above.paste(alpha.crop((0, 0, args.cell, args.target_y)), (0, 0))
            foreground = above.filter(ImageFilter.MaxFilter(11))
            foreground = ImageChops.multiply(foreground, alpha)
            cutoff = Image.new("L", frame.size, 0)
            cutoff.paste(255, (0, 0, args.cell, args.target_y + 12))
            foreground = ImageChops.multiply(foreground, cutoff)
            result.paste(frame, (0, 0), foreground)
            composited.append(result)
        registered = composited
        lock_y = args.target_y + 18
    else:
        lock_y = args.target_y + args.lock_offset
        panel = canonical.crop((0, lock_y, args.cell, args.cell))
        for frame in registered:
            frame.paste(panel, (0, lock_y))

    output = Image.new("RGBA", expected_size, (0, 0, 0, 0))
    for index, frame in enumerate(registered):
        output.alpha_composite(
            frame,
            ((index % args.columns) * args.cell, (index // args.columns) * args.cell),
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() != ".png":
        raise ValueError("the runtime atlas must use indexed PNG for exact repeated scenery")
    save_exact_indexed_png(output, args.output)

    panel_hashes = {
        frame.crop((0, lock_y, args.cell, args.cell)).tobytes()
        for frame in registered
    }
    if len(panel_hashes) != 1:
        raise AssertionError(f"static counter panel drift remains in {args.output}")

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "frameCount": args.frames,
        "cell": args.cell,
        "targetAnchor": [target_x, args.target_y],
        "maxShiftX": max(abs(dx) for dx, _ in shifts),
        "maxShiftY": max(abs(dy) for _, dy in shifts),
        "lockedPanelFromY": lock_y,
        "fullCounterLock": args.full_counter,
        "staticPanelVariants": len(panel_hashes),
        "format": "indexed-png-256",
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
