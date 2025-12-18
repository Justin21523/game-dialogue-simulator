#!/usr/bin/env python3
"""
簡化版插幀引擎 - 使用所有圖片,不做選擇
按文件名順序對 diverse_shots 中的所有圖片進行插幀
"""

import argparse
import logging
import subprocess
from pathlib import Path
from typing import List
import time
from datetime import datetime
import json
import shutil

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SimpleAnimationInterpolator:
    """簡化版動畫插幀引擎 - 使用所有圖片"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.rife_model_path = project_root / "tools" / "rife" / "train_log"
        self.rife_script = project_root / "tools" / "rife" / "inference_img_hd_v2.py"

        self.stats = {
            "total_characters": 0,
            "total_pairs": 0,
            "total_frames": 0,
            "total_time": 0,
            "errors": []
        }

    def interpolate_pair(
        self,
        img0: Path,
        img1: Path,
        output_dir: Path,
        exp: int = 4,
        scale: str = "auto",
        alpha_mode: str = "progressive",
        black_threshold: int = 50,
        alpha_feather: float = 0.5
    ) -> bool:
        """插幀單對圖片"""
        output_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            "python3", str(self.rife_script),
            "--img", str(img0), str(img1),
            "--exp", str(exp),
            "--model", str(self.rife_model_path),
            "--scale", scale,
            "--output", str(output_dir),
            "--alpha-mode", alpha_mode,
            "--black-threshold", str(black_threshold),
            "--alpha-feather", str(alpha_feather)
        ]

        try:
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=60
            )
            return True
        except Exception as e:
            logger.error(f"Failed to interpolate {img0.name} -> {img1.name}: {e}")
            return False

    def interpolate_all_images(
        self,
        character: str,
        output_name: str = "full_sequence_animation",
        exp: int = 4,
        fps: int = 30,
        min_foreground: float = 0.15,
        **kwargs
    ) -> bool:
        """
        對角色的所有圖片進行插幀

        Args:
            character: 角色 ID
            output_name: 輸出動畫名稱
            exp: 每對圖片生成 2^exp 幀
            fps: 目標幀率
            min_foreground: 最小前景比例 (過濾品質不佳的圖片)
            **kwargs: 傳遞給 interpolate_pair 的其他參數
        """
        logger.info(f"\n{'#'*60}")
        logger.info(f"# Processing character: {character.upper()}")
        logger.info(f"{'#'*60}")

        self.stats["total_characters"] += 1

        # 讀取所有圖片
        char_dir = self.project_root / "assets" / "images" / "characters" / character
        input_dir = char_dir / "diverse_shots"

        if not input_dir.exists():
            logger.error(f"Input directory not found: {input_dir}")
            return False

        # 收集所有圖片並排序
        all_images = sorted(input_dir.glob("*.png"))
        logger.info(f"Found {len(all_images)} images in {input_dir}")

        # 過濾品質不佳的圖片
        valid_images = []
        import numpy as np
        from PIL import Image

        for img_path in all_images:
            try:
                img = Image.open(img_path)
                if img.mode == 'RGBA':
                    alpha = np.array(img)[:, :, 3]
                    foreground_ratio = (alpha > 128).sum() / alpha.size

                    if foreground_ratio >= min_foreground:
                        valid_images.append(img_path)
                    else:
                        logger.debug(f"Skipped {img_path.name} (foreground: {foreground_ratio*100:.1f}%)")
                else:
                    valid_images.append(img_path)
            except Exception as e:
                logger.warning(f"Failed to check {img_path.name}: {e}")

        logger.info(f"Valid images: {len(valid_images)} (filtered out {len(all_images) - len(valid_images)})")

        if len(valid_images) < 2:
            logger.error("Not enough valid images!")
            return False

        # 計算總幀數
        num_pairs = len(valid_images) - 1
        frames_per_pair = 2 ** exp
        total_frames = num_pairs * frames_per_pair + 1

        logger.info(f"Will generate {num_pairs} pairs × {frames_per_pair} frames = {total_frames} total frames")
        logger.info(f"Animation duration: {total_frames / fps:.2f}s @ {fps}fps")

        # 輸出目錄
        animation_dir = char_dir / "animations" / output_name
        animation_dir.mkdir(parents=True, exist_ok=True)

        # 臨時目錄
        temp_dir = animation_dir / "temp"
        temp_dir.mkdir(exist_ok=True)

        start_time = time.time()
        frame_counter = 0

        # 處理每對圖片
        for i in range(len(valid_images) - 1):
            img0 = valid_images[i]
            img1 = valid_images[i + 1]

            logger.info(f"\n[Pair {i+1}/{num_pairs}] {img0.name} -> {img1.name}")

            # 插幀
            pair_output = temp_dir / f"pair_{i:03d}"
            pair_start = time.time()

            success = self.interpolate_pair(
                img0, img1, pair_output,
                exp=exp,
                **kwargs
            )

            pair_time = time.time() - pair_start

            if not success:
                logger.error(f"  Failed to interpolate pair {i+1}")
                self.stats["errors"].append(f"{character}: pair {i+1} failed")
                continue

            # 複製插幀結果到最終輸出
            pair_frames = sorted(pair_output.glob("img*.png"))

            # 第一對: 包含第一幀, 後續: 跳過第一幀
            start_idx = 0 if i == 0 else 1

            for j, frame_path in enumerate(pair_frames[start_idx:]):
                dst_path = animation_dir / f"frame_{frame_counter:05d}.png"
                shutil.copy2(frame_path, dst_path)
                frame_counter += 1

            logger.info(f"  ✓ Generated {len(pair_frames)} frames in {pair_time:.2f}s")
            self.stats["total_pairs"] += 1

        # 清理臨時文件
        shutil.rmtree(temp_dir)

        total_time = time.time() - start_time
        self.stats["total_frames"] += frame_counter
        self.stats["total_time"] += total_time

        # 計算動畫時長
        duration = frame_counter / fps

        logger.info(f"\n{'='*60}")
        logger.info(f"✓ Animation generated successfully")
        logger.info(f"  Source images: {len(valid_images)}")
        logger.info(f"  Total frames: {frame_counter}")
        logger.info(f"  Duration: {duration:.2f}s @ {fps}fps")
        logger.info(f"  Processing time: {total_time:.2f}s ({total_time/60:.1f} min)")
        logger.info(f"  Output: {animation_dir}")
        logger.info(f"{'='*60}")

        # 保存 metadata
        metadata = {
            "character": character,
            "output_name": output_name,
            "source_images": len(valid_images),
            "total_frames": frame_counter,
            "fps": fps,
            "duration_seconds": duration,
            "processing_time": total_time,
            "exp": exp,
            "interpolation_params": kwargs
        }

        metadata_path = animation_dir / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return True

    def print_summary(self):
        """列印處理摘要"""
        logger.info(f"\n{'='*60}")
        logger.info("PROCESSING SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Characters processed: {self.stats['total_characters']}")
        logger.info(f"Total pairs: {self.stats['total_pairs']}")
        logger.info(f"Total frames: {self.stats['total_frames']}")
        logger.info(f"Total time: {self.stats['total_time']:.2f}s ({self.stats['total_time']/60:.1f} min)")

        if self.stats['errors']:
            logger.info(f"\nErrors ({len(self.stats['errors'])}):")
            for err in self.stats['errors'][:10]:
                logger.info(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(
        description="Simple Animation Interpolation - Use ALL images"
    )
    parser.add_argument(
        "--character",
        type=str,
        help="Single character to process"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all characters"
    )
    parser.add_argument(
        "--characters",
        type=str,
        help="Comma-separated character IDs"
    )
    parser.add_argument(
        "--exp",
        type=int,
        default=4,
        help="Interpolation exp (2^exp frames per pair, default: 4)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=30,
        help="Target FPS (default: 30)"
    )
    parser.add_argument(
        "--scale",
        type=str,
        default="auto",
        help="Scale factor (auto/1.0/0.75/0.5, default: auto)"
    )
    parser.add_argument(
        "--alpha-mode",
        type=str,
        default="progressive",
        choices=["union", "progressive", "intersection"],
        help="Alpha blending mode (default: progressive)"
    )
    parser.add_argument(
        "--black-threshold",
        type=int,
        default=50,
        help="Black detection threshold (default: 50)"
    )
    parser.add_argument(
        "--alpha-feather",
        type=float,
        default=0.5,
        help="Alpha feathering strength (default: 0.5)"
    )
    parser.add_argument(
        "--min-foreground",
        type=float,
        default=0.15,
        help="Minimum foreground ratio to filter images (default: 0.15)"
    )
    parser.add_argument(
        "--output-name",
        type=str,
        default="full_sequence_animation",
        help="Output animation name (default: full_sequence_animation)"
    )

    args = parser.parse_args()

    # 決定要處理的角色
    if args.all:
        characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"]
    elif args.characters:
        characters = [c.strip() for c in args.characters.split(",")]
    elif args.character:
        characters = [args.character]
    else:
        parser.print_help()
        return

    # 創建插幀引擎
    project_root = Path(__file__).parent.parent
    interpolator = SimpleAnimationInterpolator(project_root)

    # 插幀參數
    interp_kwargs = {
        "scale": args.scale,
        "alpha_mode": args.alpha_mode,
        "black_threshold": args.black_threshold,
        "alpha_feather": args.alpha_feather
    }

    # 開始處理
    start_time = datetime.now()
    logger.info(f"Starting at {start_time}")
    logger.info(f"Characters: {', '.join(characters)}")
    logger.info(f"Mode: Using ALL images (no CLIP selection)")

    for char in characters:
        interpolator.interpolate_all_images(
            char,
            output_name=args.output_name,
            exp=args.exp,
            fps=args.fps,
            min_foreground=args.min_foreground,
            **interp_kwargs
        )

    # 列印摘要
    interpolator.print_summary()

    end_time = datetime.now()
    duration = end_time - start_time
    logger.info(f"\n✓ All done! Total duration: {duration}")


if __name__ == "__main__":
    main()
