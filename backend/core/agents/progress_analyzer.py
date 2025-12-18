"""
Progress Analyzer Agent for Super Wings Simulator.
Analyzes player progress and provides personalized recommendations.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from enum import Enum
from dataclasses import dataclass

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, ReasoningMode
from .prompts import (
    PROGRESS_ANALYSIS_SYSTEM,
    PROGRESS_ANALYSIS_PROMPT,
    PROGRESS_RECOMMENDATION_PROMPT,
    PROGRESS_ACHIEVEMENT_PROMPT,
    PROGRESS_MILESTONE_PROMPT,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


class AnalysisType(str, Enum):
    """Types of progress analysis."""
    FULL_ANALYSIS = "full_analysis"
    RECOMMENDATIONS = "recommendations"
    ACHIEVEMENTS = "achievements"
    MILESTONES = "milestones"
    CHARACTER_USAGE = "character_usage"


class PlayerProgress(BaseModel):
    """Player progress data."""
    player_id: str
    missions_completed: int = 0
    missions_failed: int = 0
    total_play_time: int = 0  # minutes
    characters_used: List[str] = []
    characters_unlocked: List[str] = []
    character_levels: Dict[str, int] = {}
    locations_visited: List[str] = []
    achievements_earned: List[str] = []
    mission_types_completed: Dict[str, int] = {}
    total_money_earned: int = 0
    current_money: int = 0
    current_streak: int = 0
    best_streak: int = 0


class ProgressAnalysis(BaseModel):
    """Progress analysis result."""
    summary: str
    strengths: List[str]
    areas_to_improve: List[str]
    next_steps: List[str]
    achievements_close: List[Dict[str, Any]] = []
    current_milestone: Optional[str] = None
    next_milestone: Optional[str] = None
    character_insights: Dict[str, str] = {}


class Recommendation(BaseModel):
    """Personalized recommendation."""
    recommendation_type: str
    title: str
    description: str
    priority: str  # high, medium, low
    related_achievement: Optional[str] = None


class ProgressAnalyzerAgent(BaseAgent):
    """
    Agent for analyzing player progress and providing recommendations.

    Uses chain-of-thought reasoning to analyze player data and
    generate personalized suggestions.
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="progress_analyzer",
            description="Analyzes player progress and provides personalized recommendations",
            reasoning_mode=ReasoningMode.COT,  # Chain-of-thought for analysis
            enable_planning=True,
            **kwargs,
        )
        self._knowledge_base = None
        self._achievements_data = {}
        self._mechanics_data = {}

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    def load_data(
        self,
        achievements_file: str = "./backend/data/knowledge/achievements.json",
        mechanics_file: str = "./backend/data/knowledge/game_mechanics.json",
    ) -> None:
        """Load achievement and mechanics data."""
        from pathlib import Path

        # Load achievements
        ach_path = Path(achievements_file)
        if ach_path.exists():
            with open(ach_path, "r", encoding="utf-8") as f:
                self._achievements_data = json.load(f)
            logger.info("Loaded achievements data for progress analyzer")

        # Load mechanics
        mech_path = Path(mechanics_file)
        if mech_path.exists():
            with open(mech_path, "r", encoding="utf-8") as f:
                self._mechanics_data = json.load(f)
            logger.info("Loaded mechanics data for progress analyzer")

    async def get_system_prompt(self) -> str:
        """Get system prompt for progress analysis."""
        return PROGRESS_ANALYSIS_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute analysis step."""
        if step.action_type == "search":
            # RAG retrieval step
            player_data = context.get("player_data", {})
            retrieval = self.knowledge_base.retrieve_for_progress_analysis(player_data)

            return {
                "step": step.step_number,
                "type": "rag_retrieval",
                "context": retrieval.formatted_context,
                "metadata": retrieval.metadata,
                "success": True,
            }

        elif step.action_type == "generate":
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
            return {
                "step": step.step_number,
                "type": step.action_type,
                "description": step.description,
                "success": True,
            }

    async def analyze_progress(
        self,
        progress: PlayerProgress,
    ) -> ProgressAnalysis:
        """
        Perform full progress analysis.

        Args:
            progress: Player progress data

        Returns:
            ProgressAnalysis with insights and recommendations
        """
        # Get RAG context
        player_data = progress.model_dump()
        retrieval = self.knowledge_base.retrieve_for_progress_analysis(player_data)

        # Calculate derived stats
        stats = self._calculate_stats(progress)

        # Find close achievements
        close_achievements = self._find_close_achievements(progress)

        # Determine milestone status
        current_milestone, next_milestone = self._get_milestone_status(progress)

        # Build analysis prompt
        prompt = PROGRESS_ANALYSIS_PROMPT.format(
            missions_completed=progress.missions_completed,
            missions_failed=progress.missions_failed,
            characters_used=", ".join(progress.characters_used) or "None yet",
            characters_unlocked=", ".join(progress.characters_unlocked) or "jett",
            character_levels=json.dumps(progress.character_levels),
            locations_visited=", ".join(progress.locations_visited) or "None yet",
            achievements_earned=len(progress.achievements_earned),
            mission_types=json.dumps(progress.mission_types_completed),
            success_rate=stats["success_rate"],
            favorite_character=stats["favorite_character"],
            rag_context=retrieval.formatted_context,
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=600,
            temperature=0.7,
        )

        response = await self._call_llm(messages, config)

        # Parse analysis
        analysis = self._parse_analysis_response(response)

        # Add computed fields
        analysis.achievements_close = close_achievements
        analysis.current_milestone = current_milestone
        analysis.next_milestone = next_milestone
        analysis.character_insights = self._get_character_insights(progress)

        return analysis

    async def get_recommendations(
        self,
        progress: PlayerProgress,
        count: int = 3,
    ) -> List[Recommendation]:
        """
        Get personalized recommendations.

        Args:
            progress: Player progress data
            count: Number of recommendations

        Returns:
            List of recommendations
        """
        player_data = progress.model_dump()
        retrieval = self.knowledge_base.retrieve_for_progress_analysis(player_data)

        stats = self._calculate_stats(progress)

        prompt = PROGRESS_RECOMMENDATION_PROMPT.format(
            missions_completed=progress.missions_completed,
            characters_used=len(progress.characters_used),
            characters_unlocked=len(progress.characters_unlocked),
            locations_visited=len(progress.locations_visited),
            favorite_character=stats["favorite_character"],
            least_used_characters=", ".join(stats["least_used"]),
            unvisited_locations=", ".join(stats["unvisited_locations"]),
            rag_context=retrieval.formatted_context,
            count=count,
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=400,
            temperature=0.8,
        )

        response = await self._call_llm(messages, config)

        return self._parse_recommendations(response, count)

    async def check_achievements(
        self,
        progress: PlayerProgress,
    ) -> Dict[str, Any]:
        """
        Check achievement status and near-completion.

        Args:
            progress: Player progress data

        Returns:
            Achievement status report
        """
        earned = progress.achievements_earned
        close = self._find_close_achievements(progress)
        total = len(self._achievements_data.get("achievements", {}))

        prompt = PROGRESS_ACHIEVEMENT_PROMPT.format(
            earned_count=len(earned),
            total_count=total,
            earned_achievements=", ".join(earned) or "None yet",
            close_achievements=json.dumps(close, indent=2),
            missions_completed=progress.missions_completed,
            characters_used=len(progress.characters_used),
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

        return {
            "earned_count": len(earned),
            "total_count": total,
            "completion_percentage": round(len(earned) / total * 100, 1) if total > 0 else 0,
            "close_to_earning": close,
            "analysis": self._clean_response(response),
        }

    async def get_milestone_status(
        self,
        progress: PlayerProgress,
    ) -> Dict[str, Any]:
        """
        Get detailed milestone status.

        Args:
            progress: Player progress data

        Returns:
            Milestone status report
        """
        current, next_ms = self._get_milestone_status(progress)

        milestones = self._achievements_data.get("milestones", {})
        current_data = milestones.get(current, {}) if current else {}
        next_data = milestones.get(next_ms, {}) if next_ms else {}

        prompt = PROGRESS_MILESTONE_PROMPT.format(
            current_milestone=current or "None",
            current_description=current_data.get("description", ""),
            next_milestone=next_ms or "All completed!",
            next_requirement=next_data.get("requirement", ""),
            missions_completed=progress.missions_completed,
            achievements_earned=len(progress.achievements_earned),
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        response = await self._call_llm(messages)

        return {
            "current_milestone": {
                "id": current,
                "name": current_data.get("name", ""),
                "description": current_data.get("description", ""),
            } if current else None,
            "next_milestone": {
                "id": next_ms,
                "name": next_data.get("name", ""),
                "requirement": next_data.get("requirement", ""),
            } if next_ms else None,
            "analysis": self._clean_response(response),
        }

    async def stream_analysis(
        self,
        progress: PlayerProgress,
    ) -> AsyncGenerator[str, None]:
        """
        Stream progress analysis for real-time display.

        Args:
            progress: Player progress data

        Yields:
            Analysis tokens as they're generated
        """
        player_data = progress.model_dump()
        retrieval = self.knowledge_base.retrieve_for_progress_analysis(player_data)
        stats = self._calculate_stats(progress)

        prompt = PROGRESS_ANALYSIS_PROMPT.format(
            missions_completed=progress.missions_completed,
            missions_failed=progress.missions_failed,
            characters_used=", ".join(progress.characters_used) or "None yet",
            characters_unlocked=", ".join(progress.characters_unlocked) or "jett",
            character_levels=json.dumps(progress.character_levels),
            locations_visited=", ".join(progress.locations_visited) or "None yet",
            achievements_earned=len(progress.achievements_earned),
            mission_types=json.dumps(progress.mission_types_completed),
            success_rate=stats["success_rate"],
            favorite_character=stats["favorite_character"],
            rag_context=retrieval.formatted_context,
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=600,
            temperature=0.7,
        )

        async for token in self._call_llm_stream(messages, config):
            yield token

    def _calculate_stats(self, progress: PlayerProgress) -> Dict[str, Any]:
        """Calculate derived statistics from progress."""
        total_missions = progress.missions_completed + progress.missions_failed
        success_rate = (
            round(progress.missions_completed / total_missions * 100, 1)
            if total_missions > 0 else 0
        )

        # Find favorite character (most used)
        char_usage = {}
        for char in progress.characters_used:
            char_usage[char] = char_usage.get(char, 0) + 1
        favorite = max(char_usage.keys(), key=lambda x: char_usage[x]) if char_usage else "jett"

        # Find least used characters
        all_chars = ["jett", "flip", "donnie", "todd", "paul", "bello", "jerome", "chase"]
        used_set = set(progress.characters_used)
        least_used = [c for c in all_chars if c not in used_set][:3]

        # Find unvisited locations
        all_locations = [
            "paris_france", "tokyo_japan", "new_york_usa", "sydney_australia",
            "cairo_egypt", "rio_brazil", "beijing_china", "london_uk",
            "mumbai_india", "arctic_region", "amazon_rainforest"
        ]
        visited_set = set(progress.locations_visited)
        unvisited = [loc for loc in all_locations if loc not in visited_set][:3]

        return {
            "success_rate": success_rate,
            "favorite_character": favorite,
            "least_used": least_used,
            "unvisited_locations": unvisited,
            "total_missions": total_missions,
        }

    def _find_close_achievements(self, progress: PlayerProgress) -> List[Dict[str, Any]]:
        """Find achievements the player is close to earning."""
        close = []
        achievements = self._achievements_data.get("achievements", {})

        for ach_id, ach_data in achievements.items():
            if ach_id in progress.achievements_earned:
                continue

            condition = ach_data.get("condition", {})
            cond_type = condition.get("type", "")
            required = condition.get("count", 0)

            current = 0
            if cond_type == "missions_completed":
                current = progress.missions_completed
            elif cond_type == "unique_characters_used":
                current = len(set(progress.characters_used))
            elif cond_type == "unique_locations":
                current = len(set(progress.locations_visited))
            elif cond_type == "mission_type_completed":
                mission_type = condition.get("mission_type", "")
                current = progress.mission_types_completed.get(mission_type, 0)

            if required > 0 and current >= required * 0.7:  # 70% progress
                progress_pct = min(100, round(current / required * 100))
                close.append({
                    "id": ach_id,
                    "name": ach_data.get("name", ach_id),
                    "description": ach_data.get("description", ""),
                    "progress": progress_pct,
                    "current": current,
                    "required": required,
                })

        # Sort by progress percentage
        close.sort(key=lambda x: x["progress"], reverse=True)
        return close[:5]  # Top 5 closest

    def _get_milestone_status(self, progress: PlayerProgress) -> tuple:
        """Get current and next milestone."""
        milestones = self._achievements_data.get("milestones", {})
        missions = progress.missions_completed
        achievements = len(progress.achievements_earned)

        current = None
        next_ms = None

        # Simple milestone progression based on missions
        if missions >= 100 and achievements >= 15:
            current = "master"
        elif missions >= 100:
            current = "expert"
            next_ms = "master"
        elif missions >= 50:
            current = "advanced"
            next_ms = "expert"
        elif missions >= 20:
            current = "intermediate"
            next_ms = "advanced"
        elif missions >= 1:
            current = "beginner"
            next_ms = "intermediate"
        else:
            next_ms = "beginner"

        return current, next_ms

    def _get_character_insights(self, progress: PlayerProgress) -> Dict[str, str]:
        """Generate insights about character usage."""
        insights = {}

        for char_id, level in progress.character_levels.items():
            if level >= 5:
                insights[char_id] = f"Level {level} - Expert! Consider trying harder missions."
            elif level >= 3:
                insights[char_id] = f"Level {level} - Making good progress!"
            else:
                insights[char_id] = f"Level {level} - Keep using to level up."

        return insights

    def _parse_analysis_response(self, response: str) -> ProgressAnalysis:
        """Parse LLM response into ProgressAnalysis."""
        # Try to extract structured data
        try:
            data = self._parse_json_response(response)
            return ProgressAnalysis(
                summary=data.get("summary", response[:200]),
                strengths=data.get("strengths", []),
                areas_to_improve=data.get("areas_to_improve", []),
                next_steps=data.get("next_steps", []),
            )
        except Exception:
            # Return basic analysis
            return ProgressAnalysis(
                summary=self._clean_response(response)[:500],
                strengths=["Making progress!"],
                areas_to_improve=["Keep playing to improve"],
                next_steps=["Complete more missions"],
            )

    def _parse_recommendations(self, response: str, count: int) -> List[Recommendation]:
        """Parse recommendations from LLM response."""
        try:
            data = self._parse_json_response(response)
            if isinstance(data, list):
                return [
                    Recommendation(
                        recommendation_type=r.get("type", "general"),
                        title=r.get("title", "Try something new"),
                        description=r.get("description", ""),
                        priority=r.get("priority", "medium"),
                        related_achievement=r.get("achievement"),
                    )
                    for r in data[:count]
                ]
        except Exception:
            pass

        # Return default recommendation
        return [
            Recommendation(
                recommendation_type="general",
                title="Keep Playing",
                description=self._clean_response(response)[:200],
                priority="medium",
            )
        ]

    def _clean_response(self, response: str) -> str:
        """Clean up generated response."""
        response = response.strip()
        prefixes = ["Analysis:", "Here's the analysis:", "Summary:"]
        for prefix in prefixes:
            if response.lower().startswith(prefix.lower()):
                response = response[len(prefix):].strip()
        return response


# Singleton instance
_progress_agent: Optional[ProgressAnalyzerAgent] = None


def get_progress_agent(**kwargs) -> ProgressAnalyzerAgent:
    """Get or create progress analyzer agent singleton."""
    global _progress_agent

    if _progress_agent is None:
        from ...config import get_settings
        settings = get_settings()

        _progress_agent = ProgressAnalyzerAgent(**kwargs)
        _progress_agent.load_data(
            achievements_file=f"{settings.game.knowledge_dir}/achievements.json",
            mechanics_file=f"{settings.game.knowledge_dir}/game_mechanics.json",
        )

    return _progress_agent
