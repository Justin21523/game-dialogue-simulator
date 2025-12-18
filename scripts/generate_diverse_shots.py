#!/usr/bin/env python3
"""
Super Wings - Generate 20 Diverse Shots per Character
為每個角色生成20個不同prompt的多樣化圖片

Usage:
    python scripts/generate_diverse_shots.py --all                    # All characters
    python scripts/generate_diverse_shots.py --characters jett,flip   # Specific characters
    python scripts/generate_diverse_shots.py --test jett              # Test with one character
    python scripts/generate_diverse_shots.py --skip-existing          # Skip existing images
    python scripts/generate_diverse_shots.py --no-rembg               # Skip background removal

Features:
    - 20 diverse prompts per character (angles, actions, expressions)
    - Each prompt generates 3 variations (60 total images per character)
    - Uses character-specific LoRA models
    - Complete negative prompts to avoid artifacts
    - Automatic background removal for transparent PNGs
"""

import json
import argparse
import time
import logging
import gc
import random
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from PIL import Image

# rembg session (lazy load)
rembg_session = None

# 每個 prompt 生成的變體數量
VARIATIONS_PER_PROMPT = 2

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

        # 初始化 rembg session (只做一次)
        if rembg_session is None:
            logger.info("Initializing rembg session (CPU mode, u2netp model)...")
            rembg_session = new_session("u2netp")

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


class DiverseShotsGenerator:
    """多樣化角色圖片生成器"""

    def __init__(self, project_root: Path, device: str = "cuda"):
        self.project_root = project_root
        self.prompts_dir = project_root / "prompts" / "game_assets"
        self.output_dir = project_root / "assets" / "images"
        self.device = device

        # 載入設定
        self.shared_settings = self._load_json("shared_settings.json")
        self.diverse_shots = self._load_json("character_diverse_shots.json")

        # Pipeline (延遲載入)
        self.pipe = None
        self.current_lora = None

        # 統計
        self.stats = {
            "total_generated": 0,
            "total_failed": 0,
            "errors": []
        }

    def _load_json(self, filename: str) -> Dict:
        """載入 JSON 檔案"""
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
        self.pipe.enable_attention_slicing()

        logger.info("Pipeline loaded successfully with SDPA!")

    def _load_lora(self, lora_path: str, weight: float = 0.9):
        """載入 LoRA 模型"""
        if self.current_lora == lora_path:
            return

        if self.current_lora is not None:
            self.pipe.unload_lora_weights()
            self.current_lora = None
            gc.collect()
            torch.cuda.empty_cache()

        if lora_path and Path(lora_path).exists():
            logger.info(f"Loading LoRA: {Path(lora_path).name}")
            self.pipe.load_lora_weights(lora_path, adapter_name="character")
            self.pipe.set_adapters(["character"], adapter_weights=[weight])
            self.current_lora = lora_path
        else:
            logger.warning(f"LoRA not found: {lora_path}")

    def _get_character_color_emphasis(self, character_id: str) -> str:
        """取得角色顏色強調詞"""
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
        """為角色組建簡潔的 prompt (控制在 70 tokens 內)"""
        prompt_template = template["prompt_template"]

        # 取得角色描述
        char_desc = self.shared_settings["character_descriptions"][character_id]

        # 替換變數 (只替換模板中實際使用的)
        replacements = {
            "{trigger}": char_desc["trigger"],
            "{colors}": char_desc["colors"],
            "{color_detail}": char_desc["color_detail"],
            "{features}": char_desc["features"],
            "{unique}": char_desc["unique"],
            "{eye_color}": char_desc["eye_color"]
        }

        prompt = prompt_template
        for key, value in replacements.items():
            if key in prompt:
                prompt = prompt.replace(key, value)

        # 添加風格和品質詞 (精簡版)
        prompt = f"masterpiece, best quality, {prompt}, 3d cgi toy render, super wings style, white background, solo"

        return prompt

    def _get_complete_negative_prompt(self, character_id: str) -> str:
        """
        取得完整的 negative prompt - 包含所有必要的排除項
        避免生成奇怪的結果
        """
        # 基礎品質負面詞 - 避免低品質和扭曲
        base_negative = (
            "worst quality, low quality, poor quality, bad quality, "
            "blurry, out of focus, soft focus, hazy, "
            "deformed, disfigured, distorted, twisted, warped, malformed, mutated, "
            "ugly, gross, disgusting, unappealing, "
            "bad anatomy, wrong anatomy, extra limbs, missing limbs, "
            "fused limbs, extra fingers, missing fingers, "
            "extra eyes, missing eyes, three eyes, four eyes, multiple eyes, "
            "bad proportions, wrong proportions, asymmetrical, unbalanced, "
            "cropped, cut off, truncated, clipped, "
            "watermark, text, signature, username, logo, copyright, "
            "jpeg artifacts, compression artifacts, noise, grainy, pixelated"
        )

        # 多角色排除 - 確保只有單一角色
        multi_char_negative = (
            "multiple characters, two characters, 2 characters, "
            "three characters, 3 characters, many characters, "
            "group, crowd, duo, trio, pair, couple, "
            "other characters, second character, another character, "
            "friends, team, group shot, multiple subjects"
        )

        # 排除人類和其他不相關物件
        human_negative = (
            "human, person, people, boy, girl, man, woman, child, "
            "humanoid, human face, human body, human figure, "
            "realistic human, photorealistic person, "
            "animal, creature, monster, alien"
        )

        # 排除其他超級飛俠角色
        other_chars = self._get_other_characters_negative(character_id)

        # 角色結構錯誤排除
        structure_negative = (
            "other planes, other jets, other robots, "
            "second plane, another plane, different plane, "
            "wrong colors, incorrect colors, color mixing, color swap, "
            "mismatched colors, off-color, discolored, "
            "wrong structure, bad design, poorly designed, "
            "extra objects, extra vehicles, multiple vehicles"
        )

        # 背景排除 - 確保純白背景
        background_negative = (
            "background, any background, complex background, detailed background, "
            "scenery, landscape, environment, setting, scene, "
            "sky, clouds, sun, moon, stars, weather, "
            "ground, floor, grass, dirt, sand, snow, "
            "trees, plants, flowers, vegetation, "
            "buildings, architecture, structures, city, urban, "
            "water, ocean, sea, lake, river, "
            "mountains, hills, cliffs, rocks, "
            "shadows on ground, cast shadows, ground shadows, "
            "gradient background, textured background, patterned background, "
            "room, indoor, outdoor, interior, exterior, "
            "horizon, skyline, vista"
        )

        # 風格排除
        style_negative = (
            "2d, anime, cartoon drawing, illustration, sketch, painting, "
            "photographic, photo, photograph, real life, realistic photo, "
            "pencil drawing, ink drawing, hand-drawn, "
            "flat colors, cel shading, comic style"
        )

        # 其他常見問題排除
        misc_negative = (
            "mirror image, reflection, duplicate, copied, "
            "motion blur, speed lines, motion lines, "
            "transparent, translucent, see-through, "
            "glowing, glow effect, neon, "
            "dark, darkness, night, shadows, silhouette, "
            "incomplete, unfinished, work in progress, draft, "
            "collage, montage, multiple views, character sheet, reference sheet"
        )

        # 組合所有 negative prompt
        complete_negative = ", ".join([
            base_negative,
            multi_char_negative,
            human_negative,
            other_chars,
            structure_negative,
            background_negative,
            style_negative,
            misc_negative
        ])

        return complete_negative

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
        steps: int = 35,
        cfg_scale: float = 7.8,
        remove_bg: bool = True,
        num_variations: int = 3
    ) -> int:
        """生成圖片 (支援多變體)"""

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

            # 如果檔案已存在，跳過
            if var_path.exists():
                logger.info(f"  Skipping existing: {var_path.name}")
                success_count += 1
                continue

            logger.info(f"  Generating: {var_path.name} (seed={seed})")

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
                    if remove_background(temp_path, var_path):
                        temp_path.unlink()
                        logger.info(f"    ✓ Saved (transparent)")
                        success_count += 1
                    else:
                        temp_path.rename(var_path)
                        logger.warning(f"    ⚠ Background removal failed")
                        success_count += 1
                else:
                    image.save(var_path)
                    logger.info(f"    ✓ Saved")
                    success_count += 1

                self.stats["total_generated"] += 1

            except Exception as e:
                logger.error(f"    ✗ Generation failed: {e}")
                self.stats["total_failed"] += 1
                self.stats["errors"].append(str(e))

        return success_count

    def generate_diverse_shots(
        self,
        characters: List[str],
        skip_existing: bool = False,
        remove_bg: bool = True
    ) -> Dict[str, int]:
        """為指定角色生成 20 個多樣化 prompt 的圖片"""

        logger.info("\n" + "=" * 60)
        logger.info("GENERATING DIVERSE SHOTS (20 prompts × 3 variations = 60 images per character)")
        logger.info("=" * 60)

        templates = self.diverse_shots["templates"]
        output_structure = self.diverse_shots["output_structure"]
        char_descs = self.shared_settings["character_descriptions"]

        results = {}

        for char_id in characters:
            if char_id not in char_descs:
                logger.warning(f"Unknown character: {char_id}")
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"Character: {char_id.upper()} ({char_descs[char_id]['name']})")
            logger.info(f"Total prompts: {len(templates)} × {VARIATIONS_PER_PROMPT} variations")

            char_output_dir = self.output_dir / output_structure["base_path"].format(character=char_id)
            char_output_dir.mkdir(parents=True, exist_ok=True)

            lora_path = self.shared_settings["lora_paths"].get(char_id)
            char_count = 0

            for idx, (template_id, template) in enumerate(templates.items(), 1):
                logger.info(f"\n[{idx}/{len(templates)}] {template_id}")
                logger.info(f"  Description: {template['description']}")

                output_path = char_output_dir / f"{template_id}.png"

                # 檢查是否跳過已存在的
                if skip_existing:
                    existing = list(char_output_dir.glob(f"{template_id}_v*.png"))
                    if len(existing) >= VARIATIONS_PER_PROMPT:
                        logger.info(f"  Skipping (already exists)")
                        char_count += len(existing)
                        continue

                # 組建 prompt (使用 shared_settings 中的完整角色描述)
                prompt = self._build_character_prompt(template, char_id)

                # 使用完整的 negative prompt
                negative = self._get_complete_negative_prompt(char_id)

                # 取得參數
                resolution = self._get_resolution(template.get("resolution", "portrait"))
                steps = template.get("steps", 35)
                cfg_scale = template.get("cfg_scale", 7.8)

                # 生成圖片
                count = self.generate_image(
                    prompt=prompt,
                    negative_prompt=negative,
                    output_path=output_path,
                    resolution=resolution,
                    lora_path=lora_path,
                    lora_weight=0.9,
                    steps=steps,
                    cfg_scale=cfg_scale,
                    remove_bg=remove_bg,
                    num_variations=VARIATIONS_PER_PROMPT
                )
                char_count += count

            results[char_id] = char_count
            logger.info(f"\n{char_id.upper()} complete: {char_count} images generated")

        return results

    def print_summary(self, results: Dict[str, int], start_time: datetime):
        """列印生成摘要"""
        end_time = datetime.now()
        duration = end_time - start_time

        logger.info("\n" + "=" * 60)
        logger.info("GENERATION COMPLETE")
        logger.info("=" * 60)

        for char_id, count in results.items():
            logger.info(f"  {char_id.upper()}: {count} images")

        logger.info(f"\nTotal generated: {self.stats['total_generated']}")
        logger.info(f"Total failed: {self.stats['total_failed']}")
        logger.info(f"Duration: {duration}")

        if self.stats["errors"]:
            logger.info(f"\nErrors ({len(self.stats['errors'])}):")
            for err in self.stats["errors"][:5]:
                logger.info(f"  - {err}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate 20 Diverse Shots per Character"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate for all characters"
    )
    parser.add_argument(
        "--characters",
        type=str,
        help="Comma-separated character IDs (e.g., jett,flip,jerome)"
    )
    parser.add_argument(
        "--test",
        type=str,
        help="Test with single character (e.g., --test jett)"
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip already generated images"
    )
    parser.add_argument(
        "--no-rembg",
        action="store_true",
        help="Skip background removal (faster, use batch_rembg.py later)"
    )

    args = parser.parse_args()

    # 初始化生成器
    project_root = Path(__file__).parent.parent
    generator = DiverseShotsGenerator(project_root)

    # 設定是否跳過背景移除
    remove_bg = not args.no_rembg
    if args.no_rembg:
        logger.info("⚠ Background removal DISABLED (use batch_rembg.py later)")

    # 決定要生成哪些角色
    all_characters = ["jett", "jerome", "donnie", "chase", "flip", "todd", "paul", "bello"]

    if args.test:
        characters = [args.test]
        logger.info(f"TEST MODE: Generating for {args.test} only")
    elif args.all:
        characters = all_characters
    elif args.characters:
        characters = [c.strip() for c in args.characters.split(",")]
    else:
        parser.print_help()
        return

    # 開始生成
    start_time = datetime.now()
    logger.info(f"Starting generation at {start_time}")
    logger.info(f"Characters: {', '.join(characters)}")
    logger.info(f"Total prompts: 20 × {VARIATIONS_PER_PROMPT} variations = {20 * VARIATIONS_PER_PROMPT} images per character")

    results = generator.generate_diverse_shots(
        characters=characters,
        skip_existing=args.skip_existing,
        remove_bg=remove_bg
    )

    # 列印摘要
    generator.print_summary(results, start_time)


if __name__ == "__main__":
    main()
