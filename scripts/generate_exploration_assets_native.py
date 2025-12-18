#!/usr/bin/env python3
"""
Super Wings Exploration Assets Generator - Native Diffusers Version
使用本地 diffusers + SDXL 生成探索系統資產

Usage:
    python scripts/generate_exploration_assets_native.py --category npcs --destination paris
    python scripts/generate_exploration_assets_native.py --category items
    python scripts/generate_exploration_assets_native.py --category interiors
    python scripts/generate_exploration_assets_native.py --test  # 快速測試
"""

import json
import argparse
import logging
import gc
import random
from pathlib import Path
from typing import Dict, List, Optional

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from PIL import Image

# rembg session (lazy load)
rembg_session = None

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def remove_background(input_path: Path, output_path: Path) -> bool:
    """使用 rembg 移除背景"""
    global rembg_session
    try:
        from rembg import remove, new_session
        import os

        os.environ["CUDA_VISIBLE_DEVICES"] = ""

        if rembg_session is None:
            logger.info("Initializing rembg session...")
            rembg_session = new_session("u2netp")

        with open(input_path, 'rb') as f:
            input_data = f.read()

        output_data = remove(input_data, session=rembg_session)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'wb') as f:
            f.write(output_data)

        return True
    except Exception as e:
        logger.error(f"Background removal failed: {e}")
        return False


class ExplorationAssetGeneratorNative:
    """使用 Native Diffusers 的探索資產生成器"""

    def __init__(self, project_root: Path, model_id: str = "stabilityai/stable-diffusion-xl-base-1.0"):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.model_id = model_id
        self.pipe = None

        # 載入配置
        self.npc_config = self._load_config("npcs.json")
        self.item_config = self._load_config("items.json")
        self.interior_config = self._load_config("building_interiors.json")

    def _load_config(self, filename: str) -> Dict:
        """載入配置檔案"""
        config_path = self.prompts_dir / filename
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        logger.warning(f"Config not found: {config_path}")
        return {}

    def _init_pipeline(self):
        """初始化 diffusers pipeline"""
        if self.pipe is not None:
            return

        logger.info(f"Loading model: {self.model_id}")

        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            self.model_id,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16"
        )

        # 使用 DPM++ scheduler 加速
        self.pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipe.scheduler.config
        )

        # 啟用 SDPA
        self.pipe.enable_attention_slicing()

        # 移到 GPU
        if torch.cuda.is_available():
            self.pipe = self.pipe.to("cuda")
            logger.info("Using CUDA")
        else:
            logger.info("Using CPU (slow)")

    def _generate_image(
        self,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        remove_bg: bool = False
    ):
        """生成單張圖片"""
        if output_path.exists():
            logger.info(f"Skipping existing: {output_path}")
            return

        self._init_pipeline()

        logger.info(f"Generating: {output_path.name}")
        logger.debug(f"Prompt: {prompt[:100]}...")

        seed = random.randint(1, 2**32 - 1)
        generator = torch.Generator().manual_seed(seed)

        try:
            image = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=7.0,
                generator=generator
            ).images[0]

            output_path.parent.mkdir(parents=True, exist_ok=True)

            if remove_bg:
                temp_path = output_path.with_suffix('.temp.png')
                image.save(temp_path)

                if remove_background(temp_path, output_path):
                    temp_path.unlink()
                    logger.info(f"Saved with transparent bg: {output_path}")
                else:
                    temp_path.rename(output_path)
                    logger.warning(f"BG removal failed, saved original: {output_path}")
            else:
                image.save(output_path)
                logger.info(f"Saved: {output_path}")

            # 清理 GPU 記憶體
            del image
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        except Exception as e:
            logger.error(f"Generation failed: {e}")

    # ==================== NPC 生成 ====================

    def generate_npcs(self, destination: str, count: int = 3):
        """生成 NPC 資產"""
        dest_config = self.npc_config.get("npc_templates", {}).get("destination_specific", {}).get(destination, {})
        archetypes = self.npc_config.get("npc_archetypes", [])

        output_path = self.output_dir / "npcs" / destination
        output_path.mkdir(parents=True, exist_ok=True)

        for i, archetype in enumerate(archetypes[:count]):
            npc_id = f"{destination}_{archetype['id']}"
            occupation = random.choice(archetype.get("occupations", ["person"]))
            gender = random.choice(["male", "female"])

            # 肖像
            prompt = (
                f"A friendly {gender} {occupation} character portrait, "
                f"{dest_config.get('cultural_elements', '')}, "
                f"Super Wings cartoon style, bright colors, "
                f"front-facing bust shot, friendly expression, "
                f"solid light blue background, high quality, clean lines"
            )

            negative = (
                "realistic, photograph, dark, scary, blurry, deformed, "
                "bad anatomy, complex background, text, watermark"
            )

            self._generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path / f"{npc_id}_portrait.png",
                width=256,
                height=256,
                remove_bg=True
            )

    # ==================== 物品生成 ====================

    def generate_items(self, category: str = "collectibles", count: int = 5):
        """生成物品圖標"""
        categories = self.item_config.get("item_categories", {})
        if category not in categories:
            logger.error(f"Unknown category: {category}")
            return

        config = categories[category]
        variants = config.get("variants", [])
        output_path = self.output_dir / "items" / category
        output_path.mkdir(parents=True, exist_ok=True)

        for item in variants[:count]:
            item_id = item.get("id", "item")
            item_prompt = item.get("prompt", "a game item")

            prompt = (
                f"{item_prompt}, "
                f"game item icon, cartoon style, "
                f"centered, solid gray background, "
                f"high quality, clean edges"
            )

            negative = (
                "realistic, photograph, dark, blurry, "
                "complex background, text, watermark"
            )

            self._generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path / f"{item_id}.png",
                width=128,
                height=128,
                remove_bg=True
            )

    def generate_food_items(self, destination: str):
        """生成特定目的地的食物"""
        food_config = self.item_config.get("item_categories", {}).get("food", {})
        dest_variants = food_config.get("destination_variants", {}).get(destination, [])

        output_path = self.output_dir / "items" / "food" / destination
        output_path.mkdir(parents=True, exist_ok=True)

        for item in dest_variants:
            item_id = item.get("id", "food")
            item_prompt = item.get("prompt", "food item")

            prompt = (
                f"{item_prompt}, "
                f"delicious food icon, appetizing, "
                f"cartoon style, centered, "
                f"solid white background"
            )

            self._generate_image(
                prompt=prompt,
                negative_prompt="realistic, dark, unappetizing, blurry",
                output_path=output_path / f"{item_id}.png",
                width=128,
                height=128,
                remove_bg=True
            )

    # ==================== 建築內部生成 ====================

    def generate_interior(self, building_type: str, variant_id: str):
        """生成建築內部背景"""
        building_types = self.interior_config.get("building_types", {})
        if building_type not in building_types:
            logger.error(f"Unknown building type: {building_type}")
            return

        config = building_types[building_type]
        variant = None
        for v in config.get("variants", []):
            if v.get("id") == variant_id:
                variant = v
                break

        if not variant:
            logger.error(f"Unknown variant: {variant_id}")
            return

        output_path = self.output_dir / "interiors" / building_type
        output_path.mkdir(parents=True, exist_ok=True)

        prompt = (
            f"{variant.get('prompt', '')}, "
            f"2D platformer game background, "
            f"side-scrolling view, cartoon style, "
            f"vibrant colors, high quality"
        )

        negative = (
            "realistic photo, 3D render, dark, horror, "
            "blurry, low quality, nsfw"
        )

        self._generate_image(
            prompt=prompt,
            negative_prompt=negative,
            output_path=output_path / f"{variant_id}_bg.png",
            width=1024,  # 較小尺寸以加速
            height=576,
            steps=25,
            remove_bg=False
        )

    def generate_interiors_batch(self, building_type: str = "shop"):
        """批量生成建築內部"""
        building_types = self.interior_config.get("building_types", {})
        if building_type not in building_types:
            logger.error(f"Unknown building type: {building_type}")
            return

        config = building_types[building_type]
        for variant in config.get("variants", [])[:3]:  # 每類型 3 個
            variant_id = variant.get("id")
            self.generate_interior(building_type, variant_id)

    # ==================== 測試 ====================

    def run_test(self):
        """快速測試生成"""
        logger.info("=== 快速測試 ===")

        # 測試 NPC
        output_path = self.output_dir / "test"
        output_path.mkdir(parents=True, exist_ok=True)

        logger.info("生成測試 NPC...")
        self._generate_image(
            prompt="A friendly French baker character, Super Wings cartoon style, "
                   "front-facing portrait, warm smile, chef hat, "
                   "solid blue background, high quality",
            negative_prompt="realistic, dark, scary, blurry",
            output_path=output_path / "test_npc.png",
            width=256,
            height=256,
            remove_bg=True
        )

        logger.info("生成測試物品...")
        self._generate_image(
            prompt="A golden croissant pastry, game item icon, "
                   "cartoon style, centered, solid gray background",
            negative_prompt="realistic, dark, blurry",
            output_path=output_path / "test_item.png",
            width=128,
            height=128,
            remove_bg=True
        )

        logger.info("生成測試背景...")
        self._generate_image(
            prompt="Cozy bakery interior, 2D platformer game background, "
                   "side-scrolling view, display cases with pastries, "
                   "warm oven glow, cartoon style",
            negative_prompt="realistic, 3D, dark, horror",
            output_path=output_path / "test_interior.png",
            width=1024,
            height=576,
            steps=25,
            remove_bg=False
        )

        logger.info("=== 測試完成 ===")

    def cleanup(self):
        """清理資源"""
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def main():
    parser = argparse.ArgumentParser(description="Exploration Assets Generator (Native)")
    parser.add_argument("--test", action="store_true", help="Run quick test")
    parser.add_argument("--category", choices=["npcs", "items", "food", "interiors"])
    parser.add_argument("--destination", default="paris")
    parser.add_argument("--building-type", default="shop")
    parser.add_argument("--item-category", default="collectibles")
    parser.add_argument("--count", type=int, default=3)

    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    generator = ExplorationAssetGeneratorNative(project_root)

    try:
        if args.test:
            generator.run_test()
        elif args.category == "npcs":
            generator.generate_npcs(args.destination, args.count)
        elif args.category == "items":
            generator.generate_items(args.item_category, args.count)
        elif args.category == "food":
            generator.generate_food_items(args.destination)
        elif args.category == "interiors":
            generator.generate_interiors_batch(args.building_type)
        else:
            parser.print_help()
    finally:
        generator.cleanup()


if __name__ == "__main__":
    main()
