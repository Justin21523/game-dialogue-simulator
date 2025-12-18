#!/usr/bin/env python3
"""
AI 選圖系統 - 使用 CLIP Embeddings 選擇視覺上最流暢的圖片序列
從 diverse_shots 中選擇 N 張圖片,使得相鄰圖片視覺相似度最高
"""

import argparse
import logging
from pathlib import Path
from typing import List, Tuple
import json

import torch
import numpy as np
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import cv2

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CLIPImageSelector:
    """使用 CLIP 選擇視覺上流暢的圖片序列"""

    def __init__(
        self,
        model_name: str = "openai/clip-vit-base-patch32",
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        self.device = device
        logger.info(f"Loading CLIP model: {model_name}")

        self.model = CLIPModel.from_pretrained(model_name).to(device)
        self.processor = CLIPProcessor.from_pretrained(model_name)

        logger.info(f"✓ CLIP model loaded on {device}")

    def compute_embeddings(self, image_paths: List[Path]) -> Tuple[np.ndarray, List[Path]]:
        """
        計算所有圖片的 CLIP embeddings

        Returns:
            embeddings: (N, D) 特徵矩陣
            valid_paths: 有效的圖片路徑列表
        """
        embeddings = []
        valid_paths = []

        logger.info(f"Computing CLIP embeddings for {len(image_paths)} images...")

        for i, img_path in enumerate(image_paths):
            try:
                # 讀取圖片
                image = Image.open(img_path).convert('RGB')

                # 預處理
                inputs = self.processor(images=image, return_tensors="pt").to(self.device)

                # 計算 embedding
                with torch.no_grad():
                    image_features = self.model.get_image_features(**inputs)
                    # 正規化
                    image_features = image_features / image_features.norm(dim=-1, keepdim=True)

                embeddings.append(image_features.cpu().numpy()[0])
                valid_paths.append(img_path)

                if (i + 1) % 10 == 0:
                    logger.info(f"  Processed {i + 1}/{len(image_paths)}")

            except Exception as e:
                logger.warning(f"Failed to process {img_path.name}: {e}")

        embeddings = np.array(embeddings)  # (N, D)
        logger.info(f"✓ Computed {len(embeddings)} embeddings")

        return embeddings, valid_paths

    def compute_similarity_matrix(self, embeddings: np.ndarray) -> np.ndarray:
        """
        計算相似度矩陣 (cosine similarity)

        Args:
            embeddings: (N, D)

        Returns:
            similarity: (N, N), 值越大越相似
        """
        # Cosine similarity (因為已經正規化,所以就是點積)
        similarity = embeddings @ embeddings.T
        return similarity

    def select_smooth_sequence_greedy(
        self,
        similarity: np.ndarray,
        count: int,
        start_idx: int = None
    ) -> List[int]:
        """
        貪婪算法選擇最流暢的序列

        從起始圖片開始,每次選擇與當前圖片最相似的未訪問圖片

        Args:
            similarity: (N, N) 相似度矩陣
            count: 要選擇的圖片數量
            start_idx: 起始圖片索引 (None = 自動選擇中心圖片)

        Returns:
            sequence: 圖片索引序列
        """
        N = len(similarity)
        count = min(count, N)

        # 自動選擇起始點 (選擇與其他圖片平均相似度最高的)
        if start_idx is None:
            avg_sim = similarity.mean(axis=1)
            start_idx = int(np.argmax(avg_sim))
            logger.info(f"Auto-selected start image: index {start_idx}")

        visited = set()
        sequence = []
        current = start_idx

        for _ in range(count):
            sequence.append(current)
            visited.add(current)

            if len(sequence) >= count:
                break

            # 找到與當前圖片最相似的未訪問圖片
            candidates = []
            for idx in range(N):
                if idx not in visited:
                    candidates.append((idx, similarity[current, idx]))

            if not candidates:
                break

            # 選擇相似度最高的
            candidates.sort(key=lambda x: x[1], reverse=True)
            current = candidates[0][0]

        return sequence

    def select_smooth_sequence_balanced(
        self,
        similarity: np.ndarray,
        embeddings: np.ndarray,
        count: int
    ) -> List[int]:
        """
        平衡算法 - 在流暢性和多樣性之間取得平衡

        Args:
            similarity: (N, N) 相似度矩陣
            embeddings: (N, D) 特徵矩陣
            count: 要選擇的圖片數量

        Returns:
            sequence: 圖片索引序列
        """
        N = len(similarity)
        count = min(count, N)

        visited = set()
        sequence = []

        # 第一張:選擇最中心的圖片
        avg_sim = similarity.mean(axis=1)
        current = int(np.argmax(avg_sim))
        sequence.append(current)
        visited.add(current)

        # 後續:在相似度和多樣性之間平衡
        diversity_weight = 0.3  # 多樣性權重

        while len(sequence) < count:
            candidates = []

            for idx in range(N):
                if idx not in visited:
                    # 與當前圖片的相似度
                    sim_current = similarity[current, idx]

                    # 與已選圖片的平均距離 (多樣性)
                    if len(sequence) > 1:
                        selected_embeddings = embeddings[sequence]
                        candidate_emb = embeddings[idx]
                        distances = np.linalg.norm(selected_embeddings - candidate_emb, axis=1)
                        avg_distance = distances.mean()
                    else:
                        avg_distance = 0

                    # 綜合得分 (流暢性 + 多樣性)
                    score = sim_current + diversity_weight * avg_distance
                    candidates.append((idx, score))

            if not candidates:
                break

            # 選擇得分最高的
            candidates.sort(key=lambda x: x[1], reverse=True)
            current = candidates[0][0]
            sequence.append(current)
            visited.add(current)

        return sequence


def filter_valid_images(image_paths: List[Path], min_alpha_ratio: float = 0.10) -> List[Path]:
    """
    過濾掉品質不佳的圖片

    Args:
        image_paths: 圖片路徑列表
        min_alpha_ratio: 最小前景比例 (alpha > 128 的像素佔比)

    Returns:
        valid_paths: 有效的圖片路徑
    """
    valid_paths = []

    logger.info(f"Filtering {len(image_paths)} images...")

    for img_path in image_paths:
        try:
            img = Image.open(img_path)

            if img.mode == 'RGBA':
                alpha = np.array(img)[:, :, 3]
                foreground_ratio = (alpha > 128).sum() / alpha.size

                if foreground_ratio >= min_alpha_ratio:
                    valid_paths.append(img_path)
                else:
                    logger.debug(f"Skipped {img_path.name} (foreground: {foreground_ratio*100:.1f}%)")
            else:
                valid_paths.append(img_path)

        except Exception as e:
            logger.warning(f"Failed to check {img_path.name}: {e}")

    logger.info(f"✓ Found {len(valid_paths)} valid images (filtered out {len(image_paths) - len(valid_paths)})")

    return valid_paths


def main():
    parser = argparse.ArgumentParser(
        description="AI Image Sequence Selection using CLIP"
    )
    parser.add_argument(
        "--character",
        type=str,
        required=True,
        help="Character ID (e.g., jett)"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Number of images to select (0 = use all images, just sort them)"
    )
    parser.add_argument(
        "--sort-only",
        action="store_true",
        help="Sort all images by similarity (don't select subset)"
    )
    parser.add_argument(
        "--method",
        type=str,
        default="balanced",
        choices=["greedy", "balanced"],
        help="Selection method (default: balanced)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        help="Output directory (default: assets/images/characters/{char}/animation_sequence)"
    )
    parser.add_argument(
        "--min-foreground",
        type=float,
        default=0.10,
        help="Minimum foreground ratio (default: 0.10)"
    )

    args = parser.parse_args()

    # 路徑設定
    project_root = Path(__file__).parent.parent
    char_dir = project_root / "assets" / "images" / "characters" / args.character
    input_dir = char_dir / "diverse_shots"

    if not input_dir.exists():
        logger.error(f"Input directory not found: {input_dir}")
        return

    # 輸出目錄
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = char_dir / "animation_sequence"

    output_dir.mkdir(parents=True, exist_ok=True)

    # 收集圖片
    image_paths = list(input_dir.glob("*.png"))
    logger.info(f"Found {len(image_paths)} images in {input_dir}")

    if len(image_paths) == 0:
        logger.error("No images found!")
        return

    # 過濾品質不佳的圖片
    image_paths = filter_valid_images(image_paths, args.min_foreground)

    # 決定要選擇的數量
    if args.sort_only or args.count == 0:
        args.count = len(image_paths)
        logger.info(f"Sort-only mode: using all {args.count} images")
    elif len(image_paths) < args.count:
        logger.warning(f"Only {len(image_paths)} valid images, adjusting count")
        args.count = len(image_paths)

    # 創建 CLIP 選擇器
    selector = CLIPImageSelector()

    # 計算 embeddings
    embeddings, valid_paths = selector.compute_embeddings(image_paths)

    # 計算相似度矩陣
    logger.info("Computing similarity matrix...")
    similarity = selector.compute_similarity_matrix(embeddings)

    # 選擇序列
    logger.info(f"Selecting {args.count} images using {args.method} method...")

    if args.method == "greedy":
        sequence = selector.select_smooth_sequence_greedy(similarity, args.count)
    else:  # balanced
        sequence = selector.select_smooth_sequence_balanced(similarity, embeddings, args.count)

    logger.info(f"✓ Selected {len(sequence)} images")

    # 複製/鏈接圖片到輸出目錄
    selected_paths = []
    manifest = {
        "character": args.character,
        "method": args.method,
        "total_images": len(image_paths),
        "selected_count": len(sequence),
        "images": []
    }

    for i, idx in enumerate(sequence):
        src_path = valid_paths[idx]
        dst_path = output_dir / f"frame_{i:04d}.png"

        # 複製圖片
        import shutil
        shutil.copy2(src_path, dst_path)

        selected_paths.append(dst_path)
        manifest["images"].append({
            "index": i,
            "source": src_path.name,
            "path": dst_path.name
        })

        logger.info(f"  [{i+1:2d}] {src_path.name} -> {dst_path.name}")

    # 保存 manifest
    manifest_path = output_dir / "sequence_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"\n{'='*60}")
    logger.info(f"✓ Sequence saved to: {output_dir}")
    logger.info(f"✓ Manifest saved to: {manifest_path}")
    logger.info(f"{'='*60}")


if __name__ == "__main__":
    main()
