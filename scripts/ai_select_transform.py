#!/usr/bin/env python3
"""
AI-based selection of transformation sequence images.
Selects 16 optimal images for transformation animation.
"""

import os
import shutil
from pathlib import Path

# Priority order for transformation sequence
SEQUENCE_CATEGORIES = [
    # 1. Flying/airplane mode (start)
    {"keywords": ["flying_pose", "in_flight", "hovering"], "count": 2, "stage": "airplane"},
    # 2. Transform stage 1-2 (early)
    {"keywords": ["transform_stage_1", "transform_stage_2"], "count": 2, "stage": "early_transform"},
    # 3. Closeups during transform
    {"keywords": ["portrait_closeup", "extreme_closeup", "side_profile"], "count": 3, "stage": "closeups"},
    # 4. Transform stage 3-4 (mid)
    {"keywords": ["transform_stage_3", "transform_stage_4", "transformation"], "count": 3, "stage": "mid_transform"},
    # 5. Transform stage 5 / completion
    {"keywords": ["transform_stage_5"], "count": 2, "stage": "complete"},
    # 6. Full body standing
    {"keywords": ["standing_pose", "front_view", "full"], "count": 2, "stage": "standing"},
    # 7. Heroic finale
    {"keywords": ["heroic_pose", "victory_pose", "action_pose"], "count": 2, "stage": "heroic"},
]

def select_images_for_character(char_folder: Path) -> list:
    """Select 16 images for transformation sequence using smart ordering"""
    all_images = sorted([f.name for f in (char_folder / "all_for_transform").glob("*.png")])
    selected = []
    used = set()

    print(f"  Available images: {len(all_images)}")

    for category in SEQUENCE_CATEGORIES:
        keywords = category["keywords"]
        count = category["count"]
        stage = category["stage"]
        found = 0

        for img in all_images:
            if img in used:
                continue
            for keyword in keywords:
                if keyword in img.lower():
                    selected.append(img)
                    used.add(img)
                    found += 1
                    print(f"    [{stage}] {img}")
                    if found >= count:
                        break
            if found >= count:
                break

    # Fill remaining slots if needed (should have 16)
    while len(selected) < 16:
        for img in all_images:
            if img not in used:
                selected.append(img)
                used.add(img)
                print(f"    [fill] {img}")
                if len(selected) >= 16:
                    break

    return selected[:16]

def copy_selected_images(char_name: str, selected: list, base_path: Path):
    """Copy selected images to transform_sequence folder"""
    src_folder = base_path / char_name / "all_for_transform"
    dst_folder = base_path / char_name / "transform_sequence"

    # Clear existing
    dst_folder.mkdir(exist_ok=True)
    for f in dst_folder.glob("*.png"):
        f.unlink()

    # Copy with numbered prefix
    for i, img in enumerate(selected):
        src = src_folder / img
        dst = dst_folder / f"{i+1:02d}_{img}"
        shutil.copy2(src, dst)

    print(f"  Copied {len(selected)} images to {dst_folder}")

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", default="todd", help="Character to process")
    parser.add_argument("--all", action="store_true", help="Process all characters")
    args = parser.parse_args()

    base_path = Path(__file__).parent.parent / "assets" / "images" / "characters"

    characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"] if args.all else [args.character]

    for char in characters:
        char_folder = base_path / char
        if not (char_folder / "all_for_transform").exists():
            print(f"Skipping {char}: no all_for_transform folder")
            continue

        print(f"\n{'='*50}")
        print(f"Processing {char.upper()}")
        print(f"{'='*50}")

        selected = select_images_for_character(char_folder)
        copy_selected_images(char, selected, base_path)

if __name__ == "__main__":
    main()
