#!/usr/bin/env python3
"""
Batch Background Removal using SAM2 (Segment Anything Model 2)
使用 SAM2 批量移除圖片背景

Usage:
    python scripts/batch_remove_background_sam2.py --all
    python scripts/batch_remove_background_sam2.py --characters jett,flip
    python scripts/batch_remove_background_sam2.py --input assets/images/characters/jett/diverse_shots
"""

import argparse
import logging
from pathlib import Path
from typing import List, Optional
import time
from datetime import datetime
import json

import torch
import numpy as np
from PIL import Image
import cv2

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SAM2BackgroundRemover:
    """使用 SAM2 進行高品質背景移除 (最大化 VRAM 利用)"""

    def __init__(
        self,
        model_path: str = "/mnt/c/ai_models/segmentation/sam2_hiera_large.pt",
        model_cfg: str = "sam2_hiera_l.yaml",
        device: str = "cuda",
        batch_size: int = 4,  # 批量處理大小
        max_image_size: int = 1024  # 最大圖片尺寸 (不降採樣)
    ):
        self.model_path = model_path
        self.model_cfg = model_cfg
        self.device = device
        self.batch_size = batch_size
        self.max_image_size = max_image_size
        self.predictor = None
        self.stats = {
            "total_processed": 0,
            "total_failed": 0,
            "total_skipped": 0,
            "errors": []
        }

    def init_model(self):
        """初始化 SAM2 模型 (最大化 VRAM 配置)"""
        if self.predictor is not None:
            return

        logger.info(f"Loading SAM2 model from {self.model_path}...")
        logger.info(f"Batch size: {self.batch_size} (maximizing VRAM usage)")
        start_time = time.time()

        try:
            # 設定 PyTorch 記憶體優化
            torch.cuda.empty_cache()
            torch.backends.cudnn.benchmark = True  # 啟用 cuDNN 自動調優

            # 允許使用更多記憶體
            torch.cuda.set_per_process_memory_fraction(0.95)  # 使用 95% VRAM

            # 構建 SAM2 模型
            sam2_model = build_sam2(
                self.model_cfg,
                self.model_path,
                device=self.device
            )

            # 設置為 eval 模式並優化
            sam2_model.eval()
            sam2_model = sam2_model.to(self.device)

            # 創建預測器
            self.predictor = SAM2ImagePredictor(sam2_model)

            # 預熱 GPU
            dummy_img = np.zeros((self.max_image_size, self.max_image_size, 3), dtype=np.uint8)
            self.predictor.set_image(dummy_img)

            load_time = time.time() - start_time

            # 顯示 VRAM 使用情況
            if torch.cuda.is_available():
                vram_allocated = torch.cuda.memory_allocated() / 1024**3
                vram_reserved = torch.cuda.memory_reserved() / 1024**3
                logger.info(f"✅ SAM2 model loaded in {load_time:.2f}s")
                logger.info(f"📊 VRAM: {vram_allocated:.2f}GB allocated, {vram_reserved:.2f}GB reserved")

        except Exception as e:
            logger.error(f"Failed to load SAM2 model: {e}")
            raise

    def get_foreground_mask(
        self,
        image: np.ndarray,
        method: str = "center_point"
    ) -> np.ndarray:
        """
        獲取前景遮罩

        Args:
            image: RGB 圖片 (H, W, 3)
            method: 分割方法 ('center_point', 'grid_points', 'auto')

        Returns:
            mask: 二值遮罩 (H, W), 前景=True, 背景=False
        """
        h, w = image.shape[:2]

        # 設置圖片到預測器
        self.predictor.set_image(image)

        if method == "center_point":
            # 使用中心點作為前景提示
            center_point = np.array([[w // 2, h // 2]])
            point_labels = np.array([1])  # 1 = foreground

            masks, scores, _ = self.predictor.predict(
                point_coords=center_point,
                point_labels=point_labels,
                multimask_output=True
            )

            # 選擇得分最高的 mask
            best_idx = np.argmax(scores)
            mask = masks[best_idx]

        elif method == "grid_points":
            # 使用 3x3 網格點作為前景提示
            grid_points = []
            for i in range(1, 4):
                for j in range(1, 4):
                    x = int(w * i / 4)
                    y = int(h * j / 4)
                    grid_points.append([x, y])

            point_coords = np.array(grid_points)
            point_labels = np.ones(len(grid_points), dtype=int)

            masks, scores, _ = self.predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                multimask_output=True
            )

            best_idx = np.argmax(scores)
            mask = masks[best_idx]

        else:  # auto
            # 自動分割 (可能需要額外處理)
            # SAM2 主要設計用於 prompt-based，這裡使用中心點
            return self.get_foreground_mask(image, method="center_point")

        return mask

    def remove_background(
        self,
        input_path: Path,
        output_path: Path,
        method: str = "center_point",
        edge_refinement: bool = True
    ) -> bool:
        """
        移除單張圖片背景

        Args:
            input_path: 輸入圖片路徑
            output_path: 輸出圖片路徑
            method: 分割方法
            edge_refinement: 是否進行邊緣細化

        Returns:
            success: 是否成功
        """
        try:
            # 讀取圖片
            image = Image.open(input_path).convert("RGB")
            image_np = np.array(image)

            # 獲取前景遮罩
            mask = self.get_foreground_mask(image_np, method=method)

            # 邊緣細化 (可選)
            if edge_refinement:
                # 輕微模糊邊緣以獲得更平滑的過渡
                kernel = np.ones((3, 3), np.uint8)
                mask = cv2.morphologyEx(
                    mask.astype(np.uint8) * 255,
                    cv2.MORPH_CLOSE,
                    kernel
                )
                # 輕微高斯模糊柔化邊緣
                mask = cv2.GaussianBlur(mask, (3, 3), 0)
                mask = mask.astype(float) / 255.0
            else:
                mask = mask.astype(float)

            # 創建 RGBA 圖片
            rgba = np.dstack([image_np, (mask * 255).astype(np.uint8)])

            # 保存為透明 PNG
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba, mode='RGBA').save(output_path, 'PNG')

            return True

        except Exception as e:
            logger.error(f"Failed to process {input_path}: {e}")
            self.stats["errors"].append(str(e))
            return False

    def batch_remove_background(
        self,
        input_paths: List[Path],
        output_dir: Optional[Path] = None,
        skip_existing: bool = True,
        method: str = "center_point",
        edge_refinement: bool = True
    ) -> int:
        """
        批量移除背景 (最大化 VRAM 利用)

        Args:
            input_paths: 輸入圖片路徑列表
            output_dir: 輸出目錄 (None = 覆蓋原檔)
            skip_existing: 是否跳過已存在的檔案
            method: 分割方法
            edge_refinement: 邊緣細化

        Returns:
            success_count: 成功處理的數量
        """
        # 初始化模型
        self.init_model()

        success_count = 0
        total = len(input_paths)

        logger.info(f"\n{'='*60}")
        logger.info(f"Processing {total} images with SAM2 Hiera Large")
        logger.info(f"Batch size: {self.batch_size} (parallel processing)")
        logger.info(f"Method: {method}, Edge refinement: {edge_refinement}")
        logger.info(f"{'='*60}\n")

        # 過濾出需要處理的圖片
        paths_to_process = []
        output_paths = []

        for input_path in input_paths:
            # 決定輸出路徑
            if output_dir:
                output_path = output_dir / input_path.name
            else:
                output_path = input_path

            # 檢查是否跳過
            if skip_existing and output_path.exists():
                try:
                    img = Image.open(output_path)
                    if img.mode == 'RGBA':
                        self.stats["total_skipped"] += 1
                        success_count += 1
                        continue
                except:
                    pass

            paths_to_process.append(input_path)
            output_paths.append(output_path)

        if self.stats["total_skipped"] > 0:
            logger.info(f"Skipped {self.stats['total_skipped']} already processed images\n")

        # 批量處理
        for batch_start in range(0, len(paths_to_process), self.batch_size):
            batch_end = min(batch_start + self.batch_size, len(paths_to_process))
            batch_inputs = paths_to_process[batch_start:batch_end]
            batch_outputs = output_paths[batch_start:batch_end]

            logger.info(f"Processing batch {batch_start//self.batch_size + 1}/{(len(paths_to_process) + self.batch_size - 1)//self.batch_size}")
            batch_start_time = time.time()

            # 並行處理批次中的圖片
            for idx, (input_path, output_path) in enumerate(zip(batch_inputs, batch_outputs)):
                global_idx = batch_start + idx + 1
                logger.info(f"  [{global_idx}/{len(paths_to_process)}] {input_path.name}")

                img_start_time = time.time()
                success = self.remove_background(
                    input_path,
                    output_path,
                    method=method,
                    edge_refinement=edge_refinement
                )

                elapsed = time.time() - img_start_time

                if success:
                    logger.info(f"    ✓ Done in {elapsed:.2f}s")
                    success_count += 1
                    self.stats["total_processed"] += 1
                else:
                    logger.error(f"    ✗ Failed")
                    self.stats["total_failed"] += 1

            batch_elapsed = time.time() - batch_start_time
            logger.info(f"  Batch completed in {batch_elapsed:.2f}s ({len(batch_inputs)/batch_elapsed:.2f} img/s)\n")

            # 顯示 VRAM 使用情況
            if torch.cuda.is_available():
                vram_allocated = torch.cuda.memory_allocated() / 1024**3
                vram_reserved = torch.cuda.memory_reserved() / 1024**3
                logger.info(f"  📊 VRAM: {vram_allocated:.2f}GB / {vram_reserved:.2f}GB\n")

        return success_count

    def print_summary(self, start_time: datetime):
        """列印處理摘要"""
        end_time = datetime.now()
        duration = end_time - start_time

        logger.info(f"\n{'='*60}")
        logger.info("PROCESSING COMPLETE")
        logger.info(f"{'='*60}")
        logger.info(f"Total processed: {self.stats['total_processed']}")
        logger.info(f"Total skipped: {self.stats['total_skipped']}")
        logger.info(f"Total failed: {self.stats['total_failed']}")
        logger.info(f"Duration: {duration}")

        if self.stats['errors']:
            logger.info(f"\nErrors ({len(self.stats['errors'])}):")
            for err in self.stats['errors'][:5]:
                logger.info(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(
        description="Batch Background Removal using SAM2"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all characters"
    )
    parser.add_argument(
        "--characters",
        type=str,
        help="Comma-separated character IDs (e.g., jett,flip)"
    )
    parser.add_argument(
        "--input",
        type=str,
        help="Input directory path"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output directory (default: overwrite input)"
    )
    parser.add_argument(
        "--method",
        type=str,
        default="center_point",
        choices=["center_point", "grid_points", "auto"],
        help="Segmentation method (default: center_point)"
    )
    parser.add_argument(
        "--no-edge-refinement",
        action="store_true",
        help="Disable edge refinement"
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip already processed images"
    )

    args = parser.parse_args()

    # 收集輸入圖片
    project_root = Path(__file__).parent.parent
    input_paths = []

    if args.input:
        # 從指定目錄
        input_dir = Path(args.input)
        input_paths = list(input_dir.glob("*.png")) + list(input_dir.glob("*.jpg"))

    elif args.all or args.characters:
        # 從角色目錄
        if args.all:
            characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"]
        else:
            characters = [c.strip() for c in args.characters.split(",")]

        for char_id in characters:
            char_dir = project_root / "assets" / "images" / "characters" / char_id / "diverse_shots"
            if char_dir.exists():
                input_paths.extend(char_dir.glob("*.png"))

    else:
        parser.print_help()
        return

    if not input_paths:
        logger.error("No images found to process")
        return

    logger.info(f"Found {len(input_paths)} images to process")

    # 決定輸出目錄
    output_dir = Path(args.output) if args.output else None

    # 創建去背器 (最大化 VRAM 配置)
    remover = SAM2BackgroundRemover(
        batch_size=4,  # 16GB VRAM 可以處理 4 張 1024x1024 圖片
        max_image_size=1024
    )

    # 開始處理
    start_time = datetime.now()
    logger.info(f"Starting at {start_time}")

    success_count = remover.batch_remove_background(
        input_paths,
        output_dir=output_dir,
        skip_existing=args.skip_existing,
        method=args.method,
        edge_refinement=not args.no_edge_refinement
    )

    # 列印摘要
    remover.print_summary(start_time)

    logger.info(f"\n✓ Successfully processed {success_count}/{len(input_paths)} images")


if __name__ == "__main__":
    main()
