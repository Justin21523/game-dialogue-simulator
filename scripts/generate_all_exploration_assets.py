#!/usr/bin/env python3
"""
Super Wings 探索系統 - 完整資產批量生成腳本
一次生成所有地點的 NPC、食物、建築內部、物品等資產

Usage:
    python scripts/generate_all_exploration_assets.py                    # 生成全部
    python scripts/generate_all_exploration_assets.py --skip-existing    # 跳過已存在
    python scripts/generate_all_exploration_assets.py --destinations paris,tokyo  # 特定地點
    python scripts/generate_all_exploration_assets.py --categories npcs,items     # 特定類別
    python scripts/generate_all_exploration_assets.py --dry-run          # 預覽不生成

Categories:
    - npcs: NPC 肖像 (每個地點 5 個)
    - food: 各地美食 (每個地點 2-3 個)
    - items: 通用物品 (包裹、收集品、鑰匙、工具、任務物品)
    - interiors: 建築內部 (商店、餐廳、公共建築、住宅、特殊場所)
"""

import json
import argparse
import logging
import gc
import random
import time
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from PIL import Image

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 配置 ====================

# 所有目的地
ALL_DESTINATIONS = [
    "paris", "tokyo", "new_york", "cairo",
    "sydney", "rio", "beijing", "london"
]

# 所有建築類型
ALL_BUILDING_TYPES = [
    "shop", "restaurant", "public_building", "residence", "special"
]

# 所有物品類別
ALL_ITEM_CATEGORIES = [
    "packages", "collectibles", "keys", "tools", "quest_items", "ability_items"
]

# 每個類別的生成數量
COUNTS = {
    "npcs_per_destination": 5,
    "food_per_destination": 3,
    "items_per_category": 6,
    "interiors_per_type": 3
}

# rembg session
rembg_session = None


def remove_background(input_path: Path, output_path: Path) -> bool:
    """使用 rembg 移除背景"""
    global rembg_session
    try:
        from rembg import remove, new_session
        import os
        os.environ["CUDA_VISIBLE_DEVICES"] = ""

        if rembg_session is None:
            logger.info("初始化 rembg...")
            rembg_session = new_session("u2netp")

        with open(input_path, 'rb') as f:
            input_data = f.read()

        output_data = remove(input_data, session=rembg_session)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'wb') as f:
            f.write(output_data)

        return True
    except Exception as e:
        logger.error(f"背景移除失敗: {e}")
        return False


class FullAssetGenerator:
    """完整資產生成器"""

    def __init__(self, project_root: Path, skip_existing: bool = True):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.skip_existing = skip_existing
        self.pipe = None

        # 載入配置
        self.npc_config = self._load_config("npcs.json")
        self.item_config = self._load_config("items.json")
        self.interior_config = self._load_config("building_interiors.json")

        # 統計
        self.stats = {
            "generated": 0,
            "skipped": 0,
            "failed": 0,
            "start_time": None
        }

    def _load_config(self, filename: str) -> Dict:
        config_path = self.prompts_dir / filename
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def _init_pipeline(self):
        if self.pipe is not None:
            return

        logger.info("載入 Stable Diffusion XL 模型...")
        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16"
        )
        self.pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipe.scheduler.config
        )
        self.pipe.enable_attention_slicing()

        if torch.cuda.is_available():
            self.pipe = self.pipe.to("cuda")
            logger.info("使用 CUDA GPU")
        else:
            logger.warning("使用 CPU (較慢)")

    def _generate_image(
        self,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        width: int = 512,
        height: int = 512,
        steps: int = 30,
        guidance_scale: float = 8.5,
        remove_bg: bool = False
    ) -> bool:
        """生成單張圖片"""
        if self.skip_existing and output_path.exists():
            logger.info(f"跳過已存在: {output_path.name}")
            self.stats["skipped"] += 1
            return True

        self._init_pipeline()

        seed = random.randint(1, 2**32 - 1)
        generator = torch.Generator().manual_seed(seed)

        try:
            image = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=generator
            ).images[0]

            output_path.parent.mkdir(parents=True, exist_ok=True)

            if remove_bg:
                temp_path = output_path.with_suffix('.temp.png')
                image.save(temp_path)
                if remove_background(temp_path, output_path):
                    temp_path.unlink()
                else:
                    temp_path.rename(output_path)
            else:
                image.save(output_path)

            logger.info(f"✓ 生成: {output_path.name}")
            self.stats["generated"] += 1

            del image
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            return True

        except Exception as e:
            logger.error(f"✗ 失敗: {output_path.name} - {e}")
            self.stats["failed"] += 1
            return False

    # ==================== NPC 生成 ====================

    def generate_all_npcs(self, destinations: List[str] = None):
        """生成所有地點的 NPC"""
        destinations = destinations or ALL_DESTINATIONS
        archetypes = self.npc_config.get("npc_archetypes", [])

        logger.info(f"\n{'='*50}")
        logger.info(f"開始生成 NPC - {len(destinations)} 個地點")
        logger.info(f"{'='*50}")

        # 目的地文化特徵
        dest_cultures = {
            "paris": "French Parisian style, elegant beret or scarf, European fashion",
            "tokyo": "Japanese style, kimono or modern Tokyo fashion, anime-influenced",
            "new_york": "American New Yorker style, casual urban fashion, diverse",
            "cairo": "Egyptian Middle Eastern style, traditional or modern Arab fashion",
            "sydney": "Australian style, casual outdoor wear, beach vibes",
            "rio": "Brazilian Rio style, colorful tropical fashion, carnival spirit",
            "beijing": "Chinese style, traditional or modern Chinese fashion elements",
            "london": "British London style, classic English fashion, distinguished"
        }

        # 高品質 NPC prompt 風格
        base_style = (
            "masterpiece quality, best quality, "
            "professional character design illustration, "
            "Disney Pixar animation style character portrait, "
            "3D rendered look with soft cel-shading, "
            "friendly approachable expression, warm smile, "
            "vibrant saturated colors, soft studio lighting, "
            "clean solid pastel background, "
            "head and shoulders portrait, looking at viewer"
        )

        negative = (
            "realistic photograph, photorealistic, uncanny valley, "
            "low quality, blurry, pixelated, deformed face, "
            "bad anatomy, extra limbs, mutated, ugly, "
            "dark moody lighting, scary, creepy, "
            "complex background, text, watermark, signature, "
            "nsfw, inappropriate content, "
            "full body, half body, too zoomed out"
        )

        for dest in destinations:
            logger.info(f"\n--- {dest.upper()} NPC ---")
            dest_config = self.npc_config.get("npc_templates", {}).get(
                "destination_specific", {}
            ).get(dest, {})

            output_path = self.output_dir / "npcs" / dest
            cultural = dest_cultures.get(dest, "")
            config_cultural = dest_config.get("cultural_elements", "")

            for archetype in archetypes[:COUNTS["npcs_per_destination"]]:
                npc_id = f"{dest}_{archetype['id']}"
                occupation = random.choice(archetype.get("occupations", ["person"]))
                gender = random.choice(["male", "female"])
                age_range = archetype.get("age_range", "adult")

                # 年齡描述
                age_desc = {
                    "child": "young child, 8-12 years old",
                    "adult": "adult, 30-45 years old",
                    "elderly": "elderly, 65-75 years old, wise appearance"
                }.get(age_range, "adult")

                prompt = (
                    f"A friendly {gender} {occupation} character, {age_desc}, "
                    f"{cultural}, {config_cultural}, "
                    f"wearing appropriate cultural attire for their profession, "
                    f"{base_style}"
                )

                self._generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path / f"{npc_id}_portrait.png",
                    width=384,
                    height=384,
                    steps=35,
                    guidance_scale=8.5,
                    remove_bg=True
                )

    # ==================== 食物生成 ====================

    def generate_all_food(self, destinations: List[str] = None):
        """生成所有地點的食物"""
        destinations = destinations or ALL_DESTINATIONS
        food_config = self.item_config.get("item_categories", {}).get("food", {})
        dest_variants = food_config.get("destination_variants", {})

        logger.info(f"\n{'='*50}")
        logger.info(f"開始生成食物 - {len(destinations)} 個地點")
        logger.info(f"{'='*50}")

        # 高品質食物 prompt 風格
        style_suffix = (
            "masterpiece quality, best quality, "
            "professional food illustration, "
            "cute kawaii cartoon style like Studio Ghibli food art, "
            "cel-shaded, soft lighting, appetizing colors, "
            "single item centered on pure white background, "
            "game asset icon, ultra detailed, crisp edges"
        )

        negative = (
            "realistic photograph, 3D render, low quality, blurry, "
            "dark shadows, multiple items, complex background, "
            "text, watermark, signature, frame, border, "
            "unappetizing, burnt, messy, dirty"
        )

        for dest in destinations:
            if dest not in dest_variants:
                logger.warning(f"無 {dest} 的食物配置，跳過")
                continue

            logger.info(f"\n--- {dest.upper()} 食物 ---")
            output_path = self.output_dir / "items" / "food" / dest

            for item in dest_variants[dest][:COUNTS["food_per_destination"]]:
                item_id = item.get("id", "food")
                item_prompt = item.get("prompt", "food item")

                prompt = (
                    f"{item_prompt}, "
                    f"{style_suffix}"
                )

                self._generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path / f"{item_id}.png",
                    width=256,
                    height=256,
                    steps=35,
                    guidance_scale=9.0,
                    remove_bg=True
                )

    # ==================== 物品生成 ====================

    def generate_all_items(self, categories: List[str] = None):
        """生成所有類別的物品"""
        categories = categories or ALL_ITEM_CATEGORIES
        item_categories = self.item_config.get("item_categories", {})

        logger.info(f"\n{'='*50}")
        logger.info(f"開始生成物品 - {len(categories)} 個類別")
        logger.info(f"{'='*50}")

        # 類別特定風格
        category_styles = {
            "packages": "postal delivery package, shipping box style, friendly cute design",
            "collectibles": "shiny glowing treasure, sparkle effect, video game collectible",
            "keys": "fantasy RPG game key, ornate decorative design, magical item",
            "tools": "cartoon tool item, Pixar style prop, clean professional design",
            "quest_items": "special magical item with subtle golden glow, important quest object",
            "ability_items": "Super Wings character themed item, colorful robot accessory"
        }

        # 高品質物品 prompt 基礎風格
        base_style = (
            "masterpiece quality, best quality, "
            "professional game asset illustration, "
            "cute cartoon style similar to Angry Birds or Clash Royale icons, "
            "cel-shaded with soft shadows, "
            "single item perfectly centered on solid light gray background, "
            "clean vector-like edges, vibrant saturated colors, "
            "isometric view slightly tilted, glossy finish"
        )

        negative = (
            "realistic photograph, 3D render, photorealistic, "
            "low quality, blurry, pixelated, "
            "dark moody lighting, multiple items, "
            "complex busy background, gradient background, "
            "text, watermark, signature, frame, border, "
            "dull colors, flat shading, amateur art"
        )

        for category in categories:
            if category == "food":
                continue  # 食物單獨處理

            if category not in item_categories:
                logger.warning(f"無 {category} 類別配置，跳過")
                continue

            logger.info(f"\n--- {category.upper()} 物品 ---")
            config = item_categories[category]
            variants = config.get("variants", [])
            output_path = self.output_dir / "items" / category
            cat_style = category_styles.get(category, "game item")

            for item in variants[:COUNTS["items_per_category"]]:
                item_id = item.get("id", f"{category}_item")
                item_prompt = item.get("prompt", "a game item")
                rarity = item.get("rarity", "common")

                # 根據稀有度添加特效
                rarity_effect = ""
                if rarity == "rare":
                    rarity_effect = ", glowing magical aura, sparkle particles"
                elif rarity == "uncommon":
                    rarity_effect = ", subtle shine, slight glow"
                elif rarity == "quest":
                    rarity_effect = ", golden glow effect, important looking, magical shimmer"

                prompt = (
                    f"{item_prompt}, "
                    f"{cat_style}{rarity_effect}, "
                    f"{base_style}"
                )

                self._generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path / f"{item_id}.png",
                    width=256,
                    height=256,
                    steps=35,
                    guidance_scale=9.0,
                    remove_bg=True
                )

    # ==================== 建築內部生成 ====================

    def generate_all_interiors(self, building_types: List[str] = None):
        """生成所有建築類型的內部"""
        building_types = building_types or ALL_BUILDING_TYPES
        all_building_config = self.interior_config.get("building_types", {})

        logger.info(f"\n{'='*50}")
        logger.info(f"開始生成建築內部 - {len(building_types)} 種類型")
        logger.info(f"{'='*50}")

        # 高品質建築內部 prompt 風格
        base_style = (
            "masterpiece quality, best quality, "
            "professional game background art, "
            "2D side-scrolling platformer game interior, "
            "clean cartoon illustration style like Rayman or Cuphead, "
            "vibrant saturated colors, soft ambient lighting, "
            "clear foreground and background layers, "
            "cozy welcoming atmosphere, no characters present, "
            "wide angle view showing full room interior"
        )

        negative = (
            "realistic photograph, 3D render, photorealistic, "
            "low quality, blurry, pixelated, "
            "dark moody horror style, scary, "
            "characters, people, animals visible, "
            "text, watermark, signature, UI elements, "
            "isometric view, top-down view, first person view"
        )

        for btype in building_types:
            if btype not in all_building_config:
                logger.warning(f"無 {btype} 建築配置，跳過")
                continue

            logger.info(f"\n--- {btype.upper()} 內部 ---")
            config = all_building_config[btype]
            variants = config.get("variants", [])
            output_path = self.output_dir / "interiors" / btype

            for variant in variants[:COUNTS["interiors_per_type"]]:
                variant_id = variant.get("id", "room")
                variant_prompt = variant.get("prompt", "interior room")

                prompt = (
                    f"{variant_prompt}, "
                    f"interior scene with furniture and decorations, "
                    f"{base_style}"
                )

                self._generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path / f"{variant_id}_bg.png",
                    width=1280,
                    height=720,
                    steps=35,
                    guidance_scale=8.5,
                    remove_bg=False
                )

    # ==================== 目的地風格建築 ====================

    def generate_destination_interiors(self, destinations: List[str] = None):
        """生成各目的地風格的建築內部"""
        destinations = destinations or ALL_DESTINATIONS
        dest_styles = self.interior_config.get("destination_styles", {})
        all_building_config = self.interior_config.get("building_types", {})

        logger.info(f"\n{'='*50}")
        logger.info(f"開始生成目的地風格建築 - {len(destinations)} 個地點")
        logger.info(f"{'='*50}")

        # 目的地建築風格詳細描述
        dest_arch_styles = {
            "paris": "elegant Parisian French interior, ornate moldings, Art Nouveau details, warm golden lighting",
            "tokyo": "modern Japanese interior, minimalist zen design, shoji screens, natural wood elements",
            "new_york": "New York urban loft style, exposed brick, industrial chic, modern American",
            "cairo": "Egyptian Middle Eastern interior, arched doorways, mosaic tiles, warm earthy tones",
            "sydney": "Australian coastal style interior, light airy beach house, modern coastal design",
            "rio": "Brazilian tropical interior, colorful carnival spirit, natural materials, vibrant",
            "beijing": "Chinese traditional interior, red and gold accents, lanterns, oriental design",
            "london": "British Victorian interior, elegant classic English design, cozy warm atmosphere"
        }

        # 高品質建築內部 prompt 風格
        base_style = (
            "masterpiece quality, best quality, "
            "professional game background art, "
            "2D side-scrolling platformer game interior, "
            "clean cartoon illustration style like Rayman or Cuphead, "
            "vibrant saturated colors, soft ambient lighting, "
            "clear foreground and background layers, "
            "cozy welcoming atmosphere, no characters present, "
            "wide angle view showing full room interior"
        )

        negative = (
            "realistic photograph, 3D render, photorealistic, "
            "low quality, blurry, pixelated, "
            "dark moody horror style, scary, "
            "characters, people, animals visible, "
            "text, watermark, signature, UI elements, "
            "isometric view, top-down view, first person view"
        )

        # 每個目的地生成 2 種主要建築類型
        main_types = ["shop", "restaurant"]

        for dest in destinations:
            logger.info(f"\n--- {dest.upper()} 風格建築 ---")
            dest_style = dest_arch_styles.get(dest, "")
            config_style = dest_styles.get(dest, {})

            for btype in main_types:
                if btype not in all_building_config:
                    continue

                config = all_building_config[btype]
                variants = config.get("variants", [])[:2]  # 每類型 2 個
                output_path = self.output_dir / "interiors" / dest / btype

                for variant in variants:
                    variant_id = variant.get("id", "room")
                    variant_prompt = variant.get("prompt", "interior")

                    prompt = (
                        f"{variant_prompt}, "
                        f"{dest_style}, "
                        f"{config_style.get('architectural_style', '')}, "
                        f"decorated with {config_style.get('decorations', 'cultural items')}, "
                        f"{base_style}"
                    )

                    self._generate_image(
                        prompt=prompt,
                        negative_prompt=negative,
                        output_path=output_path / f"{variant_id}_bg.png",
                        width=1280,
                        height=720,
                        steps=35,
                        guidance_scale=8.5,
                        remove_bg=False
                    )

    # ==================== 完整生成 ====================

    def generate_all(
        self,
        destinations: List[str] = None,
        categories: List[str] = None,
        dry_run: bool = False
    ):
        """生成所有資產"""
        self.stats["start_time"] = datetime.now()
        destinations = destinations or ALL_DESTINATIONS
        categories = categories or ["npcs", "food", "items", "interiors", "dest_interiors"]

        logger.info(f"\n{'#'*60}")
        logger.info(f"Super Wings 探索系統 - 完整資產生成")
        logger.info(f"{'#'*60}")
        logger.info(f"目的地: {', '.join(destinations)}")
        logger.info(f"類別: {', '.join(categories)}")
        logger.info(f"跳過已存在: {self.skip_existing}")

        if dry_run:
            logger.info("\n[DRY RUN] 預覽模式，不會實際生成")
            self._preview_generation(destinations, categories)
            return

        logger.info(f"\n開始時間: {self.stats['start_time']}")

        try:
            if "npcs" in categories:
                self.generate_all_npcs(destinations)

            if "food" in categories:
                self.generate_all_food(destinations)

            if "items" in categories:
                self.generate_all_items()

            if "interiors" in categories:
                self.generate_all_interiors()

            if "dest_interiors" in categories:
                self.generate_destination_interiors(destinations)

        finally:
            self._print_summary()
            self.cleanup()

    def _preview_generation(self, destinations: List[str], categories: List[str]):
        """預覽將要生成的內容"""
        total = 0

        if "npcs" in categories:
            count = len(destinations) * COUNTS["npcs_per_destination"]
            logger.info(f"  NPC: {count} 張")
            total += count

        if "food" in categories:
            count = len(destinations) * COUNTS["food_per_destination"]
            logger.info(f"  食物: {count} 張")
            total += count

        if "items" in categories:
            count = len(ALL_ITEM_CATEGORIES) * COUNTS["items_per_category"]
            logger.info(f"  物品: {count} 張")
            total += count

        if "interiors" in categories:
            count = len(ALL_BUILDING_TYPES) * COUNTS["interiors_per_type"]
            logger.info(f"  通用建築內部: {count} 張")
            total += count

        if "dest_interiors" in categories:
            count = len(destinations) * 2 * 2  # 2 types * 2 variants
            logger.info(f"  目的地風格建築: {count} 張")
            total += count

        logger.info(f"\n預計總共生成: {total} 張圖片")
        logger.info(f"預計時間: 約 {total * 3 // 60} 分鐘")

    def _print_summary(self):
        """列印生成摘要"""
        end_time = datetime.now()
        duration = end_time - self.stats["start_time"]

        logger.info(f"\n{'='*60}")
        logger.info(f"生成完成！")
        logger.info(f"{'='*60}")
        logger.info(f"成功生成: {self.stats['generated']} 張")
        logger.info(f"已跳過: {self.stats['skipped']} 張")
        logger.info(f"失敗: {self.stats['failed']} 張")
        logger.info(f"總耗時: {duration}")
        logger.info(f"{'='*60}")

    def cleanup(self):
        """清理資源"""
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("GPU 記憶體已清理")


def main():
    parser = argparse.ArgumentParser(
        description="Super Wings 探索系統 - 完整資產批量生成",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  python scripts/generate_all_exploration_assets.py                    # 生成全部
  python scripts/generate_all_exploration_assets.py --dry-run          # 預覽
  python scripts/generate_all_exploration_assets.py --destinations paris,tokyo
  python scripts/generate_all_exploration_assets.py --categories npcs,food
  python scripts/generate_all_exploration_assets.py --no-skip          # 不跳過已存在
        """
    )

    parser.add_argument(
        "--destinations",
        type=str,
        help=f"目的地列表，逗號分隔 (可用: {', '.join(ALL_DESTINATIONS)})"
    )
    parser.add_argument(
        "--categories",
        type=str,
        help="類別列表，逗號分隔 (可用: npcs, food, items, interiors, dest_interiors)"
    )
    parser.add_argument(
        "--no-skip",
        action="store_true",
        help="不跳過已存在的檔案，重新生成"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="預覽模式，不實際生成"
    )

    args = parser.parse_args()

    # 解析參數
    destinations = None
    if args.destinations:
        destinations = [d.strip() for d in args.destinations.split(",")]

    categories = None
    if args.categories:
        categories = [c.strip() for c in args.categories.split(",")]

    # 執行生成
    project_root = Path(__file__).parent.parent
    generator = FullAssetGenerator(
        project_root,
        skip_existing=not args.no_skip
    )

    generator.generate_all(
        destinations=destinations,
        categories=categories,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
