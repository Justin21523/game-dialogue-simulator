"""
Character Dialogue Agent for Super Wings Simulator.
Generates character-appropriate dialogues with streaming support.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, ReasoningMode
from .prompts import (
    CHARACTER_DIALOGUE_SYSTEM,
    CHARACTER_DIALOGUE_PROMPT,
    CHARACTER_GREETING_PROMPT,
    CHARACTER_TRANSFORMATION_PROMPT,
    NPC_DIALOGUE_SYSTEM,
    NPC_GREETING_PROMPT,
    NPC_PROBLEM_EXPLAIN,
    NPC_THANKS_PROMPT,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


class DialogueType(str, Enum):
    """Types of dialogue generation."""
    GREETING = "greeting"
    CONVERSATION = "conversation"
    TRANSFORMATION = "transformation"
    CELEBRATION = "celebration"
    FAREWELL = "farewell"
    NPC_GREETING = "npc_greeting"
    NPC_EXPLAIN = "npc_explain"
    NPC_THANKS = "npc_thanks"


class MissionPhase(str, Enum):
    """Mission phases for context."""
    DISPATCH = "dispatch"
    DEPARTURE = "departure"
    FLYING = "flying"
    ARRIVAL = "arrival"
    MEETING_NPC = "meeting_npc"
    UNDERSTANDING = "understanding"
    TRANSFORMATION = "transformation"
    SOLVING = "solving"
    RESOLUTION = "resolution"
    CELEBRATION = "celebration"
    RETURN = "return"


class DialogueRequest(BaseModel):
    """Request for dialogue generation."""
    character_id: str
    dialogue_type: DialogueType = DialogueType.CONVERSATION
    situation: str
    mission_phase: Optional[MissionPhase] = None
    emotion: str = "happy"
    speaking_to: str = "child"
    dialogue_history: Optional[List[str]] = None
    location: Optional[str] = None
    problem: Optional[str] = None


class NPCDialogueRequest(BaseModel):
    """Request for NPC dialogue generation."""
    npc_name: str
    location: str
    dialogue_type: DialogueType
    problem: str
    cultural_notes: Optional[str] = None
    character_name: Optional[str] = None  # The Super Wings character they're talking to
    solution_summary: Optional[str] = None


@dataclass
class CharacterVoice:
    """Character voice configuration for dialogue."""
    character_id: str
    name: str
    catchphrase: Optional[str]
    speaking_style: str
    personality: str
    example_phrases: List[str]


class CharacterDialogueAgent(BaseAgent):
    """
    Agent for generating character-appropriate dialogues.

    Supports streaming for real-time dialogue display and
    maintains character consistency through RAG-enhanced context.
    """

    def __init__(
        self,
        characters_data: Optional[Dict[str, Any]] = None,
        **kwargs,
    ):
        super().__init__(
            name="character_dialogue",
            description="Generates Super Wings character dialogues",
            reasoning_mode=ReasoningMode.SIMPLE,  # Direct generation, no complex planning
            enable_planning=False,
            **kwargs,
        )

        self._characters_data = characters_data or {}
        self._knowledge_base = None
        self._voice_cache: Dict[str, CharacterVoice] = {}

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    def load_characters(self, characters_file: str = "./data/characters.json") -> None:
        """Load character data from file."""
        from pathlib import Path

        path = Path(characters_file)
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self._characters_data = data.get("characters", {})
            logger.info(f"Loaded {len(self._characters_data)} characters for dialogue")
            self._build_voice_cache()
        else:
            logger.warning(f"Characters file not found: {characters_file}")

    def _build_voice_cache(self) -> None:
        """Build voice configuration cache for characters."""
        for char_id, char_data in self._characters_data.items():
            prompt_hints = char_data.get("prompt_hints", {})

            self._voice_cache[char_id] = CharacterVoice(
                character_id=char_id,
                name=char_data.get("name", char_id),
                catchphrase=char_data.get("catchphrase"),
                speaking_style=prompt_hints.get("expression_style", "friendly and helpful"),
                personality=char_data.get("personality", ""),
                example_phrases=prompt_hints.get("voice_lines", []),
            )

    def get_character_voice(self, character_id: str) -> Optional[CharacterVoice]:
        """Get voice configuration for a character."""
        return self._voice_cache.get(character_id)

    def format_character_profile(self, character_id: str) -> str:
        """Format character profile for prompt context."""
        if character_id not in self._characters_data:
            return f"Character: {character_id}"

        char = self._characters_data[character_id]
        voice = self._voice_cache.get(character_id)

        parts = [
            f"Name: {char.get('name', character_id)}",
            f"Personality: {char.get('personality', '')}",
            f"Role: {char.get('role', '')}",
        ]

        if voice:
            parts.append(f"Speaking Style: {voice.speaking_style}")
            if voice.catchphrase:
                parts.append(f"Catchphrase: {voice.catchphrase}")
            if voice.example_phrases:
                parts.append(f"Example phrases: {', '.join(voice.example_phrases[:3])}")

        abilities = char.get("abilities", [])
        if abilities:
            parts.append(f"Special Abilities: {', '.join(abilities)}")

        return "\n".join(parts)

    async def get_system_prompt(self) -> str:
        """Get system prompt for dialogue generation."""
        return CHARACTER_DIALOGUE_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute dialogue generation step."""
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(context.get("prompt", step.description)),
        ]

        response = await self._call_llm(messages)

        return {
            "step": step.step_number,
            "type": "dialogue",
            "output": response,
            "success": True,
        }

    async def generate_dialogue(
        self,
        request: DialogueRequest,
    ) -> str:
        """
        Generate dialogue for a character.

        Args:
            request: Dialogue generation request

        Returns:
            Generated dialogue string
        """
        character_profile = self.format_character_profile(request.character_id)

        # Get RAG context if available
        rag_context = ""
        try:
            retrieval = self.knowledge_base.retrieve_for_dialogue(
                character_id=request.character_id,
                situation=request.situation,
            )
            if retrieval.formatted_context:
                rag_context = f"\n\n## Additional Context\n{retrieval.formatted_context}"
        except Exception as e:
            logger.warning(f"RAG retrieval failed: {e}")

        # Select appropriate prompt based on dialogue type
        if request.dialogue_type == DialogueType.GREETING:
            prompt = CHARACTER_GREETING_PROMPT.format(
                character_name=self._get_character_name(request.character_id),
                character_profile=character_profile + rag_context,
                location=request.location or "unknown destination",
                problem=request.problem or "help someone",
            )
        elif request.dialogue_type == DialogueType.TRANSFORMATION:
            prompt = CHARACTER_TRANSFORMATION_PROMPT.format(
                character_name=self._get_character_name(request.character_id),
                character_profile=character_profile,
                situation=request.situation,
            )
        else:
            # General conversation
            dialogue_history = ""
            if request.dialogue_history:
                dialogue_history = "\n".join(request.dialogue_history[-5:])  # Last 5 exchanges

            prompt = CHARACTER_DIALOGUE_PROMPT.format(
                character_profile=character_profile + rag_context,
                situation=request.situation,
                mission_phase=request.mission_phase.value if request.mission_phase else "active",
                emotion=request.emotion,
                speaking_to=request.speaking_to,
                dialogue_history=dialogue_history or "No previous dialogue",
            )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=200,
            temperature=0.8,
        )

        response = await self._call_llm(messages, config)
        return self._clean_dialogue(response, request.character_id)

    async def stream_dialogue(
        self,
        request: DialogueRequest,
    ) -> AsyncGenerator[str, None]:
        """
        Stream dialogue generation for real-time display.

        Args:
            request: Dialogue generation request

        Yields:
            Dialogue tokens as they're generated
        """
        character_profile = self.format_character_profile(request.character_id)

        # Build prompt based on dialogue type
        if request.dialogue_type == DialogueType.GREETING:
            prompt = CHARACTER_GREETING_PROMPT.format(
                character_name=self._get_character_name(request.character_id),
                character_profile=character_profile,
                location=request.location or "unknown destination",
                problem=request.problem or "help someone",
            )
        elif request.dialogue_type == DialogueType.TRANSFORMATION:
            prompt = CHARACTER_TRANSFORMATION_PROMPT.format(
                character_name=self._get_character_name(request.character_id),
                character_profile=character_profile,
                situation=request.situation,
            )
        else:
            dialogue_history = ""
            if request.dialogue_history:
                dialogue_history = "\n".join(request.dialogue_history[-5:])

            prompt = CHARACTER_DIALOGUE_PROMPT.format(
                character_profile=character_profile,
                situation=request.situation,
                mission_phase=request.mission_phase.value if request.mission_phase else "active",
                emotion=request.emotion,
                speaking_to=request.speaking_to,
                dialogue_history=dialogue_history or "No previous dialogue",
            )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=200,
            temperature=0.8,
        )

        async for token in self._call_llm_stream(messages, config):
            yield token

    async def generate_npc_dialogue(
        self,
        request: NPCDialogueRequest,
    ) -> str:
        """
        Generate NPC dialogue.

        Args:
            request: NPC dialogue request

        Returns:
            Generated NPC dialogue
        """
        system_prompt = NPC_DIALOGUE_SYSTEM

        if request.dialogue_type == DialogueType.NPC_GREETING:
            prompt = NPC_GREETING_PROMPT.format(
                npc_name=request.npc_name,
                location=request.location,
                problem=request.problem,
                cultural_notes=request.cultural_notes or "Local culture",
                character_name=request.character_name or "Super Wings friend",
            )
        elif request.dialogue_type == DialogueType.NPC_EXPLAIN:
            prompt = NPC_PROBLEM_EXPLAIN.format(
                npc_name=request.npc_name,
                location=request.location,
                cultural_notes=request.cultural_notes or "Local culture",
                problem_description=request.problem,
            )
        elif request.dialogue_type == DialogueType.NPC_THANKS:
            prompt = NPC_THANKS_PROMPT.format(
                npc_name=request.npc_name,
                location=request.location,
                cultural_notes=request.cultural_notes or "Local culture",
                solution_summary=request.solution_summary or "solved the problem",
                character_name=request.character_name or "Super Wings friend",
            )
        else:
            # Generic NPC dialogue
            prompt = f"""Generate dialogue for {request.npc_name} from {request.location}.

Situation: {request.problem}
Cultural context: {request.cultural_notes or 'Local culture'}

Generate appropriate dialogue (2-3 sentences):"""

        messages = [
            ChatMessage.system(system_prompt),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=150,
            temperature=0.8,
        )

        response = await self._call_llm(messages, config)
        return self._clean_dialogue(response)

    async def stream_npc_dialogue(
        self,
        request: NPCDialogueRequest,
    ) -> AsyncGenerator[str, None]:
        """Stream NPC dialogue generation."""
        system_prompt = NPC_DIALOGUE_SYSTEM

        if request.dialogue_type == DialogueType.NPC_GREETING:
            prompt = NPC_GREETING_PROMPT.format(
                npc_name=request.npc_name,
                location=request.location,
                problem=request.problem,
                cultural_notes=request.cultural_notes or "Local culture",
                character_name=request.character_name or "Super Wings friend",
            )
        else:
            prompt = f"""Generate dialogue for {request.npc_name} from {request.location}.
Situation: {request.problem}
Generate appropriate dialogue:"""

        messages = [
            ChatMessage.system(system_prompt),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=150,
            temperature=0.8,
        )

        async for token in self._call_llm_stream(messages, config):
            yield token

    def _get_character_name(self, character_id: str) -> str:
        """Get character display name."""
        if character_id in self._characters_data:
            return self._characters_data[character_id].get("name", character_id)
        return character_id.title()

    def _clean_dialogue(self, dialogue: str, character_id: Optional[str] = None) -> str:
        """Clean up generated dialogue."""
        dialogue = dialogue.strip()

        # Remove common prefixes
        prefixes_to_remove = [
            "Here's the dialogue:",
            "Dialogue:",
            "Response:",
        ]

        # Add character-specific prefix if character_id is provided
        if character_id:
            prefixes_to_remove.append(f"{self._get_character_name(character_id)}:")

        for prefix in prefixes_to_remove:
            if dialogue.lower().startswith(prefix.lower()):
                dialogue = dialogue[len(prefix):].strip()

        # Remove surrounding quotes if present
        if dialogue.startswith('"') and dialogue.endswith('"'):
            dialogue = dialogue[1:-1]

        return dialogue


# Singleton instance
_dialogue_agent: Optional[CharacterDialogueAgent] = None


def get_dialogue_agent(**kwargs) -> CharacterDialogueAgent:
    """Get or create dialogue agent singleton."""
    global _dialogue_agent

    if _dialogue_agent is None:
        from ...config import get_settings
        settings = get_settings()

        _dialogue_agent = CharacterDialogueAgent(**kwargs)
        _dialogue_agent.load_characters(settings.game.characters_file)

    return _dialogue_agent
