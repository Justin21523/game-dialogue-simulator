"""
Event Generator Agent for Super Wings Simulator.
Generates dynamic random events during missions.
"""

import json
import logging
import random
from typing import Any, Dict, List, Optional
from enum import Enum
from dataclasses import dataclass

from pydantic import BaseModel

from .base_agent import BaseAgent, PlanStep, ReasoningMode
from .prompts import (
    EVENT_GENERATION_SYSTEM,
    EVENT_GENERATION_PROMPT,
    EVENT_WEATHER_PROMPT,
    EVENT_ENCOUNTER_PROMPT,
)
from ..llm import ChatMessage, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """Types of dynamic events."""
    WEATHER = "weather"
    ENCOUNTER = "encounter"
    OBSTACLE = "obstacle"
    BONUS = "bonus"
    CHALLENGE = "challenge"
    DISCOVERY = "discovery"
    HELP_REQUEST = "help_request"


class EventDifficulty(str, Enum):
    """Event difficulty levels."""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class EventChoice(BaseModel):
    """A choice option for an event."""
    option: str
    outcome: str
    success_rate: float = 0.8


class GameEvent(BaseModel):
    """Generated game event."""
    event_id: str
    event_type: EventType
    event_name: str
    description: str
    challenge: str
    choices: List[EventChoice]
    difficulty: EventDifficulty
    related_ability: Optional[str] = None
    location: Optional[str] = None
    rewards: Optional[Dict[str, Any]] = None

    class Config:
        use_enum_values = True


class EventRequest(BaseModel):
    """Request for event generation."""
    character_id: str
    location: str
    mission_phase: str
    mission_type: str
    original_problem: str
    event_type: Optional[EventType] = None
    exclude_types: Optional[List[EventType]] = None


# Pre-defined event templates for quick generation
EVENT_TEMPLATES = {
    EventType.WEATHER: [
        {
            "event_name": "Sudden Storm",
            "description": "Dark clouds gather quickly and rain starts pouring down!",
            "challenge": "Find shelter or continue through the rain",
            "choices": [
                {"option": "Find shelter and wait", "outcome": "Safe but delayed"},
                {"option": "Continue carefully", "outcome": "Get wet but make progress"},
            ],
            "difficulty": "medium",
        },
        {
            "event_name": "Strong Winds",
            "description": "The wind picks up strongly, making it hard to fly straight!",
            "challenge": "Navigate through the gusty winds",
            "choices": [
                {"option": "Fly low to avoid wind", "outcome": "Slower but safer"},
                {"option": "Power through", "outcome": "Faster but bumpy"},
            ],
            "difficulty": "easy",
        },
        {
            "event_name": "Foggy Conditions",
            "description": "A thick fog rolls in, making it hard to see!",
            "challenge": "Navigate through low visibility",
            "choices": [
                {"option": "Use instruments carefully", "outcome": "Slow and steady"},
                {"option": "Fly above the fog", "outcome": "Clear view but higher altitude"},
            ],
            "difficulty": "medium",
        },
    ],
    EventType.ENCOUNTER: [
        {
            "event_name": "Friendly Bird",
            "description": "A colorful bird flies alongside and seems to want to guide you somewhere!",
            "challenge": "Decide whether to follow the bird",
            "choices": [
                {"option": "Follow the bird", "outcome": "Discover a shortcut"},
                {"option": "Stay on course", "outcome": "Continue as planned"},
            ],
            "difficulty": "easy",
        },
        {
            "event_name": "Lost Balloon",
            "description": "You spot a child's balloon floating away! A kid below looks sad.",
            "challenge": "Help retrieve the balloon",
            "choices": [
                {"option": "Catch the balloon", "outcome": "Make a child happy"},
                {"option": "Wave and continue", "outcome": "Focus on main mission"},
            ],
            "difficulty": "easy",
        },
        {
            "event_name": "Fellow Traveler",
            "description": "Another friendly plane waves hello and offers to fly together!",
            "challenge": "Accept the company or continue alone",
            "choices": [
                {"option": "Fly together", "outcome": "Fun company, might learn something"},
                {"option": "Wave and continue", "outcome": "Focus on mission"},
            ],
            "difficulty": "easy",
        },
    ],
    EventType.OBSTACLE: [
        {
            "event_name": "Flock of Birds",
            "description": "A large flock of migrating birds is crossing your path!",
            "challenge": "Navigate safely around the birds",
            "choices": [
                {"option": "Go around them", "outcome": "Longer route but safe"},
                {"option": "Fly above them", "outcome": "Quick but needs altitude"},
            ],
            "difficulty": "medium",
        },
        {
            "event_name": "Unexpected Construction",
            "description": "There's construction work blocking the usual landing area!",
            "challenge": "Find an alternative landing spot",
            "choices": [
                {"option": "Find another spot nearby", "outcome": "Walk a bit further"},
                {"option": "Ask for help clearing space", "outcome": "Wait for assistance"},
            ],
            "difficulty": "medium",
        },
    ],
    EventType.BONUS: [
        {
            "event_name": "Rainbow Appearance",
            "description": "A beautiful rainbow appears across the sky!",
            "challenge": "Enjoy the moment",
            "choices": [
                {"option": "Fly through it", "outcome": "Magical experience!"},
                {"option": "Take a photo", "outcome": "Capture the memory"},
            ],
            "difficulty": "easy",
        },
        {
            "event_name": "Tailwind Boost",
            "description": "A strong tailwind appears, pushing you forward faster!",
            "challenge": "Enjoy the speed boost",
            "choices": [
                {"option": "Ride the wind", "outcome": "Arrive faster!"},
                {"option": "Maintain normal speed", "outcome": "Steady journey"},
            ],
            "difficulty": "easy",
        },
    ],
    EventType.HELP_REQUEST: [
        {
            "event_name": "Stranded Hiker",
            "description": "Someone below is waving for help! They seem to need directions.",
            "challenge": "Decide whether to help",
            "choices": [
                {"option": "Land and help", "outcome": "Help someone in need"},
                {"option": "Drop a map", "outcome": "Quick help from above"},
            ],
            "difficulty": "easy",
        },
        {
            "event_name": "Broken Vehicle",
            "description": "A car below has broken down and the driver looks worried!",
            "challenge": "Assist or continue",
            "choices": [
                {"option": "Stop to help", "outcome": "Fix or call for help"},
                {"option": "Radio for assistance", "outcome": "Alert help while continuing"},
            ],
            "difficulty": "medium",
        },
    ],
}


class EventGeneratorAgent(BaseAgent):
    """
    Agent for generating dynamic events during missions.

    Creates contextual events based on location, mission type,
    and character abilities.
    """

    def __init__(self, **kwargs):
        super().__init__(
            name="event_generator",
            description="Generates dynamic events for Super Wings missions",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
            **kwargs,
        )
        self._knowledge_base = None
        self._event_counter = 0

    @property
    def knowledge_base(self):
        """Lazy load knowledge base."""
        if self._knowledge_base is None:
            self._knowledge_base = get_knowledge_base()
        return self._knowledge_base

    async def get_system_prompt(self) -> str:
        """Get system prompt for event generation."""
        return EVENT_GENERATION_SYSTEM

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute event generation step."""
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(context.get("prompt", step.description)),
        ]

        response = await self._call_llm(messages)

        return {
            "step": step.step_number,
            "type": "event",
            "output": response,
            "success": True,
        }

    def _generate_event_id(self) -> str:
        """Generate unique event ID."""
        self._event_counter += 1
        return f"event_{self._event_counter}"

    def generate_template_event(
        self,
        request: EventRequest,
    ) -> GameEvent:
        """
        Generate event from templates (fast, no LLM).

        Args:
            request: Event generation request

        Returns:
            Generated GameEvent
        """
        # Select event type
        if request.event_type:
            event_type = request.event_type
        else:
            # Exclude specified types
            available_types = list(EventType)
            if request.exclude_types:
                available_types = [t for t in available_types if t not in request.exclude_types]
            event_type = random.choice(available_types)

        # Get templates for this type
        templates = EVENT_TEMPLATES.get(event_type, EVENT_TEMPLATES[EventType.ENCOUNTER])
        template = random.choice(templates)

        # Create event
        choices = [
            EventChoice(
                option=c["option"],
                outcome=c["outcome"],
                success_rate=0.8 if template["difficulty"] == "easy" else 0.6,
            )
            for c in template["choices"]
        ]

        return GameEvent(
            event_id=self._generate_event_id(),
            event_type=event_type,
            event_name=template["event_name"],
            description=template["description"],
            challenge=template["challenge"],
            choices=choices,
            difficulty=EventDifficulty(template["difficulty"]),
            location=request.location,
        )

    async def generate_event(
        self,
        request: EventRequest,
        use_llm: bool = True,
    ) -> GameEvent:
        """
        Generate a dynamic event using LLM or templates.

        Args:
            request: Event generation request
            use_llm: Whether to use LLM for generation

        Returns:
            Generated GameEvent
        """
        if not use_llm:
            return self.generate_template_event(request)

        # Get RAG context
        retrieval = self.knowledge_base.retrieve_for_event(
            location=request.location,
            mission_type=request.mission_type,
            character_id=request.character_id,
        )

        # Determine event type
        event_type = request.event_type or random.choice(list(EventType))

        # Build prompt
        prompt = EVENT_GENERATION_PROMPT.format(
            character_name=request.character_id,
            location=request.location,
            mission_phase=request.mission_phase,
            original_problem=request.original_problem,
            event_type=event_type.value,
        )

        # Add RAG context
        if retrieval.formatted_context:
            prompt = f"{prompt}\n\n## Context\n{retrieval.formatted_context}"

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        config = GenerationConfig(
            max_new_tokens=400,
            temperature=0.9,  # More creative for events
        )

        response = await self._call_llm(messages, config)

        # Parse response
        try:
            event_data = self._parse_json_response(response)

            choices = [
                EventChoice(
                    option=c.get("option", "Continue"),
                    outcome=c.get("outcome", "Proceed normally"),
                )
                for c in event_data.get("choices", [])
            ]

            if not choices:
                choices = [
                    EventChoice(option="Continue", outcome="Proceed with mission"),
                    EventChoice(option="Investigate", outcome="Learn more"),
                ]

            return GameEvent(
                event_id=self._generate_event_id(),
                event_type=event_type,
                event_name=event_data.get("event_name", "Unexpected Event"),
                description=event_data.get("description", "Something interesting happens!"),
                challenge=event_data.get("challenge", "Decide what to do"),
                choices=choices,
                difficulty=EventDifficulty(event_data.get("difficulty", "medium")),
                related_ability=event_data.get("related_ability"),
                location=request.location,
            )

        except Exception as e:
            logger.warning(f"Failed to parse LLM event, using template: {e}")
            return self.generate_template_event(request)

    async def generate_weather_event(
        self,
        location: str,
        current_weather: str = "clear",
        character_id: str = "jett",
    ) -> GameEvent:
        """Generate a weather-specific event."""
        # Get character abilities
        char_doc = self.knowledge_base._character_store.get_document(f"char_{character_id}")
        abilities = []
        if char_doc:
            abilities = char_doc.metadata.get("abilities", [])

        prompt = EVENT_WEATHER_PROMPT.format(
            location=location,
            season="current",
            current_weather=current_weather,
            character_name=character_id,
            abilities=", ".join(abilities) if abilities else "flight",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        response = await self._call_llm(messages)

        return GameEvent(
            event_id=self._generate_event_id(),
            event_type=EventType.WEATHER,
            event_name="Weather Change",
            description=response.strip(),
            challenge="Navigate the weather",
            choices=[
                EventChoice(option="Continue carefully", outcome="Slower but safe"),
                EventChoice(option="Find alternate route", outcome="Longer but clear"),
            ],
            difficulty=EventDifficulty.MEDIUM,
            location=location,
        )

    async def generate_encounter_event(
        self,
        location: str,
        mission_context: str,
    ) -> GameEvent:
        """Generate a friendly encounter event."""
        # Get location info
        loc_results = self.knowledge_base.search_locations(location, top_k=1)
        location_desc = ""
        if loc_results:
            location_desc = loc_results[0].document.content

        prompt = EVENT_ENCOUNTER_PROMPT.format(
            location=location,
            location_description=location_desc,
            mission_context=mission_context,
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(prompt),
        ]

        response = await self._call_llm(messages)

        return GameEvent(
            event_id=self._generate_event_id(),
            event_type=EventType.ENCOUNTER,
            event_name="Friendly Encounter",
            description=response.strip(),
            challenge="Interact or continue",
            choices=[
                EventChoice(option="Say hello", outcome="Make a new friend"),
                EventChoice(option="Wave and continue", outcome="Keep focused"),
            ],
            difficulty=EventDifficulty.EASY,
            location=location,
        )

    def resolve_event_choice(
        self,
        event: GameEvent,
        choice_index: int,
    ) -> Dict[str, Any]:
        """
        Resolve an event choice and determine outcome.

        Args:
            event: The event being resolved
            choice_index: Index of chosen option

        Returns:
            Resolution result
        """
        if choice_index < 0 or choice_index >= len(event.choices):
            choice_index = 0

        choice = event.choices[choice_index]

        # Determine success based on difficulty
        success_modifier = {
            EventDifficulty.EASY: 0.9,
            EventDifficulty.MEDIUM: 0.75,
            EventDifficulty.HARD: 0.6,
        }

        success_rate = choice.success_rate * success_modifier.get(event.difficulty, 0.75)
        success = random.random() < success_rate

        return {
            "event_id": event.event_id,
            "choice_made": choice.option,
            "success": success,
            "outcome": choice.outcome if success else f"Struggled with: {choice.outcome}",
            "rewards": event.rewards if success else None,
        }


# Singleton instance
_event_generator: Optional[EventGeneratorAgent] = None


def get_event_generator(**kwargs) -> EventGeneratorAgent:
    """Get or create event generator agent singleton."""
    global _event_generator

    if _event_generator is None:
        _event_generator = EventGeneratorAgent(**kwargs)

    return _event_generator
