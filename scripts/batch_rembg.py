#!/usr/bin/env python3
"""
Batch Background Removal Script
Processes all generated PNG images and removes backgrounds

Usage:
    python scripts/batch_rembg.py                    # Process all character images
    python scripts/batch_rembg.py --characters jett # Process specific character
    python scripts/batch_rembg.py --dry-run         # Preview what would be processed
"""

import argparse
import logging
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import os

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def process_single_image(args):
    """Process a single image (for parallel execution)"""
    input_path, output_path = args

    try:
        from rembg import remove, new_session

        # Use CPU and smaller model
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        session = new_session("u2netp")

        with open(input_path, 'rb') as f:
            input_data = f.read()

        output_data = remove(input_data, session=session)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'wb') as f:
            f.write(output_data)

        return True, str(input_path)
    except Exception as e:
        return False, f"{input_path}: {e}"


def find_images_to_process(images_dir: Path, characters: list = None) -> list:
    """Find all PNG images that need background removal"""
    images = []

    char_dir = images_dir / "characters"
    if not char_dir.exists():
        return images

    # Get character folders
    if characters:
        char_folders = [char_dir / c for c in characters if (char_dir / c).exists()]
    else:
        char_folders = [d for d in char_dir.iterdir() if d.is_dir()]

    for char_folder in char_folders:
        # Check states, expressions, portraits, transformation_shots
        for subdir in ["states", "expressions", "portraits", "transformation_shots"]:
            sub_path = char_folder / subdir
            if sub_path.exists():
                for png in sub_path.glob("*.png"):
                    # Skip if already has _transparent suffix
                    if "_transparent" in png.stem:
                        continue
                    images.append(png)

    return images


def main():
    parser = argparse.ArgumentParser(description="Batch background removal")
    parser.add_argument("--characters", type=str, help="Comma-separated character IDs")
    parser.add_argument("--dry-run", action="store_true", help="Preview without processing")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite original files")
    parser.add_argument("--workers", type=int, default=4, help="Number of parallel workers")

    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    images_dir = project_root / "assets" / "images"

    characters = None
    if args.characters:
        characters = [c.strip() for c in args.characters.split(",")]

    # Find images
    images = find_images_to_process(images_dir, characters)
    logger.info(f"Found {len(images)} images to process")

    if args.dry_run:
        for img in images[:20]:
            logger.info(f"  Would process: {img}")
        if len(images) > 20:
            logger.info(f"  ... and {len(images) - 20} more")
        return

    if not images:
        logger.info("No images to process")
        return

    # Prepare tasks
    tasks = []
    for img in images:
        if args.overwrite:
            output_path = img
        else:
            # Create _transparent version
            output_path = img.parent / f"{img.stem}_transparent{img.suffix}"
        tasks.append((img, output_path))

    # Process with progress
    success = 0
    failed = 0

    logger.info(f"Processing {len(tasks)} images...")

    for i, (input_path, output_path) in enumerate(tasks):
        result, msg = process_single_image((input_path, output_path))
        if result:
            success += 1
            if (i + 1) % 10 == 0:
                logger.info(f"Progress: {i + 1}/{len(tasks)} ({success} success, {failed} failed)")
        else:
            failed += 1
            logger.error(f"Failed: {msg}")

    logger.info(f"\nComplete! Success: {success}, Failed: {failed}")


if __name__ == "__main__":
    main()
