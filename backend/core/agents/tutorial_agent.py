"""
Tutorial Agent for Super Wings Simulator.
Provides game tutorials, hints, and guidance for players.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from enum import Enum

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, ReasoningMode
from .prompts import (
    TUTORIAL_SYSTEM,
    TUTORIAL_EXPLAIN_PROMPT,
    TUTORIAL_HINT_PROMPT,
    TUTORIAL_CHARACTER_GUIDE_PROMPT,
    TUTORIAL_MISSION_TYPE_PROMPT,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


class TutorialType(str, Enum):
    """Types of tutorial content."""
    GETTING_STARTED = "getting_started"
    CHARACTER_SELECTION = "character_selection"
    MISSION_TYPES = "mission_types"
    ENERGY_SYSTEM = "energy_system"
    LEVELING_UP = "leveling_up"
    RESOURCES = "resources"
    TRANSFORMATION = "transformation"
    EVENTS = "events"
    CHARACTER_GUIDE = "character_guide"
    GAME_HINT = "game_hint"


class TutorialRequest(BaseModel):
    """Request for tutorial content."""
    topic: str
    tutorial_type: Optional[TutorialType] = None
    character_id: Optional[str] = None
    mission_type: Optional[str] = None
    player_level: Optional[int] = None
    language: str = "en"  # en or zh


class TutorialHintRequest(BaseModel):
    """Request for game hints."""
    current_situation: str
    character_id: Optional[str] = None
    mission_type: Optional[str] = None
    player_progress: Optional[Dict[str, Any]] = None


class TutorialResponse(BaseModel):
    """Tutorial response."""
    topic: str
    content: str
    tips: List[str] = []
    related_topics: List[str] = []
    character_id: Optional[str] = None


class TutorialAgent(BaseAgent):
    """
    Agent for providing game tutorials and guidance.

    Generates helpful explanations, hints, and character guides
    using RAG-enhanced context.
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="tutorial_agent",
            description="Provides game tutorials and guidance for Super Wings Simulator",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
            **kwargs,
        )
        self._knowledge_base = None
        self._characters_data = {}
        self._tutorials_data = {}

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    def load_data(
        self,
        characters_file: str = "./data/characters.json",
        tutorials_file: str = "./backend/data/knowledge/tutorials.json",
    ) -> None:
        """Load character and tutorial data."""
        from pathlib import Path

        # Load characters
        char_path = Path(characters_file)
        if char_path.exists():
            with open(char_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self._characters_data = data.get("characters", {})
            logger.info(f"Loaded {len(self._characters_data)} characters for tutorial")

        # Load tutorials
        tut_path = Path(tutorials_file)
        if tut_path.exists():
            with open(tut_path, "r", encoding="utf-8") as f:
                self._tutorials_data = json.load(f)
            logger.info("Loaded tutorial data")

    async def get_system_prompt(self) -> str:
        """Get system prompt for tutorial generation."""
        return TUTORIAL_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute tutorial generation step."""
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(context.get("prompt", step.description)),
        ]

        response = await self._call_llm(messages)

        return {
            "step": step.step_number,
            "type": "tutorial",
            "output": response,
            "success": True,
        }

    async def explain_topic(
        self,
        request: TutorialRequest,
    ) -> TutorialResponse:
        """
        Explain a game topic or concept.

        Args:
            request: Tutorial request

        Returns:
            TutorialResponse with explanation
        """
        # Get RAG context
        retrieval = self.knowledge_base.retrieve_for_tutorial(
            topic=request.topic,
            character_id=request.character_id,
            category=request.tutorial_type.value if request.tutorial_type else None,
        )

        # Check for pre-defined tutorial
        tutorial_content = self._get_predefined_tutorial(request)

        # Build prompt
        prompt = TUTORIAL_EXPLAIN_PROMPT.format(
            topic=request.topic,
            tutorial_type=request.tutorial_type.value if request.tutorial_type else "general",
            rag_context=retrieval.formatted_context,
            predefined_content=tutorial_content or "No predefined tutorial available",
            language="Chinese" if request.language == "zh" else "English",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=400,
            temperature=0.7,
        )

        response = await self._call_llm(messages, config)

        # Extract tips if tutorial data available
        tips = self._get_tips_for_topic(request.topic)
        related = self._get_related_topics(request.topic)

        return TutorialResponse(
            topic=request.topic,
            content=self._clean_response(response),
            tips=tips,
            related_topics=related,
            character_id=request.character_id,
        )

    async def get_hint(
        self,
        request: TutorialHintRequest,
    ) -> TutorialResponse:
        """
        Get a contextual game hint.

        Args:
            request: Hint request with current situation

        Returns:
            TutorialResponse with helpful hint
        """
        # Get RAG context
        retrieval = self.knowledge_base.retrieve_for_tutorial(
            topic=request.current_situation,
            character_id=request.character_id,
        )

        # Build prompt
        prompt = TUTORIAL_HINT_PROMPT.format(
            situation=request.current_situation,
            character_id=request.character_id or "unknown",
            mission_type=request.mission_type or "general",
            rag_context=retrieval.formatted_context,
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

        return TutorialResponse(
            topic="Game Hint",
            content=self._clean_response(response),
            tips=[],
            related_topics=[],
            character_id=request.character_id,
        )

    async def get_character_guide(
        self,
        character_id: str,
        language: str = "en",
    ) -> TutorialResponse:
        """
        Get comprehensive guide for a character.

        Args:
            character_id: Character to get guide for
            language: Response language

        Returns:
            TutorialResponse with character guide
        """
        # Get character data
        char_data = self._characters_data.get(character_id, {})
        char_name = char_data.get("name", character_id.title())

        # Get character guide from tutorials
        guide_data = self._tutorials_data.get("character_guides", {}).get(character_id, {})

        # Get RAG context
        guide_doc = self.knowledge_base.get_character_guide(character_id)
        char_doc = self.knowledge_base._character_store.get_document(f"char_{character_id}")

        context_parts = []
        if guide_doc:
            context_parts.append(guide_doc.content)
        if char_doc:
            context_parts.append(char_doc.content)

        prompt = TUTORIAL_CHARACTER_GUIDE_PROMPT.format(
            character_name=char_name,
            character_id=character_id,
            character_data=json.dumps(char_data, indent=2) if char_data else "No data",
            guide_data=json.dumps(guide_data, indent=2) if guide_data else "No guide",
            rag_context="\n".join(context_parts),
            language="Chinese" if language == "zh" else "English",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=500,
            temperature=0.7,
        )

        response = await self._call_llm(messages, config)

        # Get tips from guide data
        tips = []
        if guide_data.get("tips"):
            tips.append(guide_data["tips"])
        if guide_data.get("strengths"):
            tips.extend(guide_data["strengths"][:3])

        return TutorialResponse(
            topic=f"Character Guide: {char_name}",
            content=self._clean_response(response),
            tips=tips,
            related_topics=guide_data.get("best_for", []),
            character_id=character_id,
        )

    async def get_mission_type_guide(
        self,
        mission_type: str,
        language: str = "en",
    ) -> TutorialResponse:
        """
        Get guide for a mission type.

        Args:
            mission_type: Mission type to explain
            language: Response language

        Returns:
            TutorialResponse with mission type guide
        """
        # Search for mission info
        mission_results = self.knowledge_base.search_missions(mission_type, top_k=2)

        # Get tutorial data for missions
        missions_tutorial = self._tutorials_data.get("tutorials", {}).get("mission_types", {})
        mission_details = missions_tutorial.get("mission_type_details", {}).get(mission_type, {})

        context_parts = []
        for r in mission_results:
            context_parts.append(r.document.content)

        prompt = TUTORIAL_MISSION_TYPE_PROMPT.format(
            mission_type=mission_type,
            mission_details=json.dumps(mission_details, indent=2) if mission_details else "No details",
            rag_context="\n".join(context_parts),
            language="Chinese" if language == "zh" else "English",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=350,
            temperature=0.7,
        )

        response = await self._call_llm(messages, config)

        # Best character for this mission
        best_char = mission_details.get("best_character", "")
        tips = []
        if best_char:
            tips.append(f"Best character: {best_char}")
        if mission_details.get("skills_needed"):
            tips.append(f"Skills needed: {mission_details['skills_needed']}")

        return TutorialResponse(
            topic=f"Mission Type: {mission_type}",
            content=self._clean_response(response),
            tips=tips,
            related_topics=[best_char] if best_char else [],
        )

    async def stream_explanation(
        self,
        request: TutorialRequest,
    ) -> AsyncGenerator[str, None]:
        """
        Stream tutorial explanation for real-time display.

        Args:
            request: Tutorial request

        Yields:
            Tutorial tokens as they're generated
        """
        # Get RAG context
        retrieval = self.knowledge_base.retrieve_for_tutorial(
            topic=request.topic,
            character_id=request.character_id,
        )

        tutorial_content = self._get_predefined_tutorial(request)

        prompt = TUTORIAL_EXPLAIN_PROMPT.format(
            topic=request.topic,
            tutorial_type=request.tutorial_type.value if request.tutorial_type else "general",
            rag_context=retrieval.formatted_context,
            predefined_content=tutorial_content or "No predefined tutorial",
            language="Chinese" if request.language == "zh" else "English",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=400,
            temperature=0.7,
        )

        async for token in self._call_llm_stream(messages, config):
            yield token

    def _get_predefined_tutorial(self, request: TutorialRequest) -> Optional[str]:
        """Get predefined tutorial content if available."""
        tutorials = self._tutorials_data.get("tutorials", {})

        # Try to match by tutorial type
        if request.tutorial_type:
            tutorial = tutorials.get(request.tutorial_type.value)
            if tutorial:
                return tutorial.get("content", "")

        # Try to match by topic keywords
        topic_lower = request.topic.lower()
        for tut_id, tut_data in tutorials.items():
            if tut_id in topic_lower or topic_lower in tut_data.get("title", "").lower():
                return tut_data.get("content", "")

        return None

    def _get_tips_for_topic(self, topic: str) -> List[str]:
        """Get tips related to a topic."""
        tips = []
        topic_lower = topic.lower()

        # Check tutorials for tips
        tutorials = self._tutorials_data.get("tutorials", {})
        for tut_data in tutorials.values():
            if any(keyword in topic_lower for keyword in tut_data.get("title", "").lower().split()):
                tips.extend(tut_data.get("tips", [])[:2])

        # Check tips collection
        tips_collection = self._tutorials_data.get("tips_collection", {})
        if "beginner" in topic_lower or "start" in topic_lower:
            tips.extend(tips_collection.get("beginner_tips", [])[:2])
        elif "advanced" in topic_lower:
            tips.extend(tips_collection.get("advanced_tips", [])[:2])
        else:
            tips.extend(tips_collection.get("intermediate_tips", [])[:2])

        return tips[:4]  # Max 4 tips

    def _get_related_topics(self, topic: str) -> List[str]:
        """Get related tutorial topics."""
        related = []
        topic_lower = topic.lower()

        tutorials = self._tutorials_data.get("tutorials", {})
        for tut_id, tut_data in tutorials.items():
            title = tut_data.get("title", "")
            if tut_id not in topic_lower and title.lower() not in topic_lower:
                # Check category match
                if tut_data.get("category") in ["basics", "mechanics"]:
                    related.append(title)

        return related[:3]  # Max 3 related topics

    def _clean_response(self, response: str) -> str:
        """Clean up generated response."""
        response = response.strip()

        # Remove common prefixes
        prefixes = [
            "Here's the tutorial:",
            "Tutorial:",
            "Explanation:",
            "Here's an explanation:",
        ]
        for prefix in prefixes:
            if response.lower().startswith(prefix.lower()):
                response = response[len(prefix):].strip()

        return response


# Singleton instance
_tutorial_agent: Optional[TutorialAgent] = None


def get_tutorial_agent(**kwargs) -> TutorialAgent:
    """Get or create tutorial agent singleton."""
    global _tutorial_agent

    if _tutorial_agent is None:
        from ...config import get_settings
        settings = get_settings()

        _tutorial_agent = TutorialAgent(**kwargs)
        _tutorial_agent.load_data(
            characters_file=settings.game.characters_file,
            tutorials_file=f"{settings.game.knowledge_dir}/tutorials.json",
        )

    return _tutorial_agent
