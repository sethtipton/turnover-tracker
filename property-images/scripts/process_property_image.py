#!/usr/bin/env python3
"""Crop a Street View screenshot to 4:3 and export a standard WebP."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageStat


FINAL_SIZE = (1024, 768)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop a property screenshot, resize it, and export high-quality WebP."
    )
    parser.add_argument("input", type=Path, help="Source screenshot")
    parser.add_argument("output", type=Path, help="Destination .webp file")
    parser.add_argument(
        "--crop",
        nargs=4,
        type=int,
        metavar=("LEFT", "TOP", "WIDTH", "HEIGHT"),
        required=True,
        help="Pixel crop rectangle; WIDTH:HEIGHT must equal 4:3",
    )
    parser.add_argument("--quality", type=int, default=90, help="WebP quality (1-100)")
    parser.add_argument(
        "--normalize-input-png",
        action="store_true",
        help="If a .png input contains another image encoding, rewrite it as a real PNG",
    )
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(2)


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        fail(f"input does not exist: {args.input}")
    if args.output.suffix.lower() != ".webp":
        fail("output filename must use the .webp extension")
    if not 1 <= args.quality <= 100:
        fail("quality must be between 1 and 100")

    left, top, width, height = args.crop
    if min(left, top) < 0 or min(width, height) <= 0:
        fail("crop coordinates and dimensions must be positive")
    if width * 3 != height * 4:
        fail(f"crop must be exactly 4:3; received {width}x{height}")

    with Image.open(args.input) as opened:
        actual_format = opened.format
        image = opened.convert("RGB")

    source_width, source_height = image.size
    if left + width > source_width or top + height > source_height:
        fail(
            f"crop ({left}, {top}, {width}, {height}) exceeds "
            f"source bounds {source_width}x{source_height}"
        )

    if args.input.suffix.lower() == ".png" and actual_format != "PNG":
        if not args.normalize_input_png:
            fail(
                f"{args.input.name} has a .png extension but contains {actual_format}; "
                "rerun with --normalize-input-png"
            )
        temporary_png = args.input.with_name(f".{args.input.name}.tmp.png")
        image.save(temporary_png, format="PNG", optimize=True)
        os.replace(temporary_png, args.input)
        print(f"normalized raw screenshot to PNG: {args.input}", file=sys.stderr)

    upscale_factor = max(FINAL_SIZE[0] / width, FINAL_SIZE[1] / height)
    if upscale_factor > 1.5:
        print(
            f"warning: crop will be upscaled {upscale_factor:.2f}x; "
            "inspect the final image for softness",
            file=sys.stderr,
        )

    cropped = image.crop((left, top, left + width, top + height))
    resized = cropped.resize(FINAL_SIZE, Image.Resampling.LANCZOS, reducing_gap=3.0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    resized.save(args.output, format="WEBP", quality=args.quality, method=6)

    with Image.open(args.output) as verified:
        if verified.format != "WEBP":
            fail(f"verification failed: expected WEBP, got {verified.format}")
        if verified.size != FINAL_SIZE:
            fail(f"verification failed: expected {FINAL_SIZE}, got {verified.size}")
        luminance = verified.convert("L")
        extrema = luminance.getextrema()
        stddev = ImageStat.Stat(luminance).stddev[0]
        if extrema[1] - extrema[0] < 20 or stddev < 5:
            fail("verification failed: output appears blank or nearly uniform")
    if args.output.stat().st_size < 10_000:
        fail("verification failed: output file is unexpectedly small")

    print(
        json.dumps(
            {
                "input": str(args.input),
                "sourceFormat": actual_format,
                "rawDimensions": {"width": source_width, "height": source_height},
                "crop": {"left": left, "top": top, "width": width, "height": height},
                "finalDimensions": {"width": FINAL_SIZE[0], "height": FINAL_SIZE[1]},
                "quality": args.quality,
                "output": str(args.output),
                "outputBytes": args.output.stat().st_size,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
