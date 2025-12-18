"""
Mission Dispatcher Agent for Super Wings Simulator.
Analyzes missions and recommends the best character for dispatch.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, AgentResponse, ReasoningMode
from .prompts import (
    MISSION_DISPATCH_SYSTEM,
    MISSION_DISPATCH_PROMPT,
    MISSION_DISPATCH_EXPLAIN,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base, RetrievalContext

logger = logging.getLogger(__name__)


class DispatchRecommendation(BaseModel):
    """Dispatch recommendation result."""
    recommended_character: str
    confidence: float
    reasoning: str
    alternative: Optional[str] = None
    mission_tips: List[str] = []
    explanation: Optional[str] = None  # Child-friendly explanation


class MissionRequest(BaseModel):
    """Mission dispatch request."""
    mission_type: str
    location: str
    problem_description: str
    urgency: str = "normal"  # low, normal, high, urgent
    available_characters: Optional[List[str]] = None


@dataclass
class CharacterProfile:
    """Character profile for dispatch decisions."""
    id: str
    name: str
    name_zh: str
    role: str
    specialization: str
    abilities: List[str]
    personality: str


class MissionDispatcherAgent(BaseAgent):
    """
    Agent for intelligent mission dispatch decisions.

    Uses RAG to retrieve relevant character and mission information,
    then reasons about the best character to dispatch.
    """

    def __init__(
        self,
        characters_data: Optional[Dict[str, Any]] = None,
        **kwargs,
    ):
        super().__init__(
            name="mission_dispatcher",
            description="Analyzes missions and recommends the best Super Wings character",
            reasoning_mode=ReasoningMode.REACT,
            enable_planning=True,
            **kwargs,
        )

        self._characters_data = characters_data or {}
        self._knowledge_base = None

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    def load_characters(self, characters_file: str = "./data/characters.json") -> None:
        """Load character data from file."""
        import json
        from pathlib import Path

        path = Path(characters_file)
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self._characters_data = data.get("characters", {})
            logger.info(f"Loaded {len(self._characters_data)} characters")
        else:
            logger.warning(f"Characters file not found: {characters_file}")

    def get_character_profiles(
        self,
        character_ids: Optional[List[str]] = None,
    ) -> List[CharacterProfile]:
        """Get character profiles for dispatch consideration."""
        profiles = []

        chars_to_process = character_ids or list(self._characters_data.keys())

        for char_id in chars_to_process:
            if char_id not in self._characters_data:
                continue

            char = self._characters_data[char_id]
            profiles.append(CharacterProfile(
                id=char_id,
                name=char.get("name", char_id),
                name_zh=char.get("name_zh", ""),
                role=char.get("role", ""),
                specialization=char.get("stats", {}).get("specialization", ""),
                abilities=char.get("abilities", []),
                personality=char.get("personality", ""),
            ))

        return profiles

    def format_characters_for_prompt(
        self,
        profiles: List[CharacterProfile],
    ) -> str:
        """Format character profiles for LLM prompt."""
        lines = []
        for p in profiles:
            lines.append(f"- {p.name} ({p.id})")
            lines.append(f"  Role: {p.role}")
            lines.append(f"  Specialization: {p.specialization}")
            lines.append(f"  Abilities: {', '.join(p.abilities)}")
            lines.append(f"  Personality: {p.personality}")
            lines.append("")
        return "\n".join(lines)

    async def get_system_prompt(self) -> str:
        """Get system prompt for dispatch agent."""
        return MISSION_DISPATCH_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute a dispatch decision step."""
        if step.action_type == "search":
            # RAG retrieval step
            query = context.get("problem_description", "")
            location = context.get("location")

            retrieval = self.knowledge_base.retrieve_for_dispatch(
                mission_description=query,
                location=location,
            )

            return {
                "step": step.step_number,
                "type": "rag_retrieval",
                "context": retrieval.formatted_context,
                "metadata": retrieval.metadata,
                "success": True,
            }

        elif step.action_type == "generate":
            # LLM generation step
            messages = [
                ChatMessage.system(await self.get_system_prompt()),
                ChatMessage.user(context.get("prompt", step.description)),
            ]

            response = await self._call_llm(messages)

            return {
                "step": step.step_number,
                "type": "llm_response",
                "output": response,
                "success": True,
            }

        else:
            # Default execution
            return {
                "step": step.step_number,
                "type": step.action_type,
                "description": step.description,
                "success": True,
            }

    async def recommend_dispatch(
        self,
        request: MissionRequest,
    ) -> DispatchRecommendation:
        """
        Recommend the best character for a mission.

        Args:
            request: Mission request details

        Returns:
            DispatchRecommendation with recommended character and reasoning
        """
        # Get character profiles
        profiles = self.get_character_profiles(request.available_characters)

        if not profiles:
            logger.error("No characters available for dispatch")
            return DispatchRecommendation(
                recommended_character="jett",  # Default fallback
                confidence=0.5,
                reasoning="No character data available, defaulting to Jett as main protagonist",
            )

        # Retrieve relevant knowledge
        retrieval_context = self.knowledge_base.retrieve_for_dispatch(
            mission_description=request.problem_description,
            location=request.location,
        )

        # Build dispatch prompt
        dispatch_prompt = MISSION_DISPATCH_PROMPT.format(
            mission_type=request.mission_type,
            location=request.location,
            problem_description=request.problem_description,
            urgency=request.urgency,
            rag_context=retrieval_context.formatted_context,
            available_characters=self.format_characters_for_prompt(profiles),
        )

        # Call LLM for recommendation
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(dispatch_prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=512,
            temperature=0.7,
        )

        response = await self._call_llm(messages, config)

        # Parse recommendation
        try:
            rec_data = self._parse_json_response(response)

            recommendation = DispatchRecommendation(
                recommended_character=rec_data.get("recommended_character", "jett"),
                confidence=float(rec_data.get("confidence", 0.8)),
                reasoning=rec_data.get("reasoning", ""),
                alternative=rec_data.get("alternative"),
                mission_tips=rec_data.get("mission_tips", []),
            )

            # Generate child-friendly explanation
            explanation = await self._generate_explanation(
                recommendation,
                request,
                profiles,
            )
            recommendation.explanation = explanation

            return recommendation

        except Exception as e:
            logger.error(f"Failed to parse dispatch recommendation: {e}")
            # Return fallback recommendation
            return DispatchRecommendation(
                recommended_character="jett",
                confidence=0.6,
                reasoning=f"Analysis inconclusive, recommending Jett as versatile main character. Raw response: {response[:200]}",
            )

    async def _generate_explanation(
        self,
        recommendation: DispatchRecommendation,
        request: MissionRequest,
        profiles: List[CharacterProfile],
    ) -> str:
        """Generate child-friendly explanation for the dispatch decision."""
        # Find character name
        char_name = recommendation.recommended_character
        for p in profiles:
            if p.id == recommendation.recommended_character:
                char_name = p.name
                break

        explain_prompt = MISSION_DISPATCH_EXPLAIN.format(
            character_name=char_name,
            mission_type=request.mission_type,
            location=request.location,
            reasoning=recommendation.reasoning,
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(explain_prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=150,
            temperature=0.8,
        )

        explanation = await self._call_llm(messages, config)
        return explanation.strip()

    async def explain_character_match(
        self,
        character_id: str,
        mission_type: str,
    ) -> str:
        """
        Explain why a specific character is good (or not) for a mission type.

        Args:
            character_id: Character to evaluate
            mission_type: Type of mission

        Returns:
            Explanation string
        """
        profiles = self.get_character_profiles([character_id])

        if not profiles:
            return f"Character '{character_id}' not found."

        profile = profiles[0]

        prompt = f"""Evaluate how well {profile.name} would handle a {mission_type} mission.

Character Profile:
- Specialization: {profile.specialization}
- Abilities: {', '.join(profile.abilities)}
- Personality: {profile.personality}

Provide a brief assessment (2-3 sentences) of:
1. How well-suited they are for this mission type
2. Their key strength for this situation
3. Any potential challenges they might face"""

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        response = await self._call_llm(messages)
        return response

    async def get_best_for_mission_type(
        self,
        mission_type: str,
        top_k: int = 3,
        available_characters: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get the top characters for a specific mission type.

        Args:
            mission_type: Type of mission
            top_k: Number of top characters to return
            available_characters: Optional list of character IDs to filter by

        Returns:
            List of character recommendations with scores
        """
        profiles = self.get_character_profiles()

        # Filter by available characters if specified
        if available_characters:
            # Fix: profiles is a list, not a dict
            profiles = [
                profile
                for profile in profiles
                if profile.id in available_characters
            ]

        if not profiles:
            return []

        prompt = f"""Rank the following Super Wings characters for a {mission_type} mission.

Characters:
{self.format_characters_for_prompt(profiles)}

Return a JSON array ranking the top {top_k} characters:
```json
[
    {{"character_id": "id", "score": 0.0-1.0, "reason": "brief reason"}}
]
```"""

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        response = await self._call_llm(messages)

        try:
            rankings = self._parse_json_response(response)
            if isinstance(rankings, list):
                return rankings[:top_k]
        except:
            pass

        return []


# Singleton instance
_dispatcher_agent: Optional[MissionDispatcherAgent] = None


def get_dispatcher_agent(**kwargs) -> MissionDispatcherAgent:
    """Get or create dispatcher agent singleton."""
    global _dispatcher_agent

    if _dispatcher_agent is None:
        from ...config import get_settings
        settings = get_settings()

        _dispatcher_agent = MissionDispatcherAgent(**kwargs)
        _dispatcher_agent.load_characters(settings.game.characters_file)

    return _dispatcher_agent
