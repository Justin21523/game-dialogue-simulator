#!/usr/bin/env python3
"""
Super Wings Exploration Assets Generator
生成探索系統所需的 NPC、物品、建築內部資產

Usage:
    python scripts/generate_exploration_assets.py --category npcs        # 生成 NPC
    python scripts/generate_exploration_assets.py --category items       # 生成物品
    python scripts/generate_exploration_assets.py --category interiors   # 生成建築內部
    python scripts/generate_exploration_assets.py --destination paris    # 特定目的地
    python scripts/generate_exploration_assets.py --all                  # 生成全部

Requirements:
    - ComfyUI running at http://127.0.0.1:8188
    - SDXL base model loaded
    - rembg for background removal (NPCs and items)
"""

import json
import argparse
import uuid
import time
import logging
import random
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import urllib.request
import urllib.parse

# 延遲載入
websocket = None
rembg_session = None

# 配置
VARIATIONS_PER_PROMPT = 2  # 每個提示詞生成的變體數
COMFYUI_ADDRESS = "127.0.0.1:8188"

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def remove_background(input_path: Path, output_path: Path) -> bool:
    """使用 rembg 移除背景，創建透明 PNG"""
    global rembg_session
    try:
        from rembg import remove, new_session

        if rembg_session is None:
            logger.info("Initializing rembg session...")
            rembg_session = new_session("u2net")

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


class ComfyUIClient:
    """ComfyUI API 客戶端"""

    def __init__(self, server_address: str = COMFYUI_ADDRESS):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())

    def queue_prompt(self, prompt: dict) -> dict:
        """將 prompt 加入 ComfyUI 隊列"""
        p = {"prompt": prompt, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        req = urllib.request.Request(
            f"http://{self.server_address}/prompt",
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        return json.loads(urllib.request.urlopen(req).read())

    def get_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        """從 ComfyUI 獲取生成的圖片"""
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        with urllib.request.urlopen(
            f"http://{self.server_address}/view?{url_values}"
        ) as response:
            return response.read()

    def get_history(self, prompt_id: str) -> dict:
        """獲取生成歷史"""
        with urllib.request.urlopen(
            f"http://{self.server_address}/history/{prompt_id}"
        ) as response:
            return json.loads(response.read())

    def wait_for_completion(self, prompt_id: str, timeout: int = 300) -> dict:
        """等待生成完成並返回結果"""
        global websocket
        if websocket is None:
            import websocket as ws_module
            websocket = ws_module
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_address}/ws?clientId={self.client_id}")

        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                ws.close()
                raise TimeoutError(f"Generation timed out after {timeout} seconds")

            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        break

            time.sleep(0.1)

        ws.close()
        return self.get_history(prompt_id)


class ExplorationAssetGenerator:
    """探索系統資產生成器"""

    def __init__(self, project_root: Path, comfyui_address: str = COMFYUI_ADDRESS):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.client = ComfyUIClient(comfyui_address)

        # 載入提示詞配置
        self.npc_config = self._load_config("npcs.json")
        self.item_config = self._load_config("items.json")
        self.interior_config = self._load_config("building_interiors.json")

        # 優先目的地列表
        self.priority_destinations = ["paris", "tokyo", "new_york"]

    def _load_config(self, filename: str) -> Dict:
        """載入配置檔案"""
        config_path = self.prompts_dir / filename
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        logger.warning(f"Config file not found: {config_path}")
        return {}

    # ==================== NPC 生成 ====================

    def generate_npcs(self, destination: Optional[str] = None):
        """生成 NPC 資產"""
        destinations = [destination] if destination else self.priority_destinations

        for dest in destinations:
            logger.info(f"Generating NPCs for destination: {dest}")
            self._generate_npcs_for_destination(dest)

    def _generate_npcs_for_destination(self, destination: str):
        """為特定目的地生成 NPC"""
        dest_config = self.npc_config.get("npc_templates", {}).get("destination_specific", {}).get(destination, {})
        archetypes = self.npc_config.get("npc_archetypes", [])

        output_path = self.output_dir / "npcs" / destination
        output_path.mkdir(parents=True, exist_ok=True)

        # 為每個原型生成一個 NPC
        for archetype in archetypes[:5]:  # 每個目的地 5 個 NPC
            npc_id = f"{destination}_{archetype['id']}"

            # 生成肖像
            self._generate_npc_portrait(npc_id, archetype, dest_config, output_path)

            # 生成全身像
            self._generate_npc_fullbody(npc_id, archetype, dest_config, output_path)

    def _generate_npc_portrait(self, npc_id: str, archetype: Dict, dest_config: Dict, output_path: Path):
        """生成 NPC 肖像"""
        base_style = self.npc_config.get("base_style", {})
        portrait_config = self.npc_config.get("portrait_config", {})

        # 隨機選擇職業和性別
        occupation = random.choice(archetype.get("occupations", ["person"]))
        gender = random.choice(["male", "female"])
        age = random.choice(["adult", "young adult"])

        cultural = dest_config.get("cultural_elements", "")

        prompt = (
            f"A friendly {age} {gender} {occupation} character, "
            f"{cultural}, "
            f"{base_style.get('art_style', 'cartoon style')}, "
            f"front-facing bust shot portrait, "
            f"neutral friendly expression, "
            f"solid light blue background for easy removal, "
            f"{base_style.get('quality', 'high quality')}"
        )

        negative_prompt = (
            "realistic, photograph, dark, scary, complex background, "
            "blurry, deformed, ugly, bad anatomy"
        )

        logger.info(f"Generating portrait for {npc_id}")
        self._generate_image(
            prompt=prompt,
            negative_prompt=negative_prompt,
            output_file=output_path / f"{npc_id}_portrait.png",
            width=256,
            height=256,
            remove_bg=True
        )

    def _generate_npc_fullbody(self, npc_id: str, archetype: Dict, dest_config: Dict, output_path: Path):
        """生成 NPC 全身像"""
        base_style = self.npc_config.get("base_style", {})

        occupation = random.choice(archetype.get("occupations", ["person"]))
        gender = random.choice(["male", "female"])

        prompt = (
            f"A friendly {gender} {occupation} character, "
            f"full body standing pose, "
            f"{archetype.get('prompt_additions', '')}, "
            f"{dest_config.get('cultural_elements', '')}, "
            f"{base_style.get('art_style', 'cartoon style')}, "
            f"solid light blue background, "
            f"{base_style.get('quality', 'high quality')}"
        )

        negative_prompt = (
            "realistic, photograph, dark, scary, complex background, "
            "blurry, deformed, ugly, bad anatomy, cropped"
        )

        logger.info(f"Generating fullbody for {npc_id}")
        self._generate_image(
            prompt=prompt,
            negative_prompt=negative_prompt,
            output_file=output_path / f"{npc_id}_full.png",
            width=512,
            height=768,
            remove_bg=True
        )

    # ==================== 物品生成 ====================

    def generate_items(self, category: Optional[str] = None):
        """生成物品資產"""
        categories = self.item_config.get("item_categories", {})

        if category:
            if category in categories:
                self._generate_items_for_category(category, categories[category])
            else:
                logger.error(f"Unknown item category: {category}")
        else:
            # 優先類別
            priority = self.item_config.get("batch_config", {}).get("priority_categories", [])
            for cat in priority:
                if cat in categories:
                    self._generate_items_for_category(cat, categories[cat])

    def _generate_items_for_category(self, category: str, config: Dict):
        """生成特定類別的物品"""
        output_path = self.output_dir / "items" / category
        output_path.mkdir(parents=True, exist_ok=True)

        base_style = self.item_config.get("base_style", {})
        base_prompt = config.get("base_prompt", "")

        variants = config.get("variants", [])

        for item in variants:
            item_id = item.get("id", f"{category}_item")
            item_prompt = item.get("prompt", "")

            full_prompt = (
                f"{item_prompt}, "
                f"game item icon, "
                f"{base_style.get('art_style', 'cartoon style')}, "
                f"centered in frame, "
                f"solid light gray background, "
                f"{base_style.get('quality', 'high quality')}"
            )

            negative_prompt = (
                "realistic, photograph, dark, blurry, "
                "complex background, text, watermark"
            )

            logger.info(f"Generating item: {item_id}")
            self._generate_image(
                prompt=full_prompt,
                negative_prompt=negative_prompt,
                output_file=output_path / f"{item_id}.png",
                width=128,
                height=128,
                remove_bg=True
            )

    def generate_food_items(self, destination: Optional[str] = None):
        """生成特定目的地的食物物品"""
        food_config = self.item_config.get("item_categories", {}).get("food", {})
        dest_variants = food_config.get("destination_variants", {})

        destinations = [destination] if destination else self.priority_destinations

        for dest in destinations:
            if dest not in dest_variants:
                continue

            output_path = self.output_dir / "items" / "food" / dest
            output_path.mkdir(parents=True, exist_ok=True)

            for item in dest_variants[dest]:
                item_id = item.get("id", "food_item")
                item_prompt = item.get("prompt", "")

                full_prompt = (
                    f"{item_prompt}, "
                    f"delicious food icon, appetizing, "
                    f"cartoon illustration style, "
                    f"centered, solid white background"
                )

                logger.info(f"Generating food item: {item_id}")
                self._generate_image(
                    prompt=full_prompt,
                    negative_prompt="realistic photo, dark, unappetizing, blurry",
                    output_file=output_path / f"{item_id}.png",
                    width=128,
                    height=128,
                    remove_bg=True
                )

    # ==================== 建築內部生成 ====================

    def generate_interiors(self, building_type: Optional[str] = None):
        """生成建築內部背景"""
        building_types = self.interior_config.get("building_types", {})

        if building_type:
            if building_type in building_types:
                self._generate_interiors_for_type(building_type, building_types[building_type])
            else:
                logger.error(f"Unknown building type: {building_type}")
        else:
            for btype, config in building_types.items():
                self._generate_interiors_for_type(btype, config)

    def _generate_interiors_for_type(self, building_type: str, config: Dict):
        """生成特定類型的建築內部"""
        output_path = self.output_dir / "interiors" / building_type
        output_path.mkdir(parents=True, exist_ok=True)

        base_style = self.interior_config.get("base_style", {})
        variants = config.get("variants", [])

        for variant in variants:
            variant_id = variant.get("id", "room")
            variant_prompt = variant.get("prompt", "")

            full_prompt = (
                f"{variant_prompt}, "
                f"2D platformer game background, "
                f"side-scrolling view, "
                f"{base_style.get('art_style', 'cartoon style')}, "
                f"{base_style.get('quality', 'high quality')}, "
                f"vibrant colors, clear edges"
            )

            gen_config = self.interior_config.get("generation_config", {})
            negative_prompt = gen_config.get(
                "negative_prompt",
                "realistic photo, 3D render, dark, blurry, horror"
            )

            logger.info(f"Generating interior: {variant_id}")
            self._generate_image(
                prompt=full_prompt,
                negative_prompt=negative_prompt,
                output_file=output_path / f"{variant_id}_bg.png",
                width=1920,
                height=1080,
                remove_bg=False
            )

    def generate_interiors_by_destination(self, destination: str):
        """生成特定目的地風格的建築內部"""
        dest_style = self.interior_config.get("destination_styles", {}).get(destination, {})

        if not dest_style:
            logger.warning(f"No destination style found for: {destination}")
            return

        building_types = self.interior_config.get("building_types", {})
        output_base = self.output_dir / "interiors" / destination

        for btype, config in building_types.items():
            for variant in config.get("variants", [])[:2]:  # 每類型 2 個
                variant_id = variant.get("id", "room")
                output_path = output_base / btype
                output_path.mkdir(parents=True, exist_ok=True)

                full_prompt = (
                    f"{variant.get('prompt', '')}, "
                    f"{dest_style.get('architectural_style', '')}, "
                    f"color palette: {dest_style.get('color_palette', '')}, "
                    f"decorated with {dest_style.get('decorations', '')}, "
                    f"2D platformer game background, side-scrolling view"
                )

                logger.info(f"Generating {destination} style interior: {variant_id}")
                self._generate_image(
                    prompt=full_prompt,
                    negative_prompt="realistic, 3D, dark, horror",
                    output_file=output_path / f"{variant_id}_bg.png",
                    width=1920,
                    height=1080,
                    remove_bg=False
                )

    # ==================== 圖片生成核心 ====================

    def _generate_image(
        self,
        prompt: str,
        negative_prompt: str,
        output_file: Path,
        width: int,
        height: int,
        remove_bg: bool = False
    ):
        """生成單張圖片"""
        # 檢查是否已存在
        if output_file.exists():
            logger.info(f"Skipping existing file: {output_file}")
            return

        # 建立 ComfyUI workflow
        workflow = self._create_workflow(prompt, negative_prompt, width, height)

        try:
            # 發送到 ComfyUI
            result = self.client.queue_prompt(workflow)
            prompt_id = result['prompt_id']

            # 等待完成
            history = self.client.wait_for_completion(prompt_id)

            # 獲取生成的圖片
            outputs = history[prompt_id]['outputs']
            for node_id, node_output in outputs.items():
                if 'images' in node_output:
                    for image in node_output['images']:
                        image_data = self.client.get_image(
                            image['filename'],
                            image['subfolder'],
                            image['type']
                        )

                        # 暫存檔案
                        output_file.parent.mkdir(parents=True, exist_ok=True)
                        temp_file = output_file.with_suffix('.temp.png')
                        with open(temp_file, 'wb') as f:
                            f.write(image_data)

                        # 移除背景（如需要）
                        if remove_bg:
                            if remove_background(temp_file, output_file):
                                temp_file.unlink()
                                logger.info(f"Saved with transparent background: {output_file}")
                            else:
                                temp_file.rename(output_file)
                                logger.warning(f"Background removal failed, saved original: {output_file}")
                        else:
                            temp_file.rename(output_file)
                            logger.info(f"Saved: {output_file}")

                        return  # 只取第一張圖

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            self._create_placeholder(output_file, width, height)

    def _create_workflow(self, prompt: str, negative_prompt: str, width: int, height: int) -> Dict:
        """建立 ComfyUI workflow"""
        seed = random.randint(1, 2**32 - 1)

        return {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "cfg": 7,
                    "denoise": 1,
                    "latent_image": ["5", 0],
                    "model": ["4", 0],
                    "negative": ["7", 0],
                    "positive": ["6", 0],
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "seed": seed,
                    "steps": 25
                }
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "sd_xl_base_1.0.safetensors"
                }
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "batch_size": 1,
                    "height": height,
                    "width": width
                }
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "clip": ["4", 1],
                    "text": prompt
                }
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "clip": ["4", 1],
                    "text": negative_prompt
                }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["4", 2]
                }
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "exploration_asset",
                    "images": ["8", 0]
                }
            }
        }

    def _create_placeholder(self, output_file: Path, width: int, height: int):
        """創建佔位圖片（當生成失敗時）"""
        try:
            from PIL import Image, ImageDraw, ImageFont

            img = Image.new('RGBA', (width, height), (200, 200, 200, 255))
            draw = ImageDraw.Draw(img)

            # 繪製對角線
            draw.line([(0, 0), (width, height)], fill=(150, 150, 150), width=2)
            draw.line([(width, 0), (0, height)], fill=(150, 150, 150), width=2)

            # 繪製文字
            text = "PLACEHOLDER"
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
            except:
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (width - text_width) // 2
            y = (height - text_height) // 2
            draw.text((x, y), text, fill=(100, 100, 100), font=font)

            output_file.parent.mkdir(parents=True, exist_ok=True)
            img.save(output_file)
            logger.info(f"Created placeholder: {output_file}")

        except Exception as e:
            logger.error(f"Failed to create placeholder: {e}")

    # ==================== 批量生成 ====================

    def generate_all(self):
        """生成所有探索資產"""
        logger.info("Starting full exploration asset generation...")

        # 1. NPC
        logger.info("=== Generating NPCs ===")
        for dest in self.priority_destinations:
            self.generate_npcs(dest)

        # 2. 物品
        logger.info("=== Generating Items ===")
        self.generate_items()
        for dest in self.priority_destinations:
            self.generate_food_items(dest)

        # 3. 建築內部
        logger.info("=== Generating Interiors ===")
        self.generate_interiors()

        logger.info("All exploration assets generated!")

    def generate_for_destination(self, destination: str):
        """生成特定目的地的所有資產"""
        logger.info(f"Generating all assets for destination: {destination}")

        self.generate_npcs(destination)
        self.generate_food_items(destination)
        self.generate_interiors_by_destination(destination)

        logger.info(f"Completed asset generation for: {destination}")


def create_fallback_assets(project_root: Path):
    """創建不需要 AI 的 fallback 資產（簡單幾何形狀）"""
    from PIL import Image, ImageDraw

    output_dir = project_root / "assets" / "images" / "fallback"
    output_dir.mkdir(parents=True, exist_ok=True)

    # NPC 佔位（圓形頭像）
    npc_placeholder = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(npc_placeholder)
    draw.ellipse([28, 28, 228, 228], fill=(100, 150, 200, 255))
    draw.ellipse([90, 80, 110, 100], fill=(50, 50, 50, 255))  # 左眼
    draw.ellipse([146, 80, 166, 100], fill=(50, 50, 50, 255))  # 右眼
    draw.arc([90, 110, 166, 160], 0, 180, fill=(50, 50, 50, 255), width=3)  # 微笑
    npc_placeholder.save(output_dir / "npc_placeholder.png")

    # 物品佔位（方形圖標）
    item_placeholder = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    draw = ImageDraw.Draw(item_placeholder)
    draw.rounded_rectangle([8, 8, 120, 120], radius=10, fill=(200, 180, 100, 255))
    draw.text((40, 50), "?", fill=(100, 80, 50, 255))
    item_placeholder.save(output_dir / "item_placeholder.png")

    # 內部背景佔位（漸層矩形）
    interior_placeholder = Image.new('RGB', (1920, 1080), (200, 200, 200))
    draw = ImageDraw.Draw(interior_placeholder)
    # 地板
    draw.rectangle([0, 500, 1920, 1080], fill=(150, 120, 80))
    # 牆壁漸層
    for y in range(500):
        color = (180 + y // 10, 180 + y // 10, 190 + y // 10)
        draw.line([(0, y), (1920, y)], fill=color)
    interior_placeholder.save(output_dir / "interior_placeholder.png")

    logger.info(f"Created fallback assets in: {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Super Wings Exploration Assets Generator")
    parser.add_argument("--category", choices=["npcs", "items", "interiors"], help="Asset category")
    parser.add_argument("--destination", help="Specific destination (e.g., paris, tokyo)")
    parser.add_argument("--building-type", help="Specific building type for interiors")
    parser.add_argument("--item-category", help="Specific item category")
    parser.add_argument("--all", action="store_true", help="Generate all assets")
    parser.add_argument("--fallback", action="store_true", help="Create fallback placeholder assets")
    parser.add_argument("--comfyui", default=COMFYUI_ADDRESS, help="ComfyUI server address")

    args = parser.parse_args()

    project_root = Path(__file__).parent.parent

    if args.fallback:
        create_fallback_assets(project_root)
        return

    generator = ExplorationAssetGenerator(project_root, args.comfyui)

    if args.all:
        generator.generate_all()
    elif args.category == "npcs":
        generator.generate_npcs(args.destination)
    elif args.category == "items":
        if args.item_category:
            generator.generate_items(args.item_category)
        elif args.destination:
            generator.generate_food_items(args.destination)
        else:
            generator.generate_items()
    elif args.category == "interiors":
        if args.destination:
            generator.generate_interiors_by_destination(args.destination)
        elif args.building_type:
            generator.generate_interiors(args.building_type)
        else:
            generator.generate_interiors()
    elif args.destination:
        generator.generate_for_destination(args.destination)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
