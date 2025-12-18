#!/usr/bin/env python3
"""
Select 16 images for transformation sequence from all available images.
Prioritizes images that show transformation progression.
"""

import os
import shutil
from pathlib import Path

# Define transformation sequence priority
# Earlier in list = earlier in transformation
SEQUENCE_PRIORITY = [
    # Stage 1: Airplane mode
    ["flying", "flight", "airplane", "plane_mode", "action_pose"],
    # Stage 2: Starting transform
    ["stage_1", "stage_2", "early"],
    # Stage 3: Mid transform - closeups
    ["closeup_wings", "closeup_back", "closeup_chest"],
    # Stage 4: More closeups
    ["closeup_arms", "closeup_legs", "closeup_head"],
    # Stage 5: Face/portrait
    ["extreme_closeup", "closeup_v", "portrait"],
    # Stage 6: Near complete
    ["stage_3", "stage_4", "mid", "transform"],
    # Stage 7: Robot emerging
    ["stage_5", "full_v", "full_body", "standing"],
    # Stage 8: Heroic poses
    ["heroic", "hero", "power_pose", "confident", "ready"],
]

def find_matching_image(images: list, keywords: list) -> str:
    """Find first image matching any keyword"""
    for keyword in keywords:
        for img in images:
            if keyword in img.lower():
                return img
    return None

def select_sequence(char_folder: Path) -> list:
    """Select 16 images for transformation sequence"""
    all_images = sorted([f.name for f in char_folder.glob("*.png")])
    selected = []
    used = set()

    # Try to get 2 images per stage (8 stages x 2 = 16)
    for stage_keywords in SEQUENCE_PRIORITY:
        count = 0
        for img in all_images:
            if img in used:
                continue
            for keyword in stage_keywords:
                if keyword in img.lower():
                    selected.append(img)
                    used.add(img)
                    count += 1
                    if count >= 2:
                        break
            if count >= 2:
                break

    # If we don't have 16, fill with remaining images
    while len(selected) < 16:
        for img in all_images:
            if img not in used:
                selected.append(img)
                used.add(img)
                if len(selected) >= 16:
                    break

    return selected[:16]

def main():
    base_path = Path(__file__).parent.parent / "assets" / "images" / "characters"
    characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"]

    for char in characters:
        all_folder = base_path / char / "all_for_transform"
        seq_folder = base_path / char / "transform_sequence"

        if not all_folder.exists():
            print(f"Skipping {char}: no all_for_transform folder")
            continue

        # Create sequence folder
        seq_folder.mkdir(exist_ok=True)

        # Clear existing
        for f in seq_folder.glob("*.png"):
            f.unlink()

        # Select and copy
        selected = select_sequence(all_folder)

        print(f"\n{char.upper()} - Selected {len(selected)} images:")
        for i, img in enumerate(selected):
            src = all_folder / img
            dst = seq_folder / f"{i+1:02d}_{img}"
            shutil.copy2(src, dst)
            print(f"  {i+1:02d}: {img}")

        print(f"  → Saved to {seq_folder}")

if __name__ == "__main__":
    main()
