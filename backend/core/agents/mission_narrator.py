"""
Mission Narrator Agent for Super Wings Simulator.
Generates engaging story narration for mission phases.
"""

import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from enum import Enum

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, ReasoningMode
from .prompts import (
    NARRATION_SYSTEM,
    NARRATION_DEPARTURE_PROMPT,
    NARRATION_FLYING_PROMPT,
    NARRATION_ARRIVAL_PROMPT,
    NARRATION_TRANSFORMATION_PROMPT,
    NARRATION_SOLVING_PROMPT,
    NARRATION_SUCCESS_PROMPT,
    NARRATION_RETURN_PROMPT,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


class NarrationPhase(str, Enum):
    """Mission phases for narration."""
    DISPATCH = "dispatch"
    DEPARTURE = "departure"
    FLYING = "flying"
    ARRIVAL = "arrival"
    MEETING = "meeting"
    TRANSFORMATION = "transformation"
    SOLVING = "solving"
    SUCCESS = "success"
    CELEBRATION = "celebration"
    RETURN = "return"


class NarrationRequest(BaseModel):
    """Request for narration generation."""
    phase: NarrationPhase
    character_id: str
    character_name: Optional[str] = None
    location: str
    problem: Optional[str] = None
    solution: Optional[str] = None
    npc_name: Optional[str] = None
    extra_context: Optional[Dict[str, Any]] = None


class Narration(BaseModel):
    """Generated narration."""
    phase: NarrationPhase
    text: str
    character_id: str
    location: str
    sound_cues: Optional[List[str]] = None
    animation_hints: Optional[List[str]] = None


# Pre-defined narration templates for fast generation
NARRATION_TEMPLATES = {
    NarrationPhase.DISPATCH: [
        "A call for help comes in from {location}! {character_name} is ready for action!",
        "Emergency alert! Someone in {location} needs help. {character_name}, time to fly!",
        "The mission board lights up with a new delivery to {location}. {character_name} prepares for takeoff!",
    ],
    NarrationPhase.DEPARTURE: [
        "{character_name}'s engines roar to life as they speed down the runway. Up, up, and away!",
        "With a burst of speed, {character_name} takes off into the sky, heading toward {location}!",
        "The runway stretches ahead. {character_name} zooms forward and lifts off into the clouds!",
    ],
    NarrationPhase.FLYING: [
        "{character_name} soars through the fluffy clouds, getting closer to {location} with every second!",
        "The wind rushes by as {character_name} flies over mountains and rivers, adventure ahead!",
        "High in the sky, {character_name} can see the whole world below. {location} is just ahead!",
    ],
    NarrationPhase.ARRIVAL: [
        "{character_name} descends through the clouds and spots {location} below. Time to land!",
        "There it is! {location} comes into view as {character_name} prepares for a perfect landing.",
        "{character_name} circles once, twice, and touches down smoothly in {location}. Mission time!",
    ],
    NarrationPhase.TRANSFORMATION: [
        "{character_name} feels the power building up. Time to transform! Gears shift, parts move, and a new form emerges!",
        "The situation calls for special abilities. {character_name} begins the amazing transformation sequence!",
        "With a flash of light, {character_name} transforms! Now they're ready for anything!",
    ],
    NarrationPhase.SOLVING: [
        "{character_name} gets to work right away, using their special skills to tackle the problem!",
        "With determination in their eyes, {character_name} begins solving the challenge step by step.",
        "This is what {character_name} does best! They work quickly and carefully to help.",
    ],
    NarrationPhase.SUCCESS: [
        "The problem is solved! {character_name} has done it again!",
        "Success! Thanks to {character_name}'s hard work, everything is back to normal.",
        "Mission accomplished! {character_name} saved the day in {location}!",
    ],
    NarrationPhase.CELEBRATION: [
        "Everyone cheers for {character_name}! What a hero!",
        "Smiles all around! {npc_name} thanks {character_name} for the amazing help.",
        "It's time to celebrate! {character_name} has made everyone so happy!",
    ],
    NarrationPhase.RETURN: [
        "With the mission complete, {character_name} waves goodbye and takes off for home.",
        "{character_name} flies back toward World Airport, feeling proud of another job well done!",
        "The sun sets as {character_name} returns home. What a wonderful adventure!",
    ],
}


class MissionNarratorAgent(BaseAgent):
    """
    Agent for generating engaging story narrations.

    Creates child-friendly, exciting narrations for each
    phase of a Super Wings mission.
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="mission_narrator",
            description="Generates story narration for Super Wings missions",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
            **kwargs,
        )
        self._knowledge_base = None
        self._characters_data = {}

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    def load_characters(self, characters_file: str = "./data/characters.json") -> None:
        """Load character data for narration context."""
        import json
        from pathlib import Path

        path = Path(characters_file)
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self._characters_data = data.get("characters", {})
            logger.info(f"Narrator loaded {len(self._characters_data)} characters")

    def _get_character_name(self, character_id: str) -> str:
        """Get character display name."""
        if character_id in self._characters_data:
            return self._characters_data[character_id].get("name", character_id.title())
        return character_id.title()

    def _get_character_info(self, character_id: str) -> Dict[str, Any]:
        """Get character information for narration."""
        if character_id in self._characters_data:
            char = self._characters_data[character_id]
            return {
                "name": char.get("name", character_id.title()),
                "vehicle_form": char.get("type", "plane"),
                "abilities": char.get("abilities", []),
                "personality": char.get("personality", ""),
                "visual": char.get("visual_description", {}),
            }
        return {
            "name": character_id.title(),
            "vehicle_form": "plane",
            "abilities": [],
            "personality": "",
            "visual": {},
        }

    async def get_system_prompt(self) -> str:
        """Get system prompt for narration."""
        return NARRATION_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute narration generation step."""
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(context.get("prompt", step.description)),
        ]

        response = await self._call_llm(messages)

        return {
            "step": step.step_number,
            "type": "narration",
            "output": response,
            "success": True,
        }

    def generate_template_narration(
        self,
        request: NarrationRequest,
    ) -> Narration:
        """
        Generate narration from templates (fast, no LLM).

        Args:
            request: Narration request

        Returns:
            Generated Narration
        """
        import random

        templates = NARRATION_TEMPLATES.get(request.phase, NARRATION_TEMPLATES[NarrationPhase.FLYING])
        template = random.choice(templates)

        character_name = request.character_name or self._get_character_name(request.character_id)

        text = template.format(
            character_name=character_name,
            location=request.location,
            problem=request.problem or "the challenge",
            solution=request.solution or "their special skills",
            npc_name=request.npc_name or "everyone",
        )

        return Narration(
            phase=request.phase,
            text=text,
            character_id=request.character_id,
            location=request.location,
        )

    async def generate_narration(
        self,
        request: NarrationRequest,
        use_llm: bool = True,
    ) -> Narration:
        """
        Generate narration for a mission phase.

        Args:
            request: Narration request
            use_llm: Whether to use LLM for generation

        Returns:
            Generated Narration
        """
        if not use_llm:
            return self.generate_template_narration(request)

        char_info = self._get_character_info(request.character_id)
        character_name = request.character_name or char_info["name"]

        # Select prompt based on phase
        prompt = self._get_phase_prompt(request, char_info)

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=150,
            temperature=0.8,
        )

        response = await self._call_llm(messages, config)
        text = self._clean_narration(response)

        # Generate animation hints based on phase
        animation_hints = self._get_animation_hints(request.phase)
        sound_cues = self._get_sound_cues(request.phase)

        return Narration(
            phase=request.phase,
            text=text,
            character_id=request.character_id,
            location=request.location,
            sound_cues=sound_cues,
            animation_hints=animation_hints,
        )

    def _get_phase_prompt(
        self,
        request: NarrationRequest,
        char_info: Dict[str, Any],
    ) -> str:
        """Get the appropriate prompt for the narration phase."""
        character_name = request.character_name or char_info["name"]

        if request.phase == NarrationPhase.DEPARTURE:
            return NARRATION_DEPARTURE_PROMPT.format(
                character_name=character_name,
                destination=request.location,
                problem=request.problem or "help someone",
            )
        elif request.phase == NarrationPhase.FLYING:
            return NARRATION_FLYING_PROMPT.format(
                character_name=character_name,
                current_area="the sky",
                destination=request.location,
                conditions=request.extra_context.get("weather", "clear skies") if request.extra_context else "clear skies",
            )
        elif request.phase == NarrationPhase.ARRIVAL:
            # Get location description
            loc_results = self.knowledge_base.search_locations(request.location, top_k=1)
            loc_desc = ""
            if loc_results:
                loc_desc = loc_results[0].document.content[:200]

            return NARRATION_ARRIVAL_PROMPT.format(
                character_name=character_name,
                location=request.location,
                location_description=loc_desc or f"the beautiful {request.location}",
            )
        elif request.phase == NarrationPhase.TRANSFORMATION:
            return NARRATION_TRANSFORMATION_PROMPT.format(
                character_name=character_name,
                vehicle_form=char_info["vehicle_form"],
                robot_description=f"{character_name} in robot form with special abilities",
                situation=request.problem or "a challenging situation",
            )
        elif request.phase == NarrationPhase.SOLVING:
            return NARRATION_SOLVING_PROMPT.format(
                character_name=character_name,
                problem=request.problem or "the challenge",
                solution_approach=request.solution or "using their special skills",
            )
        elif request.phase == NarrationPhase.SUCCESS:
            return NARRATION_SUCCESS_PROMPT.format(
                character_name=character_name,
                problem=request.problem or "the challenge",
                solution=request.solution or "hard work and determination",
                npc_name=request.npc_name or "everyone",
            )
        elif request.phase == NarrationPhase.RETURN:
            return NARRATION_RETURN_PROMPT.format(
                character_name=character_name,
                location=request.location,
                result="successfully completed",
            )
        else:
            # Default narration request
            return f"""Generate a brief narration (2-3 sentences) for the {request.phase.value} phase.

Character: {character_name}
Location: {request.location}
Context: {request.problem or 'An exciting Super Wings adventure'}

Narration:"""

    def _clean_narration(self, text: str) -> str:
        """Clean up generated narration."""
        text = text.strip()

        # Remove common prefixes
        prefixes = ["Narration:", "Here's the narration:", "Output:"]
        for prefix in prefixes:
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):].strip()

        # Ensure it ends with punctuation
        if text and text[-1] not in ".!?":
            text += "!"

        return text

    def _get_animation_hints(self, phase: NarrationPhase) -> List[str]:
        """Get animation hints for a phase."""
        hints = {
            NarrationPhase.DISPATCH: ["alert_flash", "character_ready"],
            NarrationPhase.DEPARTURE: ["runway_roll", "takeoff", "clouds_part"],
            NarrationPhase.FLYING: ["fly_forward", "cloud_pass", "sun_shine"],
            NarrationPhase.ARRIVAL: ["descend", "landing", "touchdown"],
            NarrationPhase.TRANSFORMATION: ["transform_sequence", "glow_effect", "form_change"],
            NarrationPhase.SOLVING: ["action_sequence", "tool_use", "progress_bar"],
            NarrationPhase.SUCCESS: ["celebration", "sparkle", "thumbs_up"],
            NarrationPhase.CELEBRATION: ["confetti", "cheer", "group_pose"],
            NarrationPhase.RETURN: ["wave_goodbye", "takeoff", "sunset_fly"],
        }
        return hints.get(phase, ["generic_action"])

    def _get_sound_cues(self, phase: NarrationPhase) -> List[str]:
        """Get sound cues for a phase."""
        cues = {
            NarrationPhase.DISPATCH: ["alert_sound", "engine_start"],
            NarrationPhase.DEPARTURE: ["engine_roar", "whoosh"],
            NarrationPhase.FLYING: ["wind", "engine_hum"],
            NarrationPhase.ARRIVAL: ["landing_gear", "touchdown"],
            NarrationPhase.TRANSFORMATION: ["transform_sound", "power_up"],
            NarrationPhase.SOLVING: ["action_sounds", "effort"],
            NarrationPhase.SUCCESS: ["success_fanfare", "cheer"],
            NarrationPhase.CELEBRATION: ["celebration_music", "applause"],
            NarrationPhase.RETURN: ["goodbye_tune", "flight_sound"],
        }
        return cues.get(phase, ["ambient"])

    async def stream_narration(
        self,
        request: NarrationRequest,
    ) -> AsyncGenerator[str, None]:
        """
        Stream narration generation for real-time display.

        Args:
            request: Narration request

        Yields:
            Narration tokens as they're generated
        """
        char_info = self._get_character_info(request.character_id)
        prompt = self._get_phase_prompt(request, char_info)

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=150,
            temperature=0.8,
        )

        async for token in self._call_llm_stream(messages, config):
            yield token

    async def narrate_full_mission(
        self,
        character_id: str,
        location: str,
        problem: str,
        solution: str,
        npc_name: Optional[str] = None,
    ) -> List[Narration]:
        """
        Generate narrations for a complete mission.

        Args:
            character_id: Character on mission
            location: Mission location
            problem: Problem to solve
            solution: How it was solved
            npc_name: NPC helped

        Returns:
            List of narrations for each phase
        """
        phases = [
            NarrationPhase.DISPATCH,
            NarrationPhase.DEPARTURE,
            NarrationPhase.FLYING,
            NarrationPhase.ARRIVAL,
            NarrationPhase.TRANSFORMATION,
            NarrationPhase.SOLVING,
            NarrationPhase.SUCCESS,
            NarrationPhase.RETURN,
        ]

        narrations = []
        for phase in phases:
            request = NarrationRequest(
                phase=phase,
                character_id=character_id,
                location=location,
                problem=problem,
                solution=solution,
                npc_name=npc_name,
            )
            narration = await self.generate_narration(request)
            narrations.append(narration)

        return narrations


# Singleton instance
_narrator_agent: Optional[MissionNarratorAgent] = None


def get_narrator_agent(**kwargs) -> MissionNarratorAgent:
    """Get or create narrator agent singleton."""
    global _narrator_agent

    if _narrator_agent is None:
        from ...config import get_settings
        settings = get_settings()

        _narrator_agent = MissionNarratorAgent(**kwargs)
        _narrator_agent.load_characters(settings.game.characters_file)

    return _narrator_agent
