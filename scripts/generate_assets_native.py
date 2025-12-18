#!/usr/bin/env python3
"""
Super Wings Game Assets Generator - Native Diffusers Version with SDPA
Phase 2 - Batch image generation using native diffusers + SDPA acceleration

Usage:
    python scripts/generate_assets_native.py --test                    # Test with Jett
    python scripts/generate_assets_native.py --category portraits      # Generate all portraits
    python scripts/generate_assets_native.py --category states         # Generate all states
    python scripts/generate_assets_native.py --category expressions    # Generate all expressions
    python scripts/generate_assets_native.py --category transformation_shots  # Generate transformation shots
    python scripts/generate_assets_native.py --characters jett,flip    # Specific characters
    python scripts/generate_assets_native.py --all                     # Generate everything
    python scripts/generate_assets_native.py --skip-existing           # Skip already generated
    python scripts/generate_assets_native.py --no-rembg                # Skip bg removal (use batch_rembg.py later)

Examples:
    # Generate transformation shots for all characters (no bg removal, do it later)
    python scripts/generate_assets_native.py --category transformation_shots --no-rembg

    # Generate transformation shots for specific characters
    python scripts/generate_assets_native.py --category transformation_shots --characters jett,jerome --no-rembg

Features:
    - Native diffusers with SDPA (Scaled Dot Product Attention) acceleration
    - Strong prompt weighting to ensure correct character colors
    - Enhanced negative prompts to prevent background/color issues
    - 3 variations per prompt with different random seeds
    - Automatic background removal with rembg for transparent PNGs (optional)
"""

import json
import argparse
import time
import logging
import gc
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import random

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from PIL import Image

# rembg session (lazy load)
rembg_session = None

# 每個 prompt 生成的變體數量
VARIATIONS_PER_PROMPT = 3

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def remove_background(input_path: Path, output_path: Path, use_cpu: bool = True) -> bool:
    """使用 rembg 移除背景，創建透明 PNG"""
    global rembg_session
    try:
        from rembg import remove, new_session
        import os

        # 強制使用 CPU 避免 GPU 記憶體衝突
        if use_cpu:
            os.environ["CUDA_VISIBLE_DEVICES"] = ""

        # 初始化 rembg session (只做一次，使用較小的 u2netp 模型)
        if rembg_session is None:
            logger.info("Initializing rembg session (CPU mode, u2netp model)...")
            rembg_session = new_session("u2netp")  # 較小的模型

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


class NativeDiffusersGenerator:
    """原生 Diffusers 圖像生成器 (SDPA 加速)"""

    def __init__(self, project_root: Path, device: str = "cuda"):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.data_dir = project_root / "data"
        self.device = device

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
            "ui_elements": self._load_json("ui_elements.json"),
            "transformation_shots": self._load_json("transformation_shots.json"),
            "parallax": self._load_json("parallax_backgrounds.json")
        }

        # Pipeline (延遲載入)
        self.pipe = None
        self.current_lora = None

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

    def _init_pipeline(self):
        """初始化 diffusers pipeline with SDPA"""
        if self.pipe is not None:
            return

        logger.info("Loading SDXL pipeline with SDPA acceleration...")

        # 啟用 SDPA
        torch.backends.cuda.enable_flash_sdp(True)
        torch.backends.cuda.enable_mem_efficient_sdp(True)

        # 載入 SDXL
        model_path = "/mnt/c/ai_models/stable-diffusion/checkpoints/sd_xl_base_1.0.safetensors"

        self.pipe = StableDiffusionXLPipeline.from_single_file(
            model_path,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16"
        )

        # 使用 DPM++ 2M Karras scheduler
        self.pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipe.scheduler.config,
            algorithm_type="dpmsolver++",
            use_karras_sigmas=True
        )

        # 啟用優化
        self.pipe.to(self.device)
        self.pipe.enable_attention_slicing()  # 記憶體優化

        # SDPA 已自動啟用 (PyTorch 2.0+)
        logger.info("Pipeline loaded successfully with SDPA!")

    def _load_lora(self, lora_path: str, weight: float = 0.9):
        """載入 LoRA 模型"""
        if self.current_lora == lora_path:
            return  # 已載入相同 LoRA

        if self.current_lora is not None:
            # 卸載舊 LoRA
            self.pipe.unload_lora_weights()
            self.current_lora = None
            gc.collect()
            torch.cuda.empty_cache()

        if lora_path and Path(lora_path).exists():
            logger.info(f"Loading LoRA: {Path(lora_path).name}")
            self.pipe.load_lora_weights(
                lora_path,
                adapter_name="character"
            )
            self.pipe.set_adapters(["character"], adapter_weights=[weight])
            self.current_lora = lora_path
        else:
            logger.warning(f"LoRA not found: {lora_path}")

    def _get_character_color_emphasis(self, character_id: str) -> str:
        """取得角色顏色強調詞 (精簡版，控制在~20 tokens)"""
        # 精簡版 - 只保留最關鍵的識別特徵
        color_emphasis = {
            "jett": "jett, red jet plane, white accents, blue eyes",
            "jerome": "jerome, blue jet plane, yellow lightning, green eyes",
            "donnie": "donnie, yellow plane, blue propellers, amber eyes",
            "chase": "chase, dark blue spy jet, red stripes, blue eyes",
            "flip": "flip, red plane, blue cap yellow trim, blue eyes",
            "todd": "todd, brown digger, yellow drill, yellow hat, green eyes",
            "paul": "paul, blue white police plane, sheriff stars, blue eyes",
            "bello": "bello, black white zebra stripes, safari plane, blue eyes"
        }
        return color_emphasis.get(character_id, "")

    def _get_other_characters_negative(self, character_id: str) -> str:
        """取得排除其他角色的負面詞"""
        all_chars = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"]
        others = [c for c in all_chars if c != character_id]
        return ", ".join(others)

    def _build_character_prompt(self, template: Dict, character_id: str) -> str:
        """為角色組建完整的 prompt (強化版)"""
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

        # 強化顏色強調
        color_emphasis = self._get_character_color_emphasis(character_id)

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

        # 組合最終 prompt (精簡高品質版，控制在 ~70 tokens)
        # SDXL CLIP 限制 77 tokens，最重要的詞必須放前面

        # 精簡模板內容，只取動作/姿勢描述 (~10 tokens)
        prompt_core = prompt.split(",")[0].strip() if "," in prompt else prompt
        if len(prompt_core) > 50:
            prompt_core = prompt_core[:50]

        # 高效 prompt 結構 (約 65-70 tokens)：
        # [品質] + [角色特徵] + [動作] + [單一角色] + [乾淨背景] + [風格]
        final_prompt = (
            f"masterpiece, best quality, highly detailed, "  # 品質 (~8 tokens)
            f"{color_emphasis}, "                             # 角色 (~15 tokens)
            f"{prompt_core}, "                                # 動作 (~10 tokens)
            f"SOLO, single character, alone, "                # 單一 (~6 tokens)
            f"(solid white background:1.4), (plain background:1.3), (empty background:1.3), (no background elements:1.2), "  # 乾淨背景 (~15 tokens)
            f"3D CGI render, Super Wings style"               # 風格 (~8 tokens)
        )

        return final_prompt

    def _build_background_prompt(self, template: Dict) -> str:
        """為背景組建 prompt"""
        return f"(masterpiece:1.2), (best quality:1.2), {template['prompt_template']}, (no characters:1.3), (empty scene:1.2)"

    def _get_negative_prompt(self, include_character: bool = True, is_background: bool = False, character_id: str = None) -> str:
        """取得最大化品質版 negative prompt (含排除其他角色+避免扭曲+排除多餘物件)"""

        # 品質負面詞 + 避免扭曲變形
        base_negative = "worst quality, low quality, blurry, deformed, disfigured, distorted, twisted, warped, malformed, mutated, ugly, bad anatomy, wrong proportions, extra limbs, missing limbs, watermark, text, signature"

        if is_background:
            return f"{base_negative}, character, person, animal, robot, plane, jet"

        # 強化多角色排除 (使用重複強調)
        multi_char_negative = "multiple characters, 2 characters, two characters, 3 characters, three characters, many characters, group, crowd, duo, trio, pair, couple, friends, team"

        # 角色專用負面詞 (避免結構錯誤 + 排除多餘物件/人物)
        character_negative = "other planes, other jets, other robots, second plane, another plane, human, person, boy, girl, man, woman, child, animal, pet, toy in background, extra object, furniture, vehicle, car, wrong colors, color mixing, wrong structure"

        # 排除其他角色名稱 (重要！)
        other_chars_negative = ""
        if character_id:
            other_chars_negative = self._get_other_characters_negative(character_id)

        # 背景排除詞 (強化版)
        background_negative = "background, any background, complex background, detailed background, scenery, landscape, environment, sky, clouds, sun, ground, floor, grass, trees, plants, buildings, city, water, ocean, sea, shadows, gradient, pattern, texture, room, indoor, outdoor, horizon"

        return f"{base_negative}, {multi_char_negative}, {character_negative}, {other_chars_negative}, {background_negative}"

    def _get_resolution(self, resolution_key: str) -> Dict[str, int]:
        """取得解析度"""
        return self.shared_settings["generation_parameters"]["resolutions"].get(
            resolution_key,
            {"width": 1024, "height": 1024}
        )

    def generate_image(
        self,
        prompt: str,
        negative_prompt: str,
        output_path: Path,
        resolution: Dict[str, int],
        lora_path: Optional[str] = None,
        lora_weight: float = 0.9,
        steps: int = 30,  # 減少步數加速
        cfg_scale: float = 7.5,
        remove_bg: bool = True,
        num_variations: int = 3
    ) -> int:
        """生成圖片 (原生 diffusers)"""

        # 確保 pipeline 已初始化
        self._init_pipeline()

        # 載入 LoRA
        if lora_path:
            self._load_lora(lora_path, lora_weight)

        success_count = 0
        base_seed = random.randint(0, 2147483647)

        for var_idx in range(num_variations):
            seed = base_seed + var_idx * 12345

            # 生成變體檔名
            stem = output_path.stem
            suffix = output_path.suffix
            var_path = output_path.parent / f"{stem}_v{var_idx + 1}{suffix}"

            logger.info(f"Generating: {var_path.name} (seed={seed})")

            try:
                # 設定 generator
                generator = torch.Generator(device=self.device).manual_seed(seed)

                # 生成圖片
                with torch.inference_mode():
                    result = self.pipe(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        width=resolution["width"],
                        height=resolution["height"],
                        num_inference_steps=steps,
                        guidance_scale=cfg_scale,
                        generator=generator
                    )

                image = result.images[0]

                # 確保輸出目錄存在
                var_path.parent.mkdir(parents=True, exist_ok=True)

                if remove_bg:
                    # 先儲存臨時檔案
                    temp_path = var_path.parent / f"_temp_{var_path.name}"
                    image.save(temp_path)

                    # 移除背景
                    logger.info("  Removing background...")
                    if remove_background(temp_path, var_path):
                        temp_path.unlink()  # 刪除臨時檔案
                        logger.info(f"  Saved (transparent): {var_path}")
                        success_count += 1
                    else:
                        # 背景移除失敗，保留原圖
                        temp_path.rename(var_path)
                        logger.warning(f"  Background removal failed, kept original: {var_path}")
                        success_count += 1
                else:
                    image.save(var_path)
                    logger.info(f"  Saved: {var_path}")
                    success_count += 1

                self.stats["total_generated"] += 1

            except Exception as e:
                logger.error(f"  Generation failed: {e}")
                self.stats["total_failed"] += 1
                self.stats["errors"].append(str(e))

        return success_count

    def generate_portraits(
        self,
        characters: Optional[List[str]] = None,
        skip_existing: bool = False,
        remove_bg: bool = True
    ) -> Dict[str, int]:
        """批量生成角色肖像"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING PORTRAITS")
        logger.info("=" * 60)

        portrait_templates = self.templates["portraits"]["templates"]
        char_descs = self.shared_settings["character_descriptions"]

        if characters is None:
            characters = list(char_descs.keys())

        results = {}

        for char_id in characters:
            if char_id not in char_descs:
                logger.warning(f"Unknown character: {char_id}")
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"Generating portraits for: {char_id.upper()} ({VARIATIONS_PER_PROMPT} variations each)")

            char_output_dir = self.output_dir / "characters" / char_id / "portraits"
            char_output_dir.mkdir(parents=True, exist_ok=True)

            lora_path = self.shared_settings["lora_paths"].get(char_id)
            char_count = 0

            for template_id, template in portrait_templates.items():
                output_path = char_output_dir / f"{template_id}.png"

                # 檢查是否跳過已存在的
                if skip_existing:
                    existing = list(char_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id} (already exists)")
                        continue

                prompt = self._build_character_prompt(template, char_id)
                negative = self._get_negative_prompt(include_character=True, character_id=char_id)
                resolution = self._get_resolution(template.get("resolution", "portrait"))

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    lora_weight=0.9,
                    steps=30,
                    cfg_scale=7.5,
                    remove_bg=remove_bg,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                char_count += count

            results[char_id] = char_count
            logger.info(f"  {char_id}: {char_count} portraits generated")

        return results

    def generate_states(
        self,
        characters: Optional[List[str]] = None,
        skip_existing: bool = False,
        remove_bg: bool = True
    ) -> Dict[str, int]:
        """批量生成角色狀態圖"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING STATES")
        logger.info("=" * 60)

        state_templates = self.templates["states"]["templates"]
        char_descs = self.shared_settings["character_descriptions"]

        if characters is None:
            characters = list(char_descs.keys())

        results = {}

        for char_id in characters:
            if char_id not in char_descs:
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"Generating states for: {char_id.upper()}")

            char_output_dir = self.output_dir / "characters" / char_id / "states"
            char_output_dir.mkdir(parents=True, exist_ok=True)

            lora_path = self.shared_settings["lora_paths"].get(char_id)
            char_count = 0

            for template_id, template in state_templates.items():
                output_path = char_output_dir / f"{template_id}.png"

                if skip_existing:
                    existing = list(char_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id}")
                        continue

                prompt = self._build_character_prompt(template, char_id)
                negative = self._get_negative_prompt(include_character=True, character_id=char_id)
                resolution = self._get_resolution(template.get("resolution", "portrait"))

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    remove_bg=remove_bg,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                char_count += count

            results[char_id] = char_count

        return results

    def generate_expressions(
        self,
        characters: Optional[List[str]] = None,
        skip_existing: bool = False,
        remove_bg: bool = True
    ) -> Dict[str, int]:
        """批量生成表情圖"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING EXPRESSIONS")
        logger.info("=" * 60)

        expr_templates = self.templates["expressions"]["templates"]
        char_descs = self.shared_settings["character_descriptions"]

        if characters is None:
            characters = list(char_descs.keys())

        results = {}

        for char_id in characters:
            if char_id not in char_descs:
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"Generating expressions for: {char_id.upper()}")

            char_output_dir = self.output_dir / "characters" / char_id / "expressions"
            char_output_dir.mkdir(parents=True, exist_ok=True)

            lora_path = self.shared_settings["lora_paths"].get(char_id)
            char_count = 0

            for template_id, template in expr_templates.items():
                output_path = char_output_dir / f"{template_id}.png"

                if skip_existing:
                    existing = list(char_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id}")
                        continue

                prompt = self._build_character_prompt(template, char_id)
                negative = self._get_negative_prompt(include_character=True, character_id=char_id)
                resolution = self._get_resolution(template.get("resolution", "portrait"))

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    remove_bg=remove_bg,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                char_count += count

            results[char_id] = char_count

        return results

    def generate_transformation_shots(
        self,
        characters: Optional[List[str]] = None,
        skip_existing: bool = False,
        remove_bg: bool = False
    ) -> Dict[str, int]:
        """批量生成變身鏡頭序列圖片"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING TRANSFORMATION SHOTS")
        logger.info("=" * 60)

        tf_templates = self.templates["transformation_shots"]["templates"]
        tf_bg_settings = self.templates["transformation_shots"].get("background_settings", {})
        char_descs = self.shared_settings["character_descriptions"]

        if characters is None:
            characters = list(char_descs.keys())

        results = {}

        for char_id in characters:
            if char_id not in char_descs:
                logger.warning(f"Unknown character: {char_id}")
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"Generating transformation shots for: {char_id.upper()} ({VARIATIONS_PER_PROMPT} variations each)")

            char_output_dir = self.output_dir / "characters" / char_id / "transformation_shots"
            char_output_dir.mkdir(parents=True, exist_ok=True)

            lora_path = self.shared_settings["lora_paths"].get(char_id)
            char_count = 0

            for template_id, template in tf_templates.items():
                output_path = char_output_dir / f"{template_id}.png"

                # 檢查是否跳過已存在的
                if skip_existing:
                    existing = list(char_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id} (already exists)")
                        continue

                prompt = self._build_transformation_prompt(template, char_id, tf_bg_settings)
                negative = self._get_transformation_negative_prompt(char_id, tf_bg_settings, template)
                resolution = self._get_resolution(template.get("resolution", "portrait"))

                # 使用模板的參數
                steps = template.get("steps", 45)
                cfg_scale = template.get("cfg_scale", 8.5)
                lora_weight = template.get("lora_weight", 0.85)

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    lora_weight=lora_weight,
                    steps=steps,
                    cfg_scale=cfg_scale,
                    remove_bg=remove_bg,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                char_count += count

            results[char_id] = char_count
            logger.info(f"  {char_id}: {char_count} transformation shots generated")

        return results

    def _build_transformation_prompt(self, template: Dict, character_id: str, bg_settings: Dict) -> str:
        """為變身鏡頭組建 prompt - 精簡版，保持在 77 token 限制內"""
        prompt_template = template["prompt_template"]

        # 取得角色描述
        char_desc = self.shared_settings["character_descriptions"][character_id]

        # 只替換必要的變數，保持 prompt 簡短
        # trigger 例如: "jett_superwings"
        # colors 例如: "red body with white accents"
        prompt = prompt_template.replace("{trigger}", char_desc["trigger"])
        prompt = prompt.replace("{colors}", char_desc["colors"])

        # 如果有 eye_color 也替換
        if "{eye_color}" in prompt:
            prompt = prompt.replace("{eye_color}", char_desc.get("eye_color", "blue"))

        # 不添加額外內容，template 已包含 "white background, 3d render"
        # 這樣可以保持在 77 token 限制內
        logger.debug(f"Final prompt ({len(prompt.split())} words): {prompt[:100]}...")

        return prompt

    def _get_transformation_negative_prompt(self, character_id: str, bg_settings: Dict, template: Dict = None) -> str:
        """取得變身鏡頭的 negative prompt (支援每個模板的專屬負面詞)"""
        # 基礎品質負面詞
        base_negative = "worst quality, low quality, blurry, deformed, disfigured, distorted, twisted, warped, malformed, mutated, ugly, bad anatomy, wrong proportions, extra limbs, missing limbs, watermark, text, signature"

        # 多角色排除
        multi_char_negative = "multiple characters, 2 characters, two characters, 3 characters, many characters, group, crowd, duo, trio, pair"

        # 角色專用負面詞
        character_negative = "other planes, other jets, other robots, second plane, another plane, human, person, boy, girl, man, woman, child, animal, wrong colors"

        # 排除其他角色名稱
        other_chars_negative = self._get_other_characters_negative(character_id)

        # 背景排除詞 (從模板設定取得)
        background_negative = bg_settings.get(
            "clean_background_negative",
            "complex background, detailed background, scenery, landscape, environment, sky, clouds, ground, floor, grass, trees, plants, buildings, city, water, ocean, shadows, gradient background, pattern background, room, indoor scene, outdoor scene, horizon"
        )

        # 模板專屬負面詞 (用於部位特寫排除不需要的部位)
        template_negative = ""
        if template and "negative_extra" in template:
            template_negative = template["negative_extra"]

        # 組合所有負面詞
        all_negatives = [base_negative, multi_char_negative, character_negative, other_chars_negative, background_negative]
        if template_negative:
            all_negatives.append(template_negative)

        return ", ".join(all_negatives)

    def generate_backgrounds(self, skip_existing: bool = False) -> Dict[str, int]:
        """批量生成背景圖"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING BACKGROUNDS")
        logger.info("=" * 60)

        # 卸載 LoRA (背景不需要)
        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        bg_templates = self.templates["backgrounds"]["templates"]
        bg_output_dir = self.output_dir / "backgrounds"
        bg_output_dir.mkdir(parents=True, exist_ok=True)

        results = {"total": 0}

        for template_id, template in bg_templates.items():
            output_path = bg_output_dir / f"{template_id}.png"

            if skip_existing:
                existing = list(bg_output_dir.glob(f"{template_id}_v*.png"))
                if len(existing) >= VARIATIONS_PER_PROMPT:
                    logger.info(f"  Skipping {template_id}")
                    continue

            prompt = self._build_background_prompt(template)
            negative = self._get_negative_prompt(include_character=False, is_background=True)
            resolution = self._get_resolution(template.get("resolution", "background"))

            count = self.generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path,
                resolution=resolution,
                lora_path=None,
                remove_bg=False,  # 背景不需要去背
                num_variations=VARIATIONS_PER_PROMPT
            )
            results["total"] += count

        return results

    def generate_ui_elements(self, skip_existing: bool = False) -> Dict[str, int]:
        """批量生成 UI 元素圖標"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING UI ELEMENTS")
        logger.info("=" * 60)

        # 卸載 LoRA (UI 不需要)
        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        ui_config = self.templates["ui_elements"]
        results = {"total": 0}

        # 遍歷所有類別
        for category_id, category in ui_config.get("categories", {}).items():
            logger.info(f"\n{'=' * 40}")
            logger.info(f"Category: {category_id}")

            output_path_prefix = category.get("output_path", f"ui/{category_id}/")
            category_output_dir = self.output_dir / output_path_prefix
            category_output_dir.mkdir(parents=True, exist_ok=True)

            templates = category.get("templates", {})
            category_resolution = category.get("resolution", "ui_icon")

            for template_id, template in templates.items():
                output_path = category_output_dir / f"{template_id}.png"

                if skip_existing:
                    existing = list(category_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id}")
                        continue

                # 組建 UI 元素 prompt
                prompt = self._build_ui_prompt(template)
                negative = self._get_ui_negative_prompt()
                resolution = self._get_resolution(template.get("resolution", category_resolution))

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=None,
                    steps=25,  # UI 元素可以用較少步數
                    cfg_scale=7.0,
                    remove_bg=True,  # UI 圖標需要透明背景
                    num_variations=VARIATIONS_PER_PROMPT
                )
                results["total"] += count

        return results

    def _build_ui_prompt(self, template: Dict) -> str:
        """為 UI 元素組建 prompt"""
        base_prompt = template.get("prompt_template", "")
        return f"(masterpiece:1.2), (best quality:1.2), {base_prompt}, game icon, clean design, professional quality"

    def _get_ui_negative_prompt(self) -> str:
        """取得 UI 元素的 negative prompt"""
        return "worst quality, low quality, blurry, deformed, text, watermark, signature, complex background, detailed background, character, person, animal, photo, photograph, realistic"

    def generate_parallax_skies(self, skip_existing: bool = False) -> Dict[str, int]:
        """生成 2.5D 天空分層背景"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING PARALLAX SKY LAYERS")
        logger.info("=" * 60)

        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        parallax = self.templates["parallax"]
        sky_templates = parallax["sky_layers"]["templates"]
        output_dir = self.output_dir / parallax["sky_layers"]["output_path"]
        output_dir.mkdir(parents=True, exist_ok=True)

        results = {"total": 0}
        negative = "worst quality, low quality, blurry, ground, buildings, trees, objects, character, person, clouds"

        for template_id, template in sky_templates.items():
            output_path = output_dir / f"{template_id}.png"

            if skip_existing:
                existing = list(output_dir.glob(f"{template_id}_v*.png"))
                if len(existing) >= VARIATIONS_PER_PROMPT:
                    logger.info(f"  Skipping {template_id}")
                    continue

            prompt = f"(masterpiece:1.2), (best quality:1.2), {template['prompt']}"
            resolution = {"width": 1280, "height": 720}

            count = self.generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path,
                resolution=resolution,
                lora_path=None,
                steps=30,
                cfg_scale=7.0,
                remove_bg=False,
                num_variations=VARIATIONS_PER_PROMPT
            )
            results["total"] += count

        return results

    def generate_parallax_clouds(self, skip_existing: bool = False) -> Dict[str, int]:
        """生成雲層物件（透明背景）"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING PARALLAX CLOUD LAYERS")
        logger.info("=" * 60)

        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        parallax = self.templates["parallax"]
        cloud_templates = parallax["cloud_layers"]["templates"]
        output_dir = self.output_dir / parallax["cloud_layers"]["output_path"]
        output_dir.mkdir(parents=True, exist_ok=True)

        results = {"total": 0}
        negative = "worst quality, low quality, blurry, ground, buildings, trees, character, person, sky gradient"

        for template_id, template in cloud_templates.items():
            output_path = output_dir / f"{template_id}.png"

            if skip_existing:
                existing = list(output_dir.glob(f"{template_id}_v*.png"))
                if len(existing) >= VARIATIONS_PER_PROMPT:
                    logger.info(f"  Skipping {template_id}")
                    continue

            prompt = f"(masterpiece:1.2), (best quality:1.2), {template['prompt']}"
            resolution = {"width": 1280, "height": 720}

            count = self.generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path,
                resolution=resolution,
                lora_path=None,
                steps=30,
                cfg_scale=7.0,
                remove_bg=True,  # 雲層需要透明背景
                num_variations=VARIATIONS_PER_PROMPT
            )
            results["total"] += count

        return results

    def generate_parallax_objects(self, skip_existing: bool = False) -> Dict[str, int]:
        """生成背景物件（透明背景）"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING PARALLAX BACKGROUND OBJECTS")
        logger.info("=" * 60)

        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        parallax = self.templates["parallax"]
        objects_config = parallax["background_objects"]
        base_output_dir = self.output_dir / objects_config["output_path"]

        results = {"total": 0}
        negative = "worst quality, low quality, blurry, ground shadow, floor, background, multiple objects, character, person"

        # 遍歷所有類別
        for category_name, category_content in objects_config["categories"].items():
            logger.info(f"\nCategory: {category_name}")

            # 處理巢狀結構
            if isinstance(category_content, dict):
                for subcategory, items in category_content.items():
                    output_dir = base_output_dir / category_name / subcategory
                    output_dir.mkdir(parents=True, exist_ok=True)

                    for item in items:
                        output_path = output_dir / f"{item['id']}.png"

                        if skip_existing:
                            existing = list(output_dir.glob(f"{item['id']}_v*.png"))
                            if len(existing) >= VARIATIONS_PER_PROMPT:
                                logger.info(f"  Skipping {item['id']}")
                                continue

                        prompt = f"(masterpiece:1.2), (best quality:1.2), {item['prompt']}"
                        resolution = {"width": 1024, "height": 1024}

                        count = self.generate_image(
                            prompt=prompt,
                            negative_prompt=negative,
                            output_path=output_path,
                            resolution=resolution,
                            lora_path=None,
                            steps=30,
                            cfg_scale=7.0,
                            remove_bg=True,
                            num_variations=VARIATIONS_PER_PROMPT
                        )
                        results["total"] += count
            elif isinstance(category_content, list):
                # 直接列表（如 street_furniture）
                output_dir = base_output_dir / category_name
                output_dir.mkdir(parents=True, exist_ok=True)

                for item in category_content:
                    output_path = output_dir / f"{item['id']}.png"

                    if skip_existing:
                        existing = list(output_dir.glob(f"{item['id']}_v*.png"))
                        if len(existing) >= VARIATIONS_PER_PROMPT:
                            logger.info(f"  Skipping {item['id']}")
                            continue

                    prompt = f"(masterpiece:1.2), (best quality:1.2), {item['prompt']}"
                    resolution = {"width": 1024, "height": 1024}

                    count = self.generate_image(
                        prompt=prompt,
                        negative_prompt=negative,
                        output_path=output_path,
                        resolution=resolution,
                        lora_path=None,
                        steps=30,
                        cfg_scale=7.0,
                        remove_bg=True,
                        num_variations=VARIATIONS_PER_PROMPT
                    )
                    results["total"] += count

        return results

    def generate_base_scenes(self, skip_existing: bool = False) -> Dict[str, int]:
        """生成基地場景分層背景（3場景×3層×3變體=27張）"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING BASE SCENE LAYERS")
        logger.info("=" * 60)

        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        parallax = self.templates["parallax"]
        base_templates = parallax["base_scenes"]["templates"]
        output_dir = self.output_dir / parallax["base_scenes"]["output_path"]
        output_dir.mkdir(parents=True, exist_ok=True)

        results = {"total": 0}
        negative = "worst quality, low quality, blurry, character, person, animal"

        for template_id, template in base_templates.items():
            output_path = output_dir / f"{template_id}.png"

            if skip_existing:
                existing = list(output_dir.glob(f"{template_id}_v*.png"))
                if len(existing) >= VARIATIONS_PER_PROMPT:
                    logger.info(f"  Skipping {template_id}")
                    continue

            prompt = f"(masterpiece:1.2), (best quality:1.2), {template['prompt']}"
            resolution = {"width": 1280, "height": 720}
            needs_transparency = "transparent" in template['prompt'].lower()

            count = self.generate_image(
                prompt=prompt,
                negative_prompt=negative,
                output_path=output_path,
                resolution=resolution,
                lora_path=None,
                steps=30,
                cfg_scale=7.0,
                remove_bg=needs_transparency,
                num_variations=VARIATIONS_PER_PROMPT
            )
            results["total"] += count

        return results

    def generate_destinations(self, skip_existing: bool = False) -> Dict[str, int]:
        """生成目的地分層背景（20地點×4層×3變體=240張）"""
        logger.info("\n" + "=" * 60)
        logger.info("GENERATING DESTINATION LAYERS")
        logger.info("=" * 60)

        if self.current_lora:
            self.pipe.unload_lora_weights()
            self.current_lora = None

        parallax = self.templates["parallax"]
        destinations = parallax["destinations"]["locations"]
        base_output_dir = self.output_dir / parallax["destinations"]["output_path"]

        results = {"total": 0}
        negative = "worst quality, low quality, blurry, character, person, animal"

        for location_id, location_data in destinations.items():
            logger.info(f"\nLocation: {location_data['name']}")
            location_dir = base_output_dir / location_id
            location_dir.mkdir(parents=True, exist_ok=True)

            for template_id, template in location_data["templates"].items():
                output_path = location_dir / f"{template_id}.png"

                if skip_existing:
                    existing = list(location_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping {template_id}")
                        continue

                prompt = f"(masterpiece:1.2), (best quality:1.2), {template['prompt']}"
                resolution = {"width": 1280, "height": 720}
                needs_transparency = "transparent" in template['prompt'].lower()

                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=None,
                    steps=30,
                    cfg_scale=7.0,
                    remove_bg=needs_transparency,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                results["total"] += count

        return results

    def generate_all(self, characters: Optional[List[str]] = None, skip_existing: bool = False, remove_bg: bool = True):
        """生成所有素材"""
        start_time = datetime.now()
        logger.info(f"Starting full generation at {start_time}")
        logger.info(f"Background removal: {'ENABLED' if remove_bg else 'DISABLED'}")

        # 1. Portraits (已完成，跳過)
        # self.generate_portraits(characters, skip_existing=True, remove_bg=remove_bg)

        # 2. States
        self.generate_states(characters, skip_existing, remove_bg=remove_bg)

        # 3. Expressions
        self.generate_expressions(characters, skip_existing, remove_bg=remove_bg)

        # 4. Backgrounds
        self.generate_backgrounds(skip_existing)

        # 5. UI Elements
        self.generate_ui_elements(skip_existing)

        # 統計
        end_time = datetime.now()
        duration = end_time - start_time

        logger.info("\n" + "=" * 60)
        logger.info("GENERATION COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Total generated: {self.stats['total_generated']}")
        logger.info(f"Total failed: {self.stats['total_failed']}")
        logger.info(f"Duration: {duration}")

        if self.stats["errors"]:
            logger.info(f"Errors ({len(self.stats['errors'])}):")
            for err in self.stats["errors"][:10]:
                logger.info(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(description="Super Wings Asset Generator (Native Diffusers)")
    parser.add_argument("--test", action="store_true", help="Test with Jett only")
    parser.add_argument("--category", choices=["portraits", "states", "expressions", "backgrounds", "transformation_shots", "ui_elements", "parallax_skies", "parallax_clouds", "parallax_objects", "base_scenes", "destinations", "parallax_all"],
                        help="Generate specific category")
    parser.add_argument("--characters", type=str, help="Comma-separated character IDs")
    parser.add_argument("--all", action="store_true", help="Generate all assets")
    parser.add_argument("--skip-existing", action="store_true", help="Skip already generated images")
    parser.add_argument("--no-rembg", action="store_true", help="Skip background removal (faster, use batch_rembg.py later)")

    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    generator = NativeDiffusersGenerator(project_root)

    # 設定是否跳過背景移除
    skip_rembg = args.no_rembg
    if skip_rembg:
        logger.info("Background removal DISABLED (use batch_rembg.py later)")

    characters = None
    if args.characters:
        characters = [c.strip() for c in args.characters.split(",")]

    if args.test:
        logger.info("Running test with Jett...")
        generator.generate_portraits(["jett"], remove_bg=not skip_rembg)

    elif args.category:
        if args.category == "portraits":
            generator.generate_portraits(characters, args.skip_existing, remove_bg=not skip_rembg)
        elif args.category == "states":
            generator.generate_states(characters, args.skip_existing, remove_bg=not skip_rembg)
        elif args.category == "expressions":
            generator.generate_expressions(characters, args.skip_existing, remove_bg=not skip_rembg)
        elif args.category == "backgrounds":
            generator.generate_backgrounds(args.skip_existing)
        elif args.category == "transformation_shots":
            generator.generate_transformation_shots(characters, args.skip_existing, remove_bg=not skip_rembg)
        elif args.category == "ui_elements":
            generator.generate_ui_elements(args.skip_existing)
        elif args.category == "parallax_skies":
            generator.generate_parallax_skies(args.skip_existing)
        elif args.category == "parallax_clouds":
            generator.generate_parallax_clouds(args.skip_existing)
        elif args.category == "parallax_objects":
            generator.generate_parallax_objects(args.skip_existing)
        elif args.category == "base_scenes":
            generator.generate_base_scenes(args.skip_existing)
        elif args.category == "destinations":
            generator.generate_destinations(args.skip_existing)
        elif args.category == "parallax_all":
            generator.generate_parallax_skies(args.skip_existing)
            generator.generate_parallax_clouds(args.skip_existing)
            generator.generate_base_scenes(args.skip_existing)
            generator.generate_destinations(args.skip_existing)
            generator.generate_parallax_objects(args.skip_existing)

    elif args.all:
        generator.generate_all(characters, args.skip_existing, remove_bg=not skip_rembg)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
