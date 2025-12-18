#!/usr/bin/env python3
"""
Frame Interpolation for Transformation Sequences
Uses RIFE (Real-Time Intermediate Flow Estimation) for smooth frame interpolation.

Creates 90 frames (3 seconds at 30fps) from 16 source images.
"""

import os
import sys
import subprocess
from pathlib import Path
import shutil

# Paths
RIFE_PATH = Path(__file__).parent.parent / "tools" / "rife"
RIFE_MODEL_PATH = Path("/mnt/c/ai_models/flow/rife_v4.25")

def check_rife_installed():
    """Check if Practical-RIFE is available"""
    if not RIFE_PATH.exists():
        return False
    if not (RIFE_MODEL_PATH / "flownet.pkl").exists():
        return False
    return True

def remove_background_from_frame(img_path: Path):
    """Remove background from a single frame using rembg"""
    try:
        from rembg import remove
        from PIL import Image

        with open(img_path, 'rb') as f:
            input_data = f.read()

        output_data = remove(input_data)

        with open(img_path, 'wb') as f:
            f.write(output_data)

        return True
    except Exception as e:
        print(f"  rembg error: {e}")
        return False

def interpolate_with_rife(input_dir: Path, output_dir: Path, target_frames: int = 90, exp: int = 4, remove_bg: bool = True):
    """
    Interpolate frames using Practical-RIFE via subprocess.
    Uses ALL generated frames for smoothest possible transitions.

    Args:
        input_dir: Directory containing source images
        output_dir: Directory to save interpolated frames
        target_frames: Ignored - uses all frames for smooth transitions
        exp: RIFE exp parameter (2^exp frames per pair). Default 4 = 16 frames/pair
        remove_bg: Whether to run rembg on interpolated frames to remove white background
    """
    from PIL import Image
    import tempfile

    # Get source images in order
    source_images = sorted(input_dir.glob("*.png"))
    if len(source_images) < 2:
        print(f"Need at least 2 images, found {len(source_images)}")
        return

    num_sources = len(source_images)
    frames_per_pair = 2 ** exp  # e.g., exp=4 -> 16 frames per pair
    estimated_total = (num_sources - 1) * (frames_per_pair - 1) + 1

    print(f"Source images: {num_sources}")
    print(f"RIFE exp: {exp} (generates {frames_per_pair} frames per pair)")
    print(f"Estimated total frames: ~{estimated_total}")

    output_dir.mkdir(exist_ok=True)

    # Clear existing frames
    for f in output_dir.glob("frame_*.png"):
        f.unlink()

    frame_idx = 0

    for i in range(len(source_images) - 1):
        img1_path = source_images[i]
        img2_path = source_images[i + 1]

        # Run RIFE HD for this pair
        cmd = [
            sys.executable, str(RIFE_PATH / "inference_img_hd.py"),
            "--img", str(img1_path), str(img2_path),
            "--exp", str(exp),
            "--model", str(RIFE_MODEL_PATH),
            "--output", str(RIFE_PATH / "output")
        ]

        result = subprocess.run(
            cmd,
            cwd=str(RIFE_PATH),
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print(f"RIFE error for pair {i}: {result.stderr[:200]}")
            # Fallback: just copy the first image
            img1 = Image.open(img1_path)
            output_path = output_dir / f"frame_{frame_idx:04d}.png"
            img1.save(output_path)
            frame_idx += 1
        else:
            # RIFE outputs img0.png to img{n}.png
            # Sort numerically, not alphabetically
            rife_outputs = sorted(
                (RIFE_PATH / "output").glob("img*.png"),
                key=lambda x: int(x.stem.replace('img', ''))
            )

            # Copy all frames EXCEPT the last one (will be first of next pair)
            # For the last pair, we'll include all frames
            frames_to_copy = rife_outputs[:-1] if i < len(source_images) - 2 else rife_outputs

            for src in frames_to_copy:
                output_path = output_dir / f"frame_{frame_idx:04d}.png"
                shutil.copy(src, output_path)
                frame_idx += 1

            # Clean up RIFE output
            for f in rife_outputs:
                f.unlink()

        print(f"  Processed {i+1}/{len(source_images)-1} pairs (frames so far: {frame_idx})")

    print(f"Total frames generated: {frame_idx}")

    # Post-process: remove background from all interpolated frames
    if remove_bg:
        print(f"\nRemoving backgrounds from {frame_idx} frames...")
        all_frames = sorted(output_dir.glob("frame_*.png"))
        for i, frame_path in enumerate(all_frames):
            remove_background_from_frame(frame_path)
            if (i + 1) % 20 == 0:
                print(f"  Processed {i+1}/{len(all_frames)} frames")
        print(f"  Background removal complete!")

    return frame_idx

def interpolate_simple(input_dir: Path, output_dir: Path, target_frames: int = 90):
    """Simple linear interpolation using PIL (fallback)"""
    from PIL import Image

    source_images = sorted(input_dir.glob("*.png"))
    if len(source_images) < 2:
        print(f"Need at least 2 images, found {len(source_images)}")
        return

    num_sources = len(source_images)
    gaps = num_sources - 1
    frames_per_gap = (target_frames - num_sources) // gaps
    extra_frames = (target_frames - num_sources) % gaps

    print(f"Source images: {num_sources}")
    print(f"Target frames: {target_frames}")
    print(f"Frames per gap: {frames_per_gap} (simple blend)")

    output_dir.mkdir(exist_ok=True)

    frame_idx = 0
    for i in range(len(source_images) - 1):
        img1 = Image.open(source_images[i]).convert("RGBA")
        img2 = Image.open(source_images[i + 1]).convert("RGBA")

        # Ensure same size
        if img1.size != img2.size:
            img2 = img2.resize(img1.size, Image.LANCZOS)

        # Save first image
        output_path = output_dir / f"frame_{frame_idx:04d}.png"
        img1.save(output_path)
        frame_idx += 1

        # Calculate interpolated frames
        n_interp = frames_per_gap
        if i < extra_frames:
            n_interp += 1

        # Generate blended frames
        for j in range(n_interp):
            alpha = (j + 1) / (n_interp + 1)
            blended = Image.blend(img1, img2, alpha)
            output_path = output_dir / f"frame_{frame_idx:04d}.png"
            blended.save(output_path)
            frame_idx += 1

        print(f"  Processed {i+1}/{len(source_images)-1} gaps")

    # Save last image
    last_img = Image.open(source_images[-1]).convert("RGBA")
    output_path = output_dir / f"frame_{frame_idx:04d}.png"
    last_img.save(output_path)
    frame_idx += 1

    print(f"Total frames generated: {frame_idx}")
    return frame_idx

def create_video(frames_dir: Path, output_path: Path, fps: int = 30):
    """Create video from frames using ffmpeg"""
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", str(frames_dir / "frame_%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuva420p",  # Support transparency
        "-preset", "slow",
        "-crf", "18",
        str(output_path)
    ]

    subprocess.run(cmd, check=True)
    print(f"Video saved: {output_path}")

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", default="jett", help="Character to process")
    parser.add_argument("--all", action="store_true", help="Process all characters")
    parser.add_argument("--frames", type=int, default=90, help="Target frame count (default: 90 for 3s at 30fps)")
    parser.add_argument("--method", choices=["rife", "simple"], default="simple", help="Interpolation method")
    parser.add_argument("--video", action="store_true", help="Also create video")
    args = parser.parse_args()

    base_path = Path(__file__).parent.parent / "assets" / "images" / "characters"

    characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"] if args.all else [args.character]

    for char in characters:
        input_dir = base_path / char / "transform_sequence"
        output_dir = base_path / char / "transform_frames"

        if not input_dir.exists():
            print(f"Skipping {char}: no transform_sequence folder")
            continue

        print(f"\n{'='*50}")
        print(f"Processing {char.upper()}")
        print(f"{'='*50}")

        if args.method == "rife" and check_rife_installed():
            interpolate_with_rife(input_dir, output_dir, args.frames)
        else:
            if args.method == "rife":
                print("RIFE not available, using simple interpolation")
            interpolate_simple(input_dir, output_dir, args.frames)

        if args.video:
            video_path = base_path / char / f"{char}_transform.mp4"
            create_video(output_dir, video_path)

if __name__ == "__main__":
    main()
