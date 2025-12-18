#!/usr/bin/env python3
"""
高級插幀引擎 - 整合 CLIP 選圖和改進的 RIFE 插幀
從 diverse_shots 生成流暢的 30fps 動畫
"""

import argparse
import logging
import subprocess
from pathlib import Path
from typing import List, Optional
import time
from datetime import datetime
import json
import shutil

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AnimationInterpolator:
    """動畫插幀引擎"""

    def __init__(
        self,
        project_root: Path,
        rife_model_path: Path = None,
        device: str = "cuda"
    ):
        self.project_root = project_root
        self.device = device

        # RIFE 模型路徑
        if rife_model_path is None:
            self.rife_model_path = project_root / "tools" / "rife" / "train_log"
        else:
            self.rife_model_path = rife_model_path

        # 腳本路徑
        self.select_script = project_root / "scripts" / "select_animation_sequence.py"
        self.rife_script = project_root / "tools" / "rife" / "inference_img_hd_v2.py"

        self.stats = {
            "total_characters": 0,
            "total_pairs": 0,
            "total_frames": 0,
            "total_time": 0,
            "errors": []
        }

    def select_sequence(
        self,
        character: str,
        count: int = 18,
        method: str = "balanced",
        use_all: bool = False
    ) -> Optional[Path]:
        """
        使用 CLIP 選擇/排序圖片序列

        Args:
            character: 角色 ID
            count: 要選擇的圖片數量 (use_all=True 時忽略)
            method: 選擇方法
            use_all: True = 使用所有圖片並排序, False = 選擇子集

        Returns:
            sequence_dir: 序列目錄路徑 (若成功)
        """
        if use_all:
            logger.info(f"\n{'='*60}")
            logger.info(f"Step 1: Sorting ALL images for {character} using CLIP")
            logger.info(f"{'='*60}")
        else:
            logger.info(f"\n{'='*60}")
            logger.info(f"Step 1: Selecting {count} images for {character}")
            logger.info(f"{'='*60}")

        cmd = [
            "python3", str(self.select_script),
            "--character", character,
            "--method", method
        ]

        if use_all:
            cmd.append("--sort-only")
        else:
            cmd.extend(["--count", str(count)])

        try:
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True
            )

            logger.info(result.stdout)

            # 返回序列目錄
            sequence_dir = self.project_root / "assets" / "images" / "characters" / character / "animation_sequence"

            if sequence_dir.exists():
                return sequence_dir
            else:
                logger.error(f"Sequence directory not found: {sequence_dir}")
                return None

        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to select sequence: {e}")
            logger.error(e.stderr)
            self.stats["errors"].append(f"{character}: selection failed")
            return None

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
        """
        插幀單對圖片

        Args:
            img0, img1: 輸入圖片
            output_dir: 輸出目錄
            exp: 指數 (2^exp 幀)
            scale: 縮放因子
            alpha_mode: alpha 混合模式
            black_threshold: 黑色檢測閾值
            alpha_feather: alpha 羽化強度

        Returns:
            success: 是否成功
        """
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
                timeout=60  # 1分鐘超時
            )

            # logger.debug(result.stdout)
            return True

        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to interpolate {img0.name} -> {img1.name}")
            logger.error(e.stderr)
            return False
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout interpolating {img0.name} -> {img1.name}")
            return False

    def interpolate_sequence(
        self,
        character: str,
        sequence_dir: Path,
        output_name: str = "transform_animation",
        exp: int = 4,
        fps: int = 30,
        **kwargs
    ) -> Optional[Path]:
        """
        插幀整個序列

        Args:
            character: 角色 ID
            sequence_dir: 序列目錄
            output_name: 輸出動畫名稱
            exp: 每對圖片生成 2^exp 幀
            fps: 目標幀率
            **kwargs: 傳遞給 interpolate_pair 的其他參數

        Returns:
            animation_dir: 動畫目錄路徑
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"Step 2: Interpolating sequence for {character}")
        logger.info(f"{'='*60}")

        # 讀取序列圖片
        sequence_images = sorted(sequence_dir.glob("frame_*.png"))

        if len(sequence_images) < 2:
            logger.error(f"Not enough images in sequence (found {len(sequence_images)})")
            return None

        logger.info(f"Found {len(sequence_images)} images in sequence")
        logger.info(f"Will generate {len(sequence_images) - 1} pairs × {2**exp} frames = {(len(sequence_images) - 1) * (2**exp) + 1} total frames")

        # 輸出目錄
        char_dir = self.project_root / "assets" / "images" / "characters" / character
        animation_dir = char_dir / "animations" / output_name
        animation_dir.mkdir(parents=True, exist_ok=True)

        # 臨時目錄
        temp_dir = animation_dir / "temp"
        temp_dir.mkdir(exist_ok=True)

        start_time = time.time()
        frame_counter = 0

        # 處理每對圖片
        for i in range(len(sequence_images) - 1):
            img0 = sequence_images[i]
            img1 = sequence_images[i + 1]

            logger.info(f"\n[Pair {i+1}/{len(sequence_images)-1}] {img0.name} -> {img1.name}")

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

            # 第一對圖片: 包含第一幀
            # 後續: 跳過第一幀 (因為是前一對的最後一幀)
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
        logger.info(f"  Total frames: {frame_counter}")
        logger.info(f"  Duration: {duration:.2f}s @ {fps}fps")
        logger.info(f"  Processing time: {total_time:.2f}s")
        logger.info(f"  Output: {animation_dir}")
        logger.info(f"{'='*60}")

        # 保存 metadata
        metadata = {
            "character": character,
            "output_name": output_name,
            "source_images": len(sequence_images),
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

        return animation_dir

    def process_character(
        self,
        character: str,
        select_count: int = 18,
        select_method: str = "balanced",
        output_name: str = "transform_animation",
        exp: int = 4,
        fps: int = 30,
        skip_selection: bool = False,
        use_all: bool = False,
        **interp_kwargs
    ) -> bool:
        """
        處理單個角色的完整流程

        Args:
            use_all: True = 使用所有圖片 (CLIP排序), False = 選擇子集

        Returns:
            success: 是否成功
        """
        logger.info(f"\n{'#'*60}")
        logger.info(f"# Processing character: {character.upper()}")
        logger.info(f"{'#'*60}")

        self.stats["total_characters"] += 1

        # Step 1: 選擇/排序序列 (可選跳過)
        char_dir = self.project_root / "assets" / "images" / "characters" / character
        sequence_dir = char_dir / "animation_sequence"

        if skip_selection and sequence_dir.exists():
            logger.info(f"Skipping selection, using existing sequence at {sequence_dir}")
        else:
            sequence_dir = self.select_sequence(character, select_count, select_method, use_all)

            if sequence_dir is None:
                return False

        # Step 2: 插幀
        animation_dir = self.interpolate_sequence(
            character,
            sequence_dir,
            output_name=output_name,
            exp=exp,
            fps=fps,
            **interp_kwargs
        )

        return animation_dir is not None

    def print_summary(self):
        """列印處理摘要"""
        logger.info(f"\n{'='*60}")
        logger.info("PROCESSING SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Characters processed: {self.stats['total_characters']}")
        logger.info(f"Total pairs: {self.stats['total_pairs']}")
        logger.info(f"Total frames: {self.stats['total_frames']}")
        logger.info(f"Total time: {self.stats['total_time']:.2f}s")

        if self.stats['errors']:
            logger.info(f"\nErrors ({len(self.stats['errors'])}):")
            for err in self.stats['errors'][:10]:
                logger.info(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(
        description="Advanced Animation Interpolation Engine"
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
        "--select-count",
        type=int,
        default=18,
        help="Number of images to select (default: 18)"
    )
    parser.add_argument(
        "--select-method",
        type=str,
        default="balanced",
        choices=["greedy", "balanced"],
        help="CLIP selection method (default: balanced)"
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
        "--output-name",
        type=str,
        default="transform_animation",
        help="Output animation name (default: transform_animation)"
    )
    parser.add_argument(
        "--skip-selection",
        action="store_true",
        help="Skip CLIP selection, use existing sequence"
    )
    parser.add_argument(
        "--use-all",
        action="store_true",
        help="Use ALL images (CLIP will sort them, not select subset)"
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
    interpolator = AnimationInterpolator(project_root)

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
    logger.info(f"Target: {args.select_count} images → {args.exp} exp → ~{(args.select_count-1) * (2**args.exp) + 1} frames")

    for char in characters:
        interpolator.process_character(
            char,
            select_count=args.select_count,
            select_method=args.select_method,
            output_name=args.output_name,
            exp=args.exp,
            fps=args.fps,
            skip_selection=args.skip_selection,
            use_all=args.use_all,
            **interp_kwargs
        )

    # 列印摘要
    interpolator.print_summary()

    end_time = datetime.now()
    duration = end_time - start_time
    logger.info(f"\n✓ All done! Total duration: {duration}")


if __name__ == "__main__":
    main()
