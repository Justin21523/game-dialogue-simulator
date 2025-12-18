"""
NPC Generator Agent for Super Wings Simulator.
Generates diverse NPCs with unique personalities, appearances, and dialogue styles.
"""

import logging
import random
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class GeneratedNPC:
    """Data class for a generated NPC."""
    npc_id: str
    name: str
    role: str  # 'shopkeeper', 'citizen', 'child', 'elder', 'official', 'merchant'
    personality: str  # 'friendly', 'grumpy', 'shy', 'energetic', 'wise', 'mysterious'
    appearance: Dict[str, Any]  # 外觀描述
    dialogue_style: str  # 對話風格
    location_type: str  # 'outdoor', 'shop', 'cafe', 'library', etc.
    has_quest: bool  # 是否有任務
    quest_hint: Optional[str] = None  # 任務提示


class NPCGenerator:
    """
    Generator responsible for creating diverse NPCs for exploration mode.
    """

    # NPC 角色類型
    NPC_ROLES = [
        'shopkeeper', 'citizen', 'child', 'elder',
        'official', 'merchant', 'artist', 'teacher',
        'doctor', 'librarian', 'chef', 'musician'
    ]

    # 性格類型
    PERSONALITIES = [
        'friendly', 'grumpy', 'shy', 'energetic',
        'wise', 'mysterious', 'cheerful', 'serious',
        'playful', 'calm', 'nervous', 'confident'
    ]

    # 對話風格
    DIALOGUE_STYLES = [
        'casual', 'formal', 'enthusiastic', 'reserved',
        'poetic', 'direct', 'humorous', 'philosophical'
    ]

    # 名字池（按地區）
    NAME_POOLS = {
        'paris': {
            'male': ['Pierre', 'Jean', 'Marcel', 'Henri', 'Louis', 'Antoine', 'François'],
            'female': ['Sophie', 'Marie', 'Camille', 'Claire', 'Amélie', 'Juliette', 'Élise']
        },
        'tokyo': {
            'male': ['Hiroshi', 'Kenji', 'Takeshi', 'Yuki', 'Ryu', 'Akira', 'Satoshi'],
            'female': ['Sakura', 'Yui', 'Hana', 'Mei', 'Aiko', 'Rina', 'Haruka']
        },
        'london': {
            'male': ['Oliver', 'George', 'Harry', 'Jack', 'Thomas', 'William', 'James'],
            'female': ['Emily', 'Lucy', 'Olivia', 'Charlotte', 'Grace', 'Lily', 'Sophie']
        },
        'default': {
            'male': ['Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Morgan', 'Riley'],
            'female': ['Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Morgan', 'Riley']
        }
    }

    def __init__(self):
        self.generated_npcs: List[GeneratedNPC] = []
        self.llm = None  # Will be initialized when needed

    async def generate_npc(
        self,
        location: str = 'paris',
        location_type: str = 'outdoor',
        role: Optional[str] = None,
        count: int = 1
    ) -> List[GeneratedNPC]:
        """
        Generate one or more NPCs for a specific location.

        Args:
            location: Location name (e.g., 'paris', 'tokyo')
            location_type: Type of location ('outdoor', 'shop', 'cafe', etc.)
            role: Specific role (optional, random if None)
            count: Number of NPCs to generate

        Returns:
            List of generated NPCs
        """
        try:
            logger.info(f"Generating {count} NPC(s) for {location} ({location_type})")

            npcs = []
            for i in range(count):
                npc = await self._generate_single_npc(location, location_type, role)
                npcs.append(npc)
                self.generated_npcs.append(npc)

            logger.info(f"Successfully generated {len(npcs)} NPC(s)")
            return npcs

        except Exception as e:
            logger.error(f"NPC generation failed: {e}")
            # Return fallback NPCs
            return [self._create_fallback_npc(location, location_type, i) for i in range(count)]

    async def _generate_single_npc(
        self,
        location: str,
        location_type: str,
        role: Optional[str] = None
    ) -> GeneratedNPC:
        """Generate a single NPC with AI."""

        # Select role
        if role is None or role not in self.NPC_ROLES:
            role = self._select_role_for_location(location_type)

        # Select personality and dialogue style
        personality = random.choice(self.PERSONALITIES)
        dialogue_style = random.choice(self.DIALOGUE_STYLES)

        # Generate name
        name = self._generate_name(location)

        # Decide if NPC has a quest (20% chance)
        has_quest = random.random() < 0.2

        # Create prompt for AI
        prompt = self._create_npc_generation_prompt(
            location=location,
            location_type=location_type,
            role=role,
            personality=personality,
            name=name,
            has_quest=has_quest
        )

        # Call AI to generate detailed NPC data
        try:
            response = await self._call_llm(prompt)
            npc_data = self._parse_npc_response(response)

            # Build NPC object
            npc = GeneratedNPC(
                npc_id=f"npc_{location}_{role}_{random.randint(1000, 9999)}",
                name=npc_data.get('name', name),
                role=role,
                personality=personality,
                appearance=npc_data.get('appearance', self._default_appearance(role)),
                dialogue_style=dialogue_style,
                location_type=location_type,
                has_quest=has_quest,
                quest_hint=npc_data.get('quest_hint') if has_quest else None
            )

            return npc

        except Exception as e:
            logger.warning(f"AI generation failed for NPC, using fallback: {e}")
            return self._create_fallback_npc(location, location_type, 0)

    def _select_role_for_location(self, location_type: str) -> str:
        """Select appropriate role based on location type."""
        role_mapping = {
            'shop': ['shopkeeper', 'merchant', 'citizen'],
            'cafe': ['chef', 'citizen', 'artist'],
            'library': ['librarian', 'teacher', 'citizen'],
            'hospital': ['doctor', 'citizen'],
            'school': ['teacher', 'child', 'citizen'],
            'town_hall': ['official', 'citizen'],
            'outdoor': ['citizen', 'child', 'merchant', 'artist']
        }

        possible_roles = role_mapping.get(location_type, ['citizen'])
        return random.choice(possible_roles)

    def _generate_name(self, location: str) -> str:
        """Generate a name appropriate for the location."""
        location_lower = location.lower()
        name_pool = self.NAME_POOLS.get(location_lower, self.NAME_POOLS['default'])

        # Randomly choose gender
        gender = random.choice(['male', 'female'])
        return random.choice(name_pool[gender])

    def _create_npc_generation_prompt(
        self,
        location: str,
        location_type: str,
        role: str,
        personality: str,
        name: str,
        has_quest: bool
    ) -> str:
        """Create prompt for AI NPC generation."""
        quest_part = ""
        if has_quest:
            quest_part = f"""
This NPC has a small quest or favor to ask. Generate a simple quest hint like:
- "I lost my keys somewhere..."
- "I need help finding ingredients..."
- "Can you deliver this package?"
"""

        prompt = f"""Generate a detailed NPC character for a children's game (Super Wings Simulator).

Location: {location} ({location_type})
Role: {role}
Personality: {personality}
Name: {name}

{quest_part}

Return a JSON object with:
{{
    "name": "{name}",
    "appearance": {{
        "hair_color": "...",
        "clothing_style": "...",
        "distinctive_feature": "...",
        "color_scheme": "..."
    }},
    "quest_hint": "..." (if has_quest, otherwise null)
}}

Make the appearance colorful and friendly for children. Keep it simple and positive."""

        return prompt

    def _parse_npc_response(self, response: str) -> Dict[str, Any]:
        """Parse AI response to extract NPC data."""
        import json
        try:
            # Try to extract JSON from response
            start = response.find('{')
            end = response.rfind('}') + 1
            if start != -1 and end > start:
                json_str = response[start:end]
                return json.loads(json_str)
        except Exception as e:
            logger.warning(f"Failed to parse NPC response: {e}")

        return {}

    def _default_appearance(self, role: str) -> Dict[str, Any]:
        """Create default appearance based on role."""
        appearances = {
            'shopkeeper': {
                'hair_color': 'brown',
                'clothing_style': 'apron and casual',
                'distinctive_feature': 'friendly smile',
                'color_scheme': 'blue and white'
            },
            'citizen': {
                'hair_color': 'black',
                'clothing_style': 'casual everyday',
                'distinctive_feature': 'cheerful expression',
                'color_scheme': 'varied colors'
            },
            'child': {
                'hair_color': 'blonde',
                'clothing_style': 'playful and colorful',
                'distinctive_feature': 'big eyes',
                'color_scheme': 'bright colors'
            },
            'elder': {
                'hair_color': 'gray',
                'clothing_style': 'traditional and comfortable',
                'distinctive_feature': 'warm smile',
                'color_scheme': 'earth tones'
            }
        }

        return appearances.get(role, appearances['citizen'])

    async def _call_llm(self, prompt: str) -> str:
        """Call LLM to generate NPC data."""
        # Lazy-load LLM
        if self.llm is None:
            from ..llm import get_llm
            self.llm = get_llm()

        try:
            response = await self.llm.agenerate(
                prompt=prompt,
                max_tokens=500,
                temperature=0.8
            )
            return response
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return ""

    def _create_fallback_npc(
        self,
        location: str,
        location_type: str,
        index: int
    ) -> GeneratedNPC:
        """Create a fallback NPC when AI generation fails."""
        role = self._select_role_for_location(location_type)
        name = self._generate_name(location)

        return GeneratedNPC(
            npc_id=f"npc_{location}_{role}_{index}_{random.randint(1000, 9999)}",
            name=name,
            role=role,
            personality=random.choice(self.PERSONALITIES),
            appearance=self._default_appearance(role),
            dialogue_style=random.choice(self.DIALOGUE_STYLES),
            location_type=location_type,
            has_quest=False,
            quest_hint=None
        )


# Singleton instance
_npc_generator: Optional[NPCGenerator] = None


def get_npc_generator() -> NPCGenerator:
    """Get or create the NPC generator singleton."""
    global _npc_generator
    if _npc_generator is None:
        _npc_generator = NPCGenerator()
    return _npc_generator
