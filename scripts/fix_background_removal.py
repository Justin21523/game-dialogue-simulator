#!/usr/bin/env python3
"""
修復 SAM2 去背失敗的圖片
使用 grid_points 方法重新處理
"""

import json
import logging
from pathlib import Path
import sys
import time

# 添加 SAM2 路徑
sys.path.append("/mnt/c/ai_models/segmentation/sam2")

import torch
import numpy as np
from PIL import Image
import cv2

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SAM2BackgroundRemover:
    """使用 SAM2 進行高品質背景移除"""
    
    def __init__(
        self,
        model_path: str = "/mnt/c/ai_models/segmentation/sam2_hiera_large.pt",
        model_cfg: str = "sam2_hiera_l.yaml",
        device: str = "cuda",
        batch_size: int = 4,
        max_image_size: int = 1024
    ):
        self.model_path = model_path
        self.model_cfg = model_cfg
        self.device = device
        self.batch_size = batch_size
        self.max_image_size = max_image_size
        self.predictor = None
    
    def init_model(self):
        """初始化 SAM2 模型"""
        if self.predictor is not None:
            return
        
        logger.info(f"Loading SAM2 model...")
        
        torch.cuda.empty_cache()
        torch.backends.cudnn.benchmark = True
        torch.cuda.set_per_process_memory_fraction(0.95)
        
        sam2_model = build_sam2(
            self.model_cfg,
            self.model_path,
            device=self.device
        )
        
        sam2_model.eval()
        sam2_model = sam2_model.to(self.device)
        
        self.predictor = SAM2ImagePredictor(sam2_model)
        
        # 預熱
        dummy_img = np.zeros((self.max_image_size, self.max_image_size, 3), dtype=np.uint8)
        self.predictor.set_image(dummy_img)
        
        logger.info(f"✅ SAM2 model loaded")
    
    def get_foreground_mask(
        self,
        image: np.ndarray,
        method: str = "center_point"
    ) -> np.ndarray:
        """獲取前景遮罩"""
        h, w = image.shape[:2]
        
        self.predictor.set_image(image)
        
        if method == "grid_points":
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
        
        else:  # center_point
            center_point = np.array([[w // 2, h // 2]])
            point_labels = np.array([1])
            
            masks, scores, _ = self.predictor.predict(
                point_coords=center_point,
                point_labels=point_labels,
                multimask_output=True
            )
            
            best_idx = np.argmax(scores)
            mask = masks[best_idx]
        
        return mask
    
    def remove_background(
        self,
        input_path: Path,
        output_path: Path,
        method: str = "grid_points",
        edge_refinement: bool = True
    ) -> bool:
        """移除單張圖片背景"""
        try:
            # 讀取圖片
            image = Image.open(input_path).convert("RGB")
            image_np = np.array(image)
            
            # 獲取前景遮罩
            mask = self.get_foreground_mask(image_np, method=method)
            
            # 邊緣細化
            if edge_refinement:
                kernel = np.ones((3, 3), np.uint8)
                mask = cv2.morphologyEx(
                    mask.astype(np.uint8) * 255,
                    cv2.MORPH_CLOSE,
                    kernel
                )
                mask = cv2.GaussianBlur(mask, (3, 3), 0)
                mask = mask.astype(float) / 255.0
            else:
                mask = mask.astype(float)
            
            # 創建 RGBA 圖片
            rgba = np.dstack([image_np, (mask * 255).astype(np.uint8)])
            
            # 保存
            output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba, mode='RGBA').save(output_path, 'PNG')
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to process {input_path}: {e}")
            return False


def restore_rgb_from_rgba(rgba_path: Path, output_path: Path):
    """從 RGBA 圖片提取 RGB 通道"""
    img = Image.open(rgba_path)
    if img.mode == 'RGBA':
        rgb = img.convert('RGB')
        rgb.save(output_path)
        return True
    return False


def main():
    # 讀取問題圖片清單
    with open("/tmp/problem_images.json", "r") as f:
        data = json.load(f)
    
    problem_images = [Path(p) for p in data["images"]]
    
    logger.info(f"發現 {len(problem_images)} 張需要重新處理的圖片")
    
    # 創建臨時目錄存放 RGB 圖片
    temp_dir = Path("/tmp/rgb_temp")
    temp_dir.mkdir(exist_ok=True)
    
    # Step 1: 提取 RGB 通道
    logger.info("Step 1: 提取 RGB 通道...")
    rgb_paths = []
    for rgba_path in problem_images:
        rgb_path = temp_dir / rgba_path.name
        if restore_rgb_from_rgba(rgba_path, rgb_path):
            rgb_paths.append((rgb_path, rgba_path))
    
    logger.info(f"成功提取 {len(rgb_paths)} 張 RGB 圖片")
    
    # Step 2: 使用 grid_points 方法重新去背
    logger.info("Step 2: 使用 grid_points 方法重新去背...")
    
    remover = SAM2BackgroundRemover(
        batch_size=4,
        max_image_size=1024
    )
    remover.init_model()
    
    success_count = 0
    still_bad = 0
    
    for idx, (rgb_path, original_path) in enumerate(rgb_paths, 1):
        logger.info(f"[{idx}/{len(rgb_paths)}] {original_path.name}")
        
        # 使用 grid_points 方法處理
        success = remover.remove_background(
            rgb_path,
            original_path,
            method="grid_points",
            edge_refinement=True
        )
        
        if success:
            success_count += 1
            
            # 驗證結果
            img = Image.open(original_path)
            alpha = np.array(img)[:, :, 3]
            transparent_ratio = (alpha < 128).sum() / alpha.size
            
            if transparent_ratio > 0.80:
                still_bad += 1
                logger.warning(f"  ⚠ 仍然異常 (透明度 {transparent_ratio*100:.1f}%)")
            else:
                logger.info(f"  ✓ 修復成功 (透明度 {transparent_ratio*100:.1f}%)")
    
    logger.info(f"\n{'='*60}")
    logger.info(f"完成! 成功處理 {success_count}/{len(rgb_paths)} 張圖片")
    logger.info(f"仍然異常: {still_bad} 張")
    logger.info(f"{'='*60}")
    
    # 清理臨時文件
    import shutil
    shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
