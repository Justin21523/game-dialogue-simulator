#!/usr/bin/env python3
"""
Super Wings Game Assets Generator - ComfyUI Version
Phase 2 - Batch image generation script using ComfyUI API

Usage:
    python scripts/generate_assets.py --test                    # Test with Jett + Flip
    python scripts/generate_assets.py --category portraits      # Generate all portraits
    python scripts/generate_assets.py --characters jett,flip    # Specific characters
    python scripts/generate_assets.py --all                     # Generate everything

Requirements:
    - ComfyUI running at http://127.0.0.1:8188
    - SDXL base model loaded
    - LoRA models in configured paths
    - rembg for background removal

New Features:
    - Generates 3 variations per prompt with different random seeds
    - Character images use solid color background for easy removal
    - Automatic background removal with rembg for transparent PNGs
"""

import json
import argparse
import uuid
import time
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import urllib.request
import urllib.parse

# websocket 只在實際生成時需要，延遲載入
websocket = None
rembg_session = None

# 每個 prompt 生成的變體數量
VARIATIONS_PER_PROMPT = 3

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
        from PIL import Image

        # 初始化 rembg session (只做一次)
        if rembg_session is None:
            logger.info("Initializing rembg session...")
            rembg_session = new_session("u2net")

        # 讀取圖片
        with open(input_path, 'rb') as f:
            input_data = f.read()

        # 移除背景
        output_data = remove(input_data, session=rembg_session)

        # 儲存為透明 PNG
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'wb') as f:
            f.write(output_data)

        return True
    except Exception as e:
        logger.error(f"Background removal failed: {e}")
        return False


class ComfyUIClient:
    """ComfyUI API 客戶端"""

    def __init__(self, server_address: str = "127.0.0.1:8188"):
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
                        break  # 執行完成

            time.sleep(0.1)

        ws.close()
        return self.get_history(prompt_id)


class SuperWingsAssetGenerator:
    """Super Wings 遊戲素材生成器"""

    def __init__(self, project_root: Path, comfyui_address: str = "127.0.0.1:8188"):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.data_dir = project_root / "data"

        # ComfyUI 客戶端
        self.comfy = ComfyUIClient(comfyui_address)

        # 載入設定
        self.shared_settings = self._load_json("shared_settings.json")
        self.characters_data = self._load_json(
            self.data_dir / "characters.json",
            absolute=True
        )

        # 載入模板
        self.templates = {
            "portraits": self._load_json("character_portraits.json"),
            "states": self._load_json("character_states.json"),
            "expressions": self._load_json("character_expressions.json"),
            "backgrounds": self._load_json("backgrounds.json"),
            "ui_elements": self._load_json("ui_elements.json")
        }

        # 統計
        self.stats = {
            "total_generated": 0,
            "total_failed": 0,
            "errors": []
        }

    def _load_json(self, filename: str, absolute: bool = False) -> Dict:
        """載入 JSON 檔案"""
        if absolute:
            filepath = filename
        else:
            filepath = self.prompts_dir / filename

        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _build_character_prompt(self, template: Dict, character_id: str, use_solid_background: bool = True) -> str:
        """為角色組建完整的 prompt"""
        prompt_template = template["prompt_template"]

        # 取得共用設定
        style = self.shared_settings["style_keywords"]
        char_desc = self.shared_settings["character_descriptions"][character_id]

        # 替換變數
        replacements = {
            "{trigger}": char_desc["trigger"],
            "{colors}": char_desc["colors"],
            "{color_detail}": char_desc["color_detail"],
            "{features}": char_desc["features"],
            "{unique}": char_desc["unique"],
            "{style}": char_desc["style"],
            "{eye_color}": char_desc["eye_color"],
            "{base_style}": style["base"],
            "{lighting}": style["lighting"],
            "{quality}": style["quality"]
        }

        prompt = prompt_template
        for key, value in replacements.items():
            prompt = prompt.replace(key, value)

        # 強制使用純色背景，方便後續去背
        if use_solid_background:
            # 移除任何現有的背景描述
            background_phrases = [
                "clean studio background with soft gradient",
                "clean studio background",
                "clean background",
                "studio background",
                "soft gradient",
                "dramatic sky background",
                "sky background",
                "blue sky",
            ]
            for phrase in background_phrases:
                prompt = prompt.replace(phrase, "")

            # 強烈的純白色背景指示 (比綠幕更容易去背)
            prompt = prompt + ", SOLO CHARACTER ONLY, pure solid white background, plain white backdrop, completely white background, no environment, no scenery, no shadows, no floor, no ground, isolated on white, product shot style, white void background, character floating on pure white"

        return prompt

    def _build_background_prompt(self, template: Dict) -> str:
        """為背景組建 prompt"""
        return template["prompt_template"]

    def _get_negative_prompt(self, include_character: bool = True) -> str:
        """取得 negative prompt"""
        neg = self.shared_settings["negative_prompt_combined"]
        if include_character:
            neg += ", other characters, different character, mixed characters"
        return neg

    def _get_resolution(self, resolution_key: str) -> Dict[str, int]:
        """取得解析度"""
        return self.shared_settings["generation_parameters"]["resolutions"].get(
            resolution_key,
            {"width": 1024, "height": 1024}
        )

    def _build_comfyui_workflow(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        lora_path: Optional[str] = None,
        lora_weight: float = 0.9,
        steps: int = 40,
        cfg_scale: float = 8.0,
        seed: int = -1
    ) -> Dict:
        """
        建立 ComfyUI workflow

        這是一個基本的 SDXL + LoRA workflow 結構
        你可能需要根據你的 ComfyUI 設定調整節點 ID
        """
        if seed == -1:
            seed = int(time.time()) % 2147483647

        # 基本 SDXL workflow
        workflow = {
            # KSampler
            "3": {
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg_scale,
                    "sampler_name": "dpmpp_2m",
                    "scheduler": "karras",
                    "denoise": 1.0,
                    "model": ["4", 0] if lora_path else ["1", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                },
                "class_type": "KSampler"
            },
            # Checkpoint Loader
            "1": {
                "inputs": {
                    "ckpt_name": self.shared_settings["generation_parameters"]["base_model"]
                },
                "class_type": "CheckpointLoaderSimple"
            },
            # Empty Latent Image
            "5": {
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": 1
                },
                "class_type": "EmptyLatentImage"
            },
            # CLIP Text Encode (Positive)
            "6": {
                "inputs": {
                    "text": prompt,
                    "clip": ["1", 1]
                },
                "class_type": "CLIPTextEncode"
            },
            # CLIP Text Encode (Negative)
            "7": {
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["1", 1]
                },
                "class_type": "CLIPTextEncode"
            },
            # VAE Decode
            "8": {
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["1", 2]
                },
                "class_type": "VAEDecode"
            },
            # Save Image
            "9": {
                "inputs": {
                    "filename_prefix": "SuperWings",
                    "images": ["8", 0]
                },
                "class_type": "SaveImage"
            }
        }

        # 如果有 LoRA，加入 LoRA Loader
        if lora_path:
            workflow["4"] = {
                "inputs": {
                    "lora_name": Path(lora_path).name,
                    "strength_model": lora_weight,
                    "strength_clip": lora_weight,
                    "model": ["1", 0],
                    "clip": ["1", 1]
                },
                "class_type": "LoraLoader"
            }
            # 更新 CLIP 連接到 LoRA
            workflow["6"]["inputs"]["clip"] = ["4", 1]
            workflow["7"]["inputs"]["clip"] = ["4", 1]

        return workflow

    def generate_image(
        self,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        resolution: Dict[str, int],
        lora_path: Optional[str] = None,
        lora_weight: float = 0.9,
        steps: int = 40,
        cfg_scale: float = 8.0,
        seed: int = -1,
        remove_bg: bool = False,
        num_variations: int = 1
    ) -> int:
        """
        生成圖片（支援多變體）

        Args:
            num_variations: 生成變體數量，每個使用不同的 random seed
            remove_bg: 是否移除背景（角色圖需要）

        Returns:
            成功生成的數量
        """
        success_count = 0

        # 建立輸出目錄
        output_path.parent.mkdir(parents=True, exist_ok=True)
        base_name = output_path.stem
        suffix = output_path.suffix

        for var_idx in range(num_variations):
            try:
                # 為每個變體生成新的 seed
                var_seed = int(time.time() * 1000 + var_idx) % 2147483647

                # 變體輸出路徑: name_v1.png, name_v2.png, name_v3.png
                if num_variations > 1:
                    var_output_path = output_path.parent / f"{base_name}_v{var_idx + 1}{suffix}"
                else:
                    var_output_path = output_path

                # 建立 workflow
                workflow = self._build_comfyui_workflow(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    width=resolution["width"],
                    height=resolution["height"],
                    lora_path=lora_path,
                    lora_weight=lora_weight,
                    steps=steps,
                    cfg_scale=cfg_scale,
                    seed=var_seed
                )

                # 提交到 ComfyUI
                logger.info(f"Submitting to ComfyUI: {var_output_path.name} (seed={var_seed})")
                result = self.comfy.queue_prompt(workflow)
                prompt_id = result['prompt_id']

                # 等待完成
                history = self.comfy.wait_for_completion(prompt_id)

                # 獲取圖片
                if prompt_id in history:
                    outputs = history[prompt_id]['outputs']
                    for node_id, node_output in outputs.items():
                        if 'images' in node_output:
                            for image in node_output['images']:
                                image_data = self.comfy.get_image(
                                    image['filename'],
                                    image['subfolder'],
                                    image['type']
                                )

                                # 先儲存原始圖片
                                temp_path = var_output_path.parent / f"_temp_{var_output_path.name}"
                                with open(temp_path, 'wb') as f:
                                    f.write(image_data)

                                # 如果需要去背景
                                if remove_bg:
                                    logger.info(f"  Removing background...")
                                    if remove_background(temp_path, var_output_path):
                                        temp_path.unlink()  # 刪除臨時文件
                                        logger.info(f"✓ Saved (transparent): {var_output_path}")
                                    else:
                                        # 去背失敗，保留原始圖
                                        temp_path.rename(var_output_path)
                                        logger.warning(f"⚠ Saved (with bg): {var_output_path}")
                                else:
                                    temp_path.rename(var_output_path)
                                    logger.info(f"✓ Saved: {var_output_path}")

                                success_count += 1
                                break
                    continue

                logger.error(f"✗ No image output for: {var_output_path}")

            except Exception as e:
                logger.error(f"✗ Failed to generate variation {var_idx + 1}: {e}")
                self.stats["errors"].append({
                    "file": str(var_output_path if 'var_output_path' in locals() else output_path),
                    "error": str(e)
                })

        return success_count

    def generate_character_category(
        self,
        category: str,
        character_ids: List[str],
        dry_run: bool = False
    ):
        """生成角色相關素材（portraits/states/expressions）- 每個 prompt 生成 3 張變體"""
        template_data = self.templates[category]
        templates = template_data["templates"]
        output_structure = template_data["output_structure"]

        for char_id in character_ids:
            logger.info(f"\n{'='*50}")
            logger.info(f"Generating {category} for: {char_id.upper()} ({VARIATIONS_PER_PROMPT} variations each)")

            # Flip 特別警告
            if char_id == "flip":
                logger.warning("⚠️  FLIP: Must include BLUE CAP WITH YELLOW TRIM!")

            lora_path = self.shared_settings["lora_paths"][char_id]

            for template_id, template in templates.items():
                # 組建 prompt (使用純色背景)
                prompt = self._build_character_prompt(template, char_id, use_solid_background=True)

                # 非常強烈的 negative prompt - 確保背景完全空白
                negative_prompt = self._get_negative_prompt(include_character=True)
                negative_prompt += ", background, complex background, detailed background, scenery, environment, landscape, room, outdoor, indoor, sky, clouds, ground, floor, wall, grass, trees, buildings, city, nature, mountains, ocean, sea, water, sunset, sunrise, night sky, stars, any background elements, shadows on ground, cast shadows, environmental lighting, scene, location, place, setting, backdrop with details, gradient background, textured background, patterned background"

                # 取得參數
                resolution = self._get_resolution(template.get("resolution", "portrait"))
                steps = template.get("steps", 40)
                cfg_scale = template.get("cfg_scale", 8.0)
                lora_weight = template.get("lora_weight", 0.9)

                # 輸出路徑
                base_path = output_structure["base_path"].format(character=char_id)
                filename = output_structure["filename_pattern"].format(
                    template_id=template_id
                )
                output_path = self.output_dir / base_path / filename

                if dry_run:
                    logger.info(f"[DRY RUN] Would generate {VARIATIONS_PER_PROMPT}x: {output_path}")
                    logger.info(f"  Prompt: {prompt[:100]}...")
                    continue

                # 生成圖片 - 3 張變體，並去背景
                success_count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    lora_weight=lora_weight,
                    steps=steps,
                    cfg_scale=cfg_scale,
                    remove_bg=True,  # 角色圖需要去背
                    num_variations=VARIATIONS_PER_PROMPT
                )

                self.stats["total_generated"] += success_count
                self.stats["total_failed"] += (VARIATIONS_PER_PROMPT - success_count)

                if success_count > 0:
                    # 儲存 metadata (只存一次)
                    self._save_metadata(output_path, {
                        "character": char_id,
                        "category": category,
                        "template": template_id,
                        "prompt": prompt,
                        "lora_path": lora_path,
                        "resolution": resolution,
                        "variations": VARIATIONS_PER_PROMPT,
                        "transparent_background": True,
                        "generated_at": datetime.now().isoformat()
                    })

    def generate_backgrounds(self, dry_run: bool = False):
        """生成背景場景 - 每個 prompt 生成 3 張變體"""
        template_data = self.templates["backgrounds"]
        templates = template_data["templates"]
        output_structure = template_data["output_structure"]

        logger.info(f"\n{'='*50}")
        logger.info(f"Generating BACKGROUNDS ({VARIATIONS_PER_PROMPT} variations each)")

        for template_id, template in templates.items():
            prompt = self._build_background_prompt(template)
            negative_prompt = self._get_negative_prompt(include_character=False)
            negative_prompt += ", characters, planes, aircraft, robots, Super Wings, Jett, Flip"

            resolution = self._get_resolution(template.get("resolution", "background"))
            steps = template.get("steps", 40)
            cfg_scale = template.get("cfg_scale", 7.5)

            filename = output_structure["filename_pattern"].format(
                template_id=template_id
            )
            output_path = self.output_dir / output_structure["base_path"] / filename

            if dry_run:
                logger.info(f"[DRY RUN] Would generate {VARIATIONS_PER_PROMPT}x: {output_path}")
                continue

            # 生成 3 張變體，背景不需要去背
            success_count = self.generate_image(
                prompt=prompt,
                negative_prompt=negative_prompt,
                output_path=output_path,
                resolution=resolution,
                steps=steps,
                cfg_scale=cfg_scale,
                remove_bg=False,  # 背景不需要去背
                num_variations=VARIATIONS_PER_PROMPT
            )

            self.stats["total_generated"] += success_count
            self.stats["total_failed"] += (VARIATIONS_PER_PROMPT - success_count)

            if success_count > 0:
                self._save_metadata(output_path, {
                    "category": "backgrounds",
                    "template": template_id,
                    "prompt": prompt,
                    "resolution": resolution,
                    "variations": VARIATIONS_PER_PROMPT,
                    "generated_at": datetime.now().isoformat()
                })

    def generate_ui_elements(self, dry_run: bool = False):
        """生成 UI 元素 - 每個 prompt 生成 3 張變體"""
        template_data = self.templates["ui_elements"]
        categories = template_data["categories"]

        logger.info(f"\n{'='*50}")
        logger.info(f"Generating UI ELEMENTS ({VARIATIONS_PER_PROMPT} variations each)")

        for category_id, category_data in categories.items():
            output_path_base = category_data["output_path"]

            for template_id, template in category_data["templates"].items():
                prompt = template["prompt_template"]
                negative_prompt = "blurry, low quality, complex background, characters"

                # UI 元素解析度
                resolution_key = category_data.get("resolution", "ui_icon")
                resolution = self._get_resolution(resolution_key)

                output_path = self.output_dir.parent / output_path_base / f"{template_id}.png"

                if dry_run:
                    logger.info(f"[DRY RUN] Would generate {VARIATIONS_PER_PROMPT}x: {output_path}")
                    continue

                # 生成 3 張變體
                success_count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    output_path=output_path,
                    resolution=resolution,
                    steps=30,
                    cfg_scale=7.0,
                    remove_bg=False,
                    num_variations=VARIATIONS_PER_PROMPT
                )

                self.stats["total_generated"] += success_count
                self.stats["total_failed"] += (VARIATIONS_PER_PROMPT - success_count)

    def _save_metadata(self, output_path: Path, metadata: Dict):
        """儲存圖片 metadata"""
        metadata_path = output_path.with_suffix('.json')
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

    def run_test(self):
        """測試模式：顯示 Jett 和 Flip 的 prompt（不實際生成）"""
        logger.info("=" * 60)
        logger.info("TEST MODE - Showing prompts for Jett and Flip")
        logger.info("=" * 60)

        test_chars = ["jett", "flip"]

        for char_id in test_chars:
            logger.info(f"\n--- {char_id.upper()} ---")

            # 取得角色描述
            char_desc = self.shared_settings["character_descriptions"][char_id]
            logger.info(f"Colors: {char_desc['colors']}")
            logger.info(f"Unique: {char_desc['unique']}")

            if "critical_warning" in char_desc:
                logger.warning(f"⚠️  {char_desc['critical_warning']}")

            # 顯示 front_view prompt
            template = self.templates["portraits"]["templates"]["front_view"]
            prompt = self._build_character_prompt(template, char_id)
            logger.info(f"\nFront View Prompt:\n{prompt}\n")

        logger.info("=" * 60)
        logger.info("Test complete. Review prompts above.")
        logger.info("If correct, run with --all or specific --category")
        logger.info("=" * 60)

    def generate_all(self, character_ids: List[str], dry_run: bool = False):
        """生成所有素材"""
        logger.info("Starting FULL asset generation...")

        # 1. 角色肖像
        self.generate_character_category("portraits", character_ids, dry_run)

        # 2. 角色狀態
        self.generate_character_category("states", character_ids, dry_run)

        # 3. 角色表情
        self.generate_character_category("expressions", character_ids, dry_run)

        # 4. 背景
        self.generate_backgrounds(dry_run)

        # 5. UI 元素
        self.generate_ui_elements(dry_run)

        self._print_summary()

    def _print_summary(self):
        """列印生成摘要"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total Generated: {self.stats['total_generated']}")
        logger.info(f"Total Failed: {self.stats['total_failed']}")

        if self.stats['errors']:
            logger.info("\nErrors:")
            for err in self.stats['errors'][:10]:  # 只顯示前 10 個
                logger.info(f"  - {err['file']}: {err['error']}")

        # 儲存報告
        report_path = self.project_root / "generation_report.json"
        report = {
            "generated_at": datetime.now().isoformat(),
            "statistics": self.stats,
            "output_directory": str(self.output_dir)
        }
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        logger.info(f"\nReport saved to: {report_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Super Wings Game Assets Generator (ComfyUI)"
    )
    parser.add_argument(
        "--category",
        choices=["portraits", "states", "expressions", "backgrounds", "ui", "all"],
        help="Category to generate"
    )
    parser.add_argument(
        "--characters",
        type=str,
        default="all",
        help="Comma-separated character IDs or 'all'"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode - show prompts without generating"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - show what would be generated"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate all assets"
    )
    parser.add_argument(
        "--project-root",
        type=str,
        default="/home/justin/web-projects/super-wings-simulator",
        help="Project root directory"
    )
    parser.add_argument(
        "--comfyui-address",
        type=str,
        default="127.0.0.1:8188",
        help="ComfyUI server address"
    )

    args = parser.parse_args()

    project_root = Path(args.project_root)
    generator = SuperWingsAssetGenerator(project_root, args.comfyui_address)

    # 測試模式
    if args.test:
        generator.run_test()
        return

    # 解析角色列表
    if args.characters == "all":
        character_ids = list(generator.shared_settings["lora_paths"].keys())
    else:
        character_ids = [c.strip() for c in args.characters.split(",")]

    # 執行生成
    if args.all or args.category == "all":
        generator.generate_all(character_ids, dry_run=args.dry_run)
    elif args.category == "portraits":
        generator.generate_character_category("portraits", character_ids, args.dry_run)
        generator._print_summary()
    elif args.category == "states":
        generator.generate_character_category("states", character_ids, args.dry_run)
        generator._print_summary()
    elif args.category == "expressions":
        generator.generate_character_category("expressions", character_ids, args.dry_run)
        generator._print_summary()
    elif args.category == "backgrounds":
        generator.generate_backgrounds(args.dry_run)
        generator._print_summary()
    elif args.category == "ui":
        generator.generate_ui_elements(args.dry_run)
        generator._print_summary()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
