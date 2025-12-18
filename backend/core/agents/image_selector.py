"""
AI-Powered Image Selector Agent for Super Wings Simulator.
Automatically selects the best character image based on context.
"""

import json
import logging
import os
import random
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ImageCategory(str, Enum):
    """Image category types."""
    EXPRESSION = "expression"      # happy, sad, angry, etc.
    ACTION = "action"              # flying, running, building, etc.
    POSE = "pose"                  # front_view, side_profile, etc.
    STATE = "state"                # idle, in_flight, landing, etc.
    TRANSFORMATION = "transformation"  # transform stages
    CLOSEUP = "closeup"            # closeup shots
    SPECIAL = "special"            # heroic_pose, victory, etc.


class EmotionType(str, Enum):
    """Character emotions."""
    HAPPY = "happy"
    EXCITED = "excited"
    SAD = "sad"
    ANGRY = "angry"
    SCARED = "scared"
    SURPRISED = "surprised"
    CONFIDENT = "confident"
    WORRIED = "worried"
    DETERMINED = "determined"
    TIRED = "tired"
    NEUTRAL = "neutral"


class ActionType(str, Enum):
    """Character actions."""
    FLYING = "flying"
    LANDING = "landing"
    TAKEOFF = "takeoff"
    HOVERING = "hovering"
    RUNNING = "running"
    BUILDING = "building"
    RESCUING = "rescuing"
    DELIVERING = "delivering"
    CELEBRATING = "celebrating"
    COMMUNICATING = "communicating"
    PATROLLING = "patrolling"
    CARING_ANIMALS = "caring_animals"
    IDLE = "idle"
    WORKING = "working"


@dataclass
class ImageMatch:
    """Result of image matching."""
    character_id: str
    image_path: str
    filename: str
    category: str
    confidence: float
    alternatives: List[str]


# Image keyword mappings for intelligent selection
IMAGE_MAPPINGS = {
    # Emotions
    "happy": ["happy", "celebrating", "laughing", "excited"],
    "sad": ["sad", "crying", "worried"],
    "angry": ["angry", "determined", "disgusted"],
    "scared": ["scared", "nervous", "worried"],
    "surprised": ["surprised", "alert"],
    "confident": ["confident", "proud", "heroic"],
    "tired": ["tired", "sleepy", "damaged"],
    "excited": ["excited", "happy", "celebrating"],
    "worried": ["worried", "nervous", "sad"],
    "determined": ["determined", "focused", "confident"],

    # Actions
    "flying": ["flying", "in_flight", "hovering", "diving"],
    "landing": ["landing"],
    "takeoff": ["takeoff"],
    "running": ["running"],
    "building": ["building", "working"],
    "rescuing": ["rescuing"],
    "delivering": ["delivering"],
    "celebrating": ["celebrating", "victory", "happy"],
    "communicating": ["communicating", "pointing", "waving"],
    "patrolling": ["patrolling"],
    "caring_animals": ["caring_animals"],
    "idle": ["idle", "standing", "ready"],
    "working": ["working", "building"],

    # Poses
    "front": ["front_view", "portrait"],
    "side": ["side_profile"],
    "back": ["back_view"],
    "closeup": ["closeup", "portrait_closeup", "extreme_closeup"],
    "full_body": ["full", "standing_pose", "front_view"],
    "action": ["action_pose", "heroic_pose", "ready_stance"],

    # States
    "greeting": ["waving", "friendly", "happy"],
    "mission_start": ["determined", "ready_stance", "confident"],
    "mission_end": ["celebrating", "victory", "happy"],
    "transformation": ["transformation", "heroic_pose_glow", "transform_stage"],
    "problem_solving": ["thinking", "focused", "working"],
    "success": ["celebrating", "victory", "proud", "thumbs_up"],
    "failure": ["sad", "worried", "tired"],

    # Mission types
    "delivery": ["delivering", "flying", "in_flight"],
    "construction": ["building", "working", "focused"],
    "rescue": ["rescuing", "determined", "heroic"],
    "sports": ["action_pose", "excited", "running"],
    "police": ["patrolling", "alert", "confident"],
    "animal_care": ["caring_animals", "friendly", "communicating"],
}


class ImageSelectorAgent:
    """
    AI-powered agent for selecting the best character image based on context.
    Uses keyword matching and optional LLM enhancement.
    """

    def __init__(
        self,
        assets_base_path: str = None,
        llm=None
    ):
        # Default to project root assets folder
        if assets_base_path is None:
            # Get project root (3 levels up from this file)
            project_root = Path(__file__).parent.parent.parent.parent
            assets_base_path = project_root / "assets" / "images" / "characters"

        self.assets_base_path = Path(assets_base_path)
        self.llm = llm
        self._image_catalog: Dict[str, Dict[str, List[str]]] = {}
        self._build_catalog()

    def _build_catalog(self) -> None:
        """Build image catalog from filesystem."""
        if not self.assets_base_path.exists():
            logger.warning(f"Assets path not found: {self.assets_base_path}")
            return

        for char_dir in self.assets_base_path.iterdir():
            if not char_dir.is_dir():
                continue

            char_id = char_dir.name
            self._image_catalog[char_id] = {
                "all": [],
                "transform_frames": [],
                "transform_sequence": [],
            }

            # Scan 'all' folder
            all_folder = char_dir / "all"
            if all_folder.exists():
                for img_file in all_folder.glob("*.png"):
                    self._image_catalog[char_id]["all"].append(img_file.name)

            # Scan transform folders
            for folder_name in ["transform_frames", "transform_sequence"]:
                folder = char_dir / folder_name
                if folder.exists():
                    for img_file in folder.glob("*.png"):
                        self._image_catalog[char_id][folder_name].append(img_file.name)

        logger.info(f"Image catalog built: {len(self._image_catalog)} characters")

    def get_catalog_stats(self) -> Dict[str, Any]:
        """Get catalog statistics."""
        stats = {}
        for char_id, folders in self._image_catalog.items():
            stats[char_id] = {
                folder: len(files) for folder, files in folders.items()
            }
        return stats

    def select_image(
        self,
        character_id: str,
        context: str = None,
        emotion: str = None,
        action: str = None,
        mission_type: str = None,
        game_state: str = None,
        prefer_variant: int = None,
    ) -> ImageMatch:
        """
        Select the best image for a character based on context.

        Args:
            character_id: Character ID (jett, donnie, etc.)
            context: Free-text context description
            emotion: Specific emotion (happy, sad, etc.)
            action: Specific action (flying, building, etc.)
            mission_type: Mission type (delivery, construction, etc.)
            game_state: Game state (greeting, mission_start, etc.)
            prefer_variant: Preferred variant number (1, 2, 3)

        Returns:
            ImageMatch with best matching image
        """
        if character_id not in self._image_catalog:
            logger.warning(f"Character not found: {character_id}")
            return self._fallback_image(character_id)

        all_images = self._image_catalog[character_id]["all"]
        if not all_images:
            return self._fallback_image(character_id)

        # Build search keywords from inputs
        keywords = []

        if emotion:
            keywords.extend(IMAGE_MAPPINGS.get(emotion.lower(), [emotion.lower()]))

        if action:
            keywords.extend(IMAGE_MAPPINGS.get(action.lower(), [action.lower()]))

        if mission_type:
            keywords.extend(IMAGE_MAPPINGS.get(mission_type.lower(), []))

        if game_state:
            keywords.extend(IMAGE_MAPPINGS.get(game_state.lower(), []))

        if context:
            # Extract keywords from context
            context_lower = context.lower()
            for key, values in IMAGE_MAPPINGS.items():
                if key in context_lower:
                    keywords.extend(values)

        # Remove duplicates
        keywords = list(set(keywords))

        # Score each image
        scored_images = []
        for img_name in all_images:
            score = self._score_image(img_name, keywords)
            if score > 0:
                scored_images.append((img_name, score))

        # Sort by score
        scored_images.sort(key=lambda x: x[1], reverse=True)

        # Select best match
        if scored_images:
            # Filter by variant preference if specified
            if prefer_variant:
                variant_matches = [
                    (name, score) for name, score in scored_images
                    if f"_v{prefer_variant}" in name
                ]
                if variant_matches:
                    scored_images = variant_matches

            best_name, best_score = scored_images[0]
            alternatives = [name for name, _ in scored_images[1:4]]

            return ImageMatch(
                character_id=character_id,
                image_path=f"assets/images/characters/{character_id}/all/{best_name}",
                filename=best_name,
                category=self._categorize_image(best_name),
                confidence=min(1.0, best_score / 3.0),
                alternatives=[
                    f"assets/images/characters/{character_id}/all/{alt}"
                    for alt in alternatives
                ]
            )

        # Fallback to random selection
        return self._fallback_image(character_id)

    def _score_image(self, filename: str, keywords: List[str]) -> float:
        """Score an image based on keyword matches."""
        score = 0.0
        filename_lower = filename.lower().replace(".png", "").replace("_", " ")

        for keyword in keywords:
            if keyword in filename_lower:
                score += 1.0
            elif any(kw in filename_lower for kw in keyword.split("_")):
                score += 0.5

        return score

    def _categorize_image(self, filename: str) -> str:
        """Categorize an image by its filename."""
        filename_lower = filename.lower()

        if any(x in filename_lower for x in ["happy", "sad", "angry", "scared", "excited"]):
            return ImageCategory.EXPRESSION.value
        elif any(x in filename_lower for x in ["flying", "running", "building", "rescuing"]):
            return ImageCategory.ACTION.value
        elif any(x in filename_lower for x in ["transform", "stage"]):
            return ImageCategory.TRANSFORMATION.value
        elif "closeup" in filename_lower:
            return ImageCategory.CLOSEUP.value
        elif any(x in filename_lower for x in ["view", "profile", "portrait"]):
            return ImageCategory.POSE.value
        elif any(x in filename_lower for x in ["heroic", "victory", "thumbs"]):
            return ImageCategory.SPECIAL.value
        else:
            return ImageCategory.STATE.value

    def _fallback_image(self, character_id: str) -> ImageMatch:
        """Return a fallback image when no match found."""
        if character_id in self._image_catalog:
            all_images = self._image_catalog[character_id]["all"]
            if all_images:
                # Try to find a neutral standing pose
                neutral_options = [
                    img for img in all_images
                    if any(x in img.lower() for x in ["idle", "standing", "front"])
                ]
                if neutral_options:
                    chosen = random.choice(neutral_options)
                else:
                    chosen = random.choice(all_images)

                return ImageMatch(
                    character_id=character_id,
                    image_path=f"assets/images/characters/{character_id}/all/{chosen}",
                    filename=chosen,
                    category=self._categorize_image(chosen),
                    confidence=0.3,
                    alternatives=[]
                )

        # Absolute fallback
        return ImageMatch(
            character_id=character_id,
            image_path=f"assets/images/characters/{character_id}/portraits/icon.png",
            filename="icon.png",
            category="fallback",
            confidence=0.0,
            alternatives=[]
        )

    def select_transformation_sequence(
        self,
        character_id: str,
        stage_count: int = 5
    ) -> List[str]:
        """
        Get transformation sequence images.

        Args:
            character_id: Character ID
            stage_count: Number of stages to return

        Returns:
            List of image paths for transformation sequence
        """
        if character_id not in self._image_catalog:
            return []

        # Check transform_sequence folder first
        sequence = self._image_catalog[character_id].get("transform_sequence", [])
        if sequence:
            # Sort by stage number
            sorted_seq = sorted(sequence)
            return [
                f"assets/images/characters/{character_id}/transform_sequence/{img}"
                for img in sorted_seq[:stage_count]
            ]

        # Fallback to all folder transform images
        all_images = self._image_catalog[character_id]["all"]
        transform_images = [
            img for img in all_images
            if "stage" in img.lower() or "transform" in img.lower()
        ]

        if transform_images:
            transform_images.sort()
            return [
                f"assets/images/characters/{character_id}/all/{img}"
                for img in transform_images[:stage_count]
            ]

        return []

    def select_for_dialogue(
        self,
        character_id: str,
        dialogue_type: str,
        emotion: str = "neutral"
    ) -> ImageMatch:
        """
        Select image appropriate for dialogue display.

        Args:
            character_id: Character ID
            dialogue_type: Type of dialogue (greeting, conversation, etc.)
            emotion: Character emotion

        Returns:
            Best matching image for dialogue
        """
        dialogue_mappings = {
            "greeting": "friendly",
            "farewell": "waving",
            "transformation": "determined",
            "success": "celebrating",
            "failure": "sad",
            "thinking": "thinking",
            "explaining": "communicating",
        }

        game_state = dialogue_mappings.get(dialogue_type, "idle")

        return self.select_image(
            character_id=character_id,
            emotion=emotion,
            game_state=game_state
        )

    def select_for_mission(
        self,
        character_id: str,
        mission_type: str,
        phase: str = "active"
    ) -> ImageMatch:
        """
        Select image appropriate for mission display.

        Args:
            character_id: Character ID
            mission_type: Type of mission
            phase: Mission phase (start, active, end)

        Returns:
            Best matching image for mission
        """
        phase_mappings = {
            "start": "mission_start",
            "active": None,  # Use mission_type
            "end": "success",
        }

        game_state = phase_mappings.get(phase)

        return self.select_image(
            character_id=character_id,
            mission_type=mission_type,
            game_state=game_state,
            action=mission_type if phase == "active" else None
        )

    async def select_with_ai(
        self,
        character_id: str,
        context: str,
        use_rag: bool = True
    ) -> ImageMatch:
        """
        Use AI/LLM to select the best image with more nuanced understanding.

        Args:
            character_id: Character ID
            context: Rich context description
            use_rag: Whether to use RAG for additional context

        Returns:
            AI-selected best matching image
        """
        if not self.llm:
            # Fallback to keyword matching
            return self.select_image(character_id=character_id, context=context)

        # Get available images for this character
        all_images = self._image_catalog.get(character_id, {}).get("all", [])
        if not all_images:
            return self._fallback_image(character_id)

        # Create prompt for LLM
        from ..llm import ChatMessage, GenerationConfig

        # Group images by type for cleaner prompt
        image_types = {}
        for img in all_images:
            base_name = img.rsplit("_v", 1)[0] if "_v" in img else img.replace(".png", "")
            if base_name not in image_types:
                image_types[base_name] = []
            image_types[base_name].append(img)

        type_list = list(image_types.keys())

        prompt = f"""Given the context: "{context}"

Select the most appropriate image type for the character {character_id}.

Available image types:
{chr(10).join(f"- {t}" for t in type_list[:30])}

Respond with ONLY the image type name that best matches the context. Choose one from the list above."""

        messages = [
            ChatMessage.system("You are an image selector. Respond with only the image type name."),
            ChatMessage.user(prompt)
        ]

        config = GenerationConfig(max_new_tokens=20, temperature=0.3)

        try:
            response = await self.llm.chat(messages, config)
            selected_type = response.content.strip().lower().replace(" ", "_")

            # Find matching images
            matching = [
                img for img in all_images
                if selected_type in img.lower()
            ]

            if matching:
                chosen = random.choice(matching)
                return ImageMatch(
                    character_id=character_id,
                    image_path=f"assets/images/characters/{character_id}/all/{chosen}",
                    filename=chosen,
                    category=self._categorize_image(chosen),
                    confidence=0.9,
                    alternatives=[
                        f"assets/images/characters/{character_id}/all/{alt}"
                        for alt in matching if alt != chosen
                    ][:3]
                )
        except Exception as e:
            logger.warning(f"AI selection failed, using fallback: {e}")

        # Fallback to keyword matching
        return self.select_image(character_id=character_id, context=context)


# Singleton instance
_image_selector: Optional[ImageSelectorAgent] = None


def get_image_selector(llm=None, reset: bool = False) -> ImageSelectorAgent:
    """Get or create image selector singleton."""
    global _image_selector
    if _image_selector is None or reset:
        _image_selector = ImageSelectorAgent(llm=llm)
    return _image_selector


def reset_image_selector() -> None:
    """Reset the image selector singleton (for testing)."""
    global _image_selector
    _image_selector = None
