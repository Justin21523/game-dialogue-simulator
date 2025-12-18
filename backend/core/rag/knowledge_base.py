"""
Knowledge Base Manager for Super Wings Simulator.
Manages indexing and retrieval of game knowledge.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from .chroma_store import (
    ChromaVectorStore,
    Document,
    SearchResult,
    get_vector_store,
    get_character_store,
    get_location_store,
    get_mission_store,
    get_npc_store,
    get_event_store,
    get_tutorial_store,
    get_achievement_store,
    get_mechanics_store,
)

logger = logging.getLogger(__name__)


@dataclass
class RetrievalContext:
    """Context retrieved for a query."""
    query: str
    results: List[SearchResult]
    formatted_context: str
    metadata: Dict[str, Any]


class GameKnowledgeBase:
    """
    Manages game knowledge for RAG.
    Indexes characters, locations, missions, and NPCs.
    """

    def __init__(
        self,
        characters_file: str = "./data/characters.json",
        knowledge_dir: str = "./backend/data/knowledge",
    ):
        self.characters_file = Path(characters_file)
        self.knowledge_dir = Path(knowledge_dir)

        # Initialize stores
        self._character_store = get_character_store()
        self._location_store = get_location_store()
        self._mission_store = get_mission_store()
        self._npc_store = get_npc_store()
        self._event_store = get_event_store()
        self._tutorial_store = get_tutorial_store()
        self._achievement_store = get_achievement_store()
        self._mechanics_store = get_mechanics_store()

        logger.info("GameKnowledgeBase initialized")

    def index_characters(self, force_reindex: bool = False) -> int:
        """
        Index character data from characters.json.

        Args:
            force_reindex: If True, clear existing and reindex

        Returns:
            Number of documents indexed
        """
        if not self.characters_file.exists():
            logger.warning(f"Characters file not found: {self.characters_file}")
            return 0

        if force_reindex:
            self._character_store.clear()

        # Check if already indexed
        if self._character_store.count > 0 and not force_reindex:
            logger.info("Characters already indexed, skipping")
            return self._character_store.count

        with open(self.characters_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        for char_id, char_data in data.get("characters", {}).items():
            # Create rich text representation for embedding
            content = self._format_character_content(char_id, char_data)

            doc = Document(
                id=f"char_{char_id}",
                content=content,
                metadata={
                    "type": "character",
                    "character_id": char_id,
                    "name": char_data.get("name", char_id),
                    "name_zh": char_data.get("name_zh", ""),
                    "role": char_data.get("role", ""),
                    "specialization": char_data.get("stats", {}).get("specialization", ""),
                }
            )
            documents.append(doc)

        indexed = self._character_store.add_documents(documents)
        logger.info(f"Indexed {indexed} characters")
        return indexed

    def _format_character_content(self, char_id: str, char_data: Dict) -> str:
        """Format character data as searchable text."""
        parts = [
            f"Character: {char_data.get('name', char_id)}",
            f"Chinese Name: {char_data.get('name_zh', '')}",
            f"Role: {char_data.get('role', '')}",
            f"Type: {char_data.get('type', '')}",
        ]

        # Add visual description
        visual = char_data.get("visual_description", {})
        if visual:
            parts.append(f"Colors: {visual.get('primary_color', '')} and {visual.get('secondary_color', '')}")
            if visual.get("unique_features"):
                parts.append(f"Unique Features: {', '.join(visual.get('unique_features', []))}")

        # Add personality
        if char_data.get("personality"):
            parts.append(f"Personality: {char_data['personality']}")

        # Add abilities
        if char_data.get("abilities"):
            parts.append(f"Abilities: {', '.join(char_data['abilities'])}")

        # Add specialization
        stats = char_data.get("stats", {})
        if stats.get("specialization"):
            parts.append(f"Specialization: {stats['specialization']}")

        # Add prompt hints
        prompt_hints = char_data.get("prompt_hints", {})
        if prompt_hints:
            if prompt_hints.get("expression_style"):
                parts.append(f"Expression Style: {prompt_hints['expression_style']}")
            if prompt_hints.get("pose_suggestions"):
                parts.append(f"Typical Poses: {', '.join(prompt_hints['pose_suggestions'])}")

        return "\n".join(parts)

    def index_locations(self, force_reindex: bool = False) -> int:
        """Index location data."""
        locations_file = self.knowledge_dir / "locations.json"

        if not locations_file.exists():
            logger.warning(f"Locations file not found: {locations_file}")
            return 0

        if force_reindex:
            self._location_store.clear()

        if self._location_store.count > 0 and not force_reindex:
            logger.info("Locations already indexed, skipping")
            return self._location_store.count

        with open(locations_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        for loc_id, loc_data in data.get("locations", {}).items():
            content = self._format_location_content(loc_id, loc_data)

            doc = Document(
                id=f"loc_{loc_id}",
                content=content,
                metadata={
                    "type": "location",
                    "location_id": loc_id,
                    "name": loc_data.get("name", loc_id),
                    "region": loc_data.get("region", ""),
                }
            )
            documents.append(doc)

        indexed = self._location_store.add_documents(documents)
        logger.info(f"Indexed {indexed} locations")
        return indexed

    def _format_location_content(self, loc_id: str, loc_data: Dict) -> str:
        """Format location data as searchable text."""
        parts = [
            f"Location: {loc_data.get('name', loc_id)}",
            f"Region: {loc_data.get('region', '')}",
            f"Description: {loc_data.get('description', '')}",
        ]

        if loc_data.get("cultural_notes"):
            parts.append(f"Cultural Notes: {loc_data['cultural_notes']}")

        if loc_data.get("common_problems"):
            parts.append(f"Common Problems: {', '.join(loc_data['common_problems'])}")

        if loc_data.get("landmarks"):
            parts.append(f"Landmarks: {', '.join(loc_data['landmarks'])}")

        return "\n".join(parts)

    def index_missions(self, force_reindex: bool = False) -> int:
        """Index mission type data."""
        missions_file = self.knowledge_dir / "mission_types.json"

        if not missions_file.exists():
            logger.warning(f"Missions file not found: {missions_file}")
            return 0

        if force_reindex:
            self._mission_store.clear()

        if self._mission_store.count > 0 and not force_reindex:
            logger.info("Missions already indexed, skipping")
            return self._mission_store.count

        with open(missions_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        for mission_id, mission_data in data.get("mission_types", {}).items():
            content = self._format_mission_content(mission_id, mission_data)

            doc = Document(
                id=f"mission_{mission_id}",
                content=content,
                metadata={
                    "type": "mission_type",
                    "mission_id": mission_id,
                    "name": mission_data.get("name", mission_id),
                    "specialist": mission_data.get("specialist", ""),
                }
            )
            documents.append(doc)

        indexed = self._mission_store.add_documents(documents)
        logger.info(f"Indexed {indexed} mission types")
        return indexed

    def _format_mission_content(self, mission_id: str, mission_data: Dict) -> str:
        """Format mission data as searchable text."""
        parts = [
            f"Mission Type: {mission_data.get('name', mission_id)}",
            f"Description: {mission_data.get('description', '')}",
        ]

        if mission_data.get("specialist"):
            parts.append(f"Best Character: {mission_data['specialist']}")

        if mission_data.get("required_abilities"):
            parts.append(f"Required Abilities: {', '.join(mission_data['required_abilities'])}")

        if mission_data.get("success_factors"):
            parts.append(f"Success Factors: {', '.join(mission_data['success_factors'])}")

        return "\n".join(parts)

    def index_npcs(self, force_reindex: bool = False) -> int:
        """Index NPC data."""
        npcs_file = self.knowledge_dir / "npcs.json"

        if not npcs_file.exists():
            logger.warning(f"NPCs file not found: {npcs_file}")
            return 0

        if force_reindex:
            self._npc_store.clear()

        if self._npc_store.count > 0 and not force_reindex:
            logger.info("NPCs already indexed, skipping")
            return self._npc_store.count

        with open(npcs_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []
        for npc_id, npc_data in data.get("npcs", {}).items():
            content = self._format_npc_content(npc_id, npc_data)

            doc = Document(
                id=f"npc_{npc_id}",
                content=content,
                metadata={
                    "type": "npc",
                    "npc_id": npc_id,
                    "name": npc_data.get("name", npc_id),
                    "location": npc_data.get("location", ""),
                    "role": npc_data.get("role", ""),
                    "age_group": npc_data.get("age_group", ""),
                }
            )
            documents.append(doc)

        indexed = self._npc_store.add_documents(documents)
        logger.info(f"Indexed {indexed} NPCs")
        return indexed

    def _format_npc_content(self, npc_id: str, npc_data: Dict) -> str:
        """Format NPC data as searchable text."""
        parts = [
            f"NPC: {npc_data.get('name', npc_id)}",
            f"Location: {npc_data.get('location', '')}",
            f"Role: {npc_data.get('role', '')}",
            f"Age Group: {npc_data.get('age_group', '')}",
            f"Personality: {npc_data.get('personality', '')}",
            f"Speaking Style: {npc_data.get('speaking_style', '')}",
        ]

        if npc_data.get("typical_problems"):
            parts.append(f"Typical Problems: {', '.join(npc_data['typical_problems'])}")

        if npc_data.get("greeting_style"):
            parts.append(f"Greeting: {npc_data['greeting_style']}")

        if npc_data.get("cultural_background"):
            parts.append(f"Background: {npc_data['cultural_background']}")

        return "\n".join(parts)

    def index_tutorials(self, force_reindex: bool = False) -> int:
        """Index tutorial data."""
        tutorials_file = self.knowledge_dir / "tutorials.json"

        if not tutorials_file.exists():
            logger.warning(f"Tutorials file not found: {tutorials_file}")
            return 0

        if force_reindex:
            self._tutorial_store.clear()

        if self._tutorial_store.count > 0 and not force_reindex:
            logger.info("Tutorials already indexed, skipping")
            return self._tutorial_store.count

        with open(tutorials_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []

        # Index tutorials
        for tutorial_id, tutorial_data in data.get("tutorials", {}).items():
            content = self._format_tutorial_content(tutorial_id, tutorial_data)
            doc = Document(
                id=f"tutorial_{tutorial_id}",
                content=content,
                metadata={
                    "type": "tutorial",
                    "tutorial_id": tutorial_id,
                    "title": tutorial_data.get("title", tutorial_id),
                    "category": tutorial_data.get("category", ""),
                }
            )
            documents.append(doc)

        # Index character guides
        for char_id, guide_data in data.get("character_guides", {}).items():
            content = self._format_character_guide_content(char_id, guide_data)
            doc = Document(
                id=f"guide_{char_id}",
                content=content,
                metadata={
                    "type": "character_guide",
                    "character_id": char_id,
                    "name": guide_data.get("name", char_id),
                }
            )
            documents.append(doc)

        indexed = self._tutorial_store.add_documents(documents)
        logger.info(f"Indexed {indexed} tutorials and guides")
        return indexed

    def _format_tutorial_content(self, tutorial_id: str, tutorial_data: Dict) -> str:
        """Format tutorial data as searchable text."""
        parts = [
            f"Tutorial: {tutorial_data.get('title', tutorial_id)}",
            f"Category: {tutorial_data.get('category', '')}",
            f"Content: {tutorial_data.get('content', '')}",
        ]

        if tutorial_data.get("steps"):
            parts.append(f"Steps: {' '.join(tutorial_data['steps'])}")

        if tutorial_data.get("tips"):
            parts.append(f"Tips: {' '.join(tutorial_data['tips'])}")

        return "\n".join(parts)

    def _format_character_guide_content(self, char_id: str, guide_data: Dict) -> str:
        """Format character guide as searchable text."""
        parts = [
            f"Character Guide: {guide_data.get('name', char_id)}",
            f"Content: {guide_data.get('guide_content', '')}",
        ]

        if guide_data.get("strengths"):
            parts.append(f"Strengths: {', '.join(guide_data['strengths'])}")

        if guide_data.get("best_for"):
            parts.append(f"Best For: {', '.join(guide_data['best_for'])}")

        if guide_data.get("tips"):
            parts.append(f"Tips: {guide_data['tips']}")

        return "\n".join(parts)

    def index_achievements(self, force_reindex: bool = False) -> int:
        """Index achievement data."""
        achievements_file = self.knowledge_dir / "achievements.json"

        if not achievements_file.exists():
            logger.warning(f"Achievements file not found: {achievements_file}")
            return 0

        if force_reindex:
            self._achievement_store.clear()

        if self._achievement_store.count > 0 and not force_reindex:
            logger.info("Achievements already indexed, skipping")
            return self._achievement_store.count

        with open(achievements_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []

        # Index achievements
        for ach_id, ach_data in data.get("achievements", {}).items():
            content = self._format_achievement_content(ach_id, ach_data)
            doc = Document(
                id=f"achievement_{ach_id}",
                content=content,
                metadata={
                    "type": "achievement",
                    "achievement_id": ach_id,
                    "name": ach_data.get("name", ach_id),
                    "category": ach_data.get("category", ""),
                    "rarity": ach_data.get("rarity", "common"),
                }
            )
            documents.append(doc)

        # Index milestones
        for ms_id, ms_data in data.get("milestones", {}).items():
            content = self._format_milestone_content(ms_id, ms_data)
            doc = Document(
                id=f"milestone_{ms_id}",
                content=content,
                metadata={
                    "type": "milestone",
                    "milestone_id": ms_id,
                    "name": ms_data.get("name", ms_id),
                    "reward_tier": ms_data.get("reward_tier", 1),
                }
            )
            documents.append(doc)

        indexed = self._achievement_store.add_documents(documents)
        logger.info(f"Indexed {indexed} achievements and milestones")
        return indexed

    def _format_achievement_content(self, ach_id: str, ach_data: Dict) -> str:
        """Format achievement as searchable text."""
        parts = [
            f"Achievement: {ach_data.get('name', ach_id)}",
            f"Description: {ach_data.get('description', '')}",
            f"Category: {ach_data.get('category', '')}",
            f"Rarity: {ach_data.get('rarity', 'common')}",
        ]

        condition = ach_data.get("condition", {})
        if condition:
            parts.append(f"Condition: {condition.get('type', '')} - {condition.get('count', 0)}")

        return "\n".join(parts)

    def _format_milestone_content(self, ms_id: str, ms_data: Dict) -> str:
        """Format milestone as searchable text."""
        return "\n".join([
            f"Milestone: {ms_data.get('name', ms_id)}",
            f"Description: {ms_data.get('description', '')}",
            f"Requirement: {ms_data.get('requirement', '')}",
        ])

    def index_mechanics(self, force_reindex: bool = False) -> int:
        """Index game mechanics data."""
        mechanics_file = self.knowledge_dir / "game_mechanics.json"

        if not mechanics_file.exists():
            logger.warning(f"Mechanics file not found: {mechanics_file}")
            return 0

        if force_reindex:
            self._mechanics_store.clear()

        if self._mechanics_store.count > 0 and not force_reindex:
            logger.info("Mechanics already indexed, skipping")
            return self._mechanics_store.count

        with open(mechanics_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        documents = []

        # Index game mechanics
        for mech_id, mech_data in data.get("game_mechanics", {}).items():
            content = self._format_mechanics_content(mech_id, mech_data)
            doc = Document(
                id=f"mechanics_{mech_id}",
                content=content,
                metadata={
                    "type": "game_mechanics",
                    "mechanics_id": mech_id,
                    "name": mech_data.get("name", mech_id),
                }
            )
            documents.append(doc)

        # Index formulas
        for formula_id, formula_data in data.get("formulas", {}).items():
            content = self._format_formula_content(formula_id, formula_data)
            doc = Document(
                id=f"formula_{formula_id}",
                content=content,
                metadata={
                    "type": "formula",
                    "formula_id": formula_id,
                }
            )
            documents.append(doc)

        indexed = self._mechanics_store.add_documents(documents)
        logger.info(f"Indexed {indexed} game mechanics")
        return indexed

    def _format_mechanics_content(self, mech_id: str, mech_data: Dict) -> str:
        """Format game mechanics as searchable text."""
        parts = [
            f"Game Mechanic: {mech_data.get('name', mech_id)}",
            f"Description: {mech_data.get('description', '')}",
        ]

        # Add rules if present
        rules = mech_data.get("rules", {})
        if rules:
            for rule_name, rule_info in rules.items():
                if isinstance(rule_info, dict):
                    parts.append(f"Rule - {rule_name}: {rule_info.get('description', '')}")

        return "\n".join(parts)

    def _format_formula_content(self, formula_id: str, formula_data: Dict) -> str:
        """Format formula as searchable text."""
        parts = [
            f"Formula: {formula_id}",
            f"Description: {formula_data.get('description', '')}",
            f"Formula: {formula_data.get('formula', '')}",
        ]
        return "\n".join(parts)

    def index_all(self, force_reindex: bool = False) -> Dict[str, int]:
        """Index all knowledge bases."""
        results = {
            "characters": self.index_characters(force_reindex),
            "locations": self.index_locations(force_reindex),
            "missions": self.index_missions(force_reindex),
            "npcs": self.index_npcs(force_reindex),
            "tutorials": self.index_tutorials(force_reindex),
            "achievements": self.index_achievements(force_reindex),
            "mechanics": self.index_mechanics(force_reindex),
        }
        logger.info(f"Indexed all knowledge: {results}")
        return results

    def search_characters(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
    ) -> List[SearchResult]:
        """Search character knowledge."""
        return self._character_store.search(query, top_k=top_k, min_score=min_score)

    def search_locations(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
    ) -> List[SearchResult]:
        """Search location knowledge."""
        return self._location_store.search(query, top_k=top_k, min_score=min_score)

    def search_missions(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
    ) -> List[SearchResult]:
        """Search mission knowledge."""
        return self._mission_store.search(query, top_k=top_k, min_score=min_score)

    def search_npcs(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
        location: Optional[str] = None,
    ) -> List[SearchResult]:
        """Search NPC knowledge."""
        where = None
        if location:
            where = {"location": location}
        return self._npc_store.search(query, top_k=top_k, min_score=min_score, where=where)

    def get_npc_by_location(self, location: str) -> List[SearchResult]:
        """Get all NPCs at a specific location."""
        return self._npc_store.search(
            location,
            top_k=10,
            where={"location": location},
        )

    def get_npc(self, npc_id: str) -> Optional[Document]:
        """Get a specific NPC by ID."""
        return self._npc_store.get_document(f"npc_{npc_id}")

    def search_tutorials(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
        category: Optional[str] = None,
    ) -> List[SearchResult]:
        """Search tutorial knowledge."""
        where = None
        if category:
            where = {"category": category}
        return self._tutorial_store.search(query, top_k=top_k, min_score=min_score, where=where)

    def search_achievements(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.3,
        category: Optional[str] = None,
    ) -> List[SearchResult]:
        """Search achievement knowledge."""
        where = None
        if category:
            where = {"category": category}
        return self._achievement_store.search(query, top_k=top_k, min_score=min_score, where=where)

    def search_mechanics(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.3,
    ) -> List[SearchResult]:
        """Search game mechanics knowledge."""
        return self._mechanics_store.search(query, top_k=top_k, min_score=min_score)

    def get_tutorial(self, tutorial_id: str) -> Optional[Document]:
        """Get a specific tutorial by ID."""
        return self._tutorial_store.get_document(f"tutorial_{tutorial_id}")

    def get_character_guide(self, character_id: str) -> Optional[Document]:
        """Get character guide by character ID."""
        return self._tutorial_store.get_document(f"guide_{character_id}")

    def get_achievement(self, achievement_id: str) -> Optional[Document]:
        """Get a specific achievement by ID."""
        return self._achievement_store.get_document(f"achievement_{achievement_id}")

    def get_milestone(self, milestone_id: str) -> Optional[Document]:
        """Get a specific milestone by ID."""
        return self._achievement_store.get_document(f"milestone_{milestone_id}")

    def get_mechanics(self, mechanics_id: str) -> Optional[Document]:
        """Get specific game mechanics by ID."""
        return self._mechanics_store.get_document(f"mechanics_{mechanics_id}")

    def retrieve_for_dispatch(
        self,
        mission_description: str,
        location: Optional[str] = None,
        top_k: int = 5,
    ) -> RetrievalContext:
        """
        Retrieve context for mission dispatch decision.

        Args:
            mission_description: Description of the mission
            location: Optional location name
            top_k: Number of results per category

        Returns:
            RetrievalContext with formatted context for LLM
        """
        # Search for relevant characters
        char_results = self.search_characters(mission_description, top_k=top_k)

        # Search for mission type info
        mission_results = self.search_missions(mission_description, top_k=2)

        # Search for location if provided
        loc_results = []
        if location:
            loc_results = self.search_locations(location, top_k=1)

        # Format context
        context_parts = []

        if char_results:
            context_parts.append("## Relevant Characters")
            for r in char_results:
                context_parts.append(f"- {r.document.content}")
                context_parts.append(f"  (Relevance: {r.score:.2f})")

        if mission_results:
            context_parts.append("\n## Mission Type Information")
            for r in mission_results:
                context_parts.append(f"- {r.document.content}")

        if loc_results:
            context_parts.append("\n## Location Information")
            for r in loc_results:
                context_parts.append(f"- {r.document.content}")

        formatted_context = "\n".join(context_parts)

        return RetrievalContext(
            query=mission_description,
            results=char_results + mission_results + loc_results,
            formatted_context=formatted_context,
            metadata={
                "character_count": len(char_results),
                "mission_count": len(mission_results),
                "location_count": len(loc_results),
            }
        )

    def retrieve_for_dialogue(
        self,
        character_id: str,
        situation: str,
    ) -> RetrievalContext:
        """
        Retrieve context for character dialogue generation.

        Args:
            character_id: Character generating dialogue
            situation: Current situation description

        Returns:
            RetrievalContext with character info for dialogue
        """
        # Get specific character
        char_doc = self._character_store.get_document(f"char_{character_id}")

        # Search for similar situations
        situation_results = self.search_missions(situation, top_k=2)

        context_parts = []
        results = []

        if char_doc:
            context_parts.append("## Character Profile")
            context_parts.append(char_doc.content)
            results.append(SearchResult(document=char_doc, score=1.0, rank=1))

        if situation_results:
            context_parts.append("\n## Situation Context")
            for r in situation_results:
                context_parts.append(f"- {r.document.content}")
                results.append(r)

        return RetrievalContext(
            query=f"{character_id}: {situation}",
            results=results,
            formatted_context="\n".join(context_parts),
            metadata={"character_id": character_id}
        )

    def retrieve_for_npc(
        self,
        npc_id: str,
        situation: str,
        character_id: Optional[str] = None,
    ) -> RetrievalContext:
        """
        Retrieve context for NPC dialogue generation.

        Args:
            npc_id: NPC generating dialogue
            situation: Current situation description
            character_id: Optional Super Wings character interacting

        Returns:
            RetrievalContext with NPC info for dialogue
        """
        # Get specific NPC
        npc_doc = self._npc_store.get_document(f"npc_{npc_id}")

        context_parts = []
        results = []

        if npc_doc:
            context_parts.append("## NPC Profile")
            context_parts.append(npc_doc.content)
            results.append(SearchResult(document=npc_doc, score=1.0, rank=1))

            # Get location info
            location = npc_doc.metadata.get("location")
            if location:
                loc_results = self.search_locations(location, top_k=1)
                if loc_results:
                    context_parts.append("\n## Location Context")
                    context_parts.append(loc_results[0].document.content)
                    results.extend(loc_results)

        # Get character info if interacting
        if character_id:
            char_doc = self._character_store.get_document(f"char_{character_id}")
            if char_doc:
                context_parts.append("\n## Interacting Character")
                context_parts.append(char_doc.content)
                results.append(SearchResult(document=char_doc, score=1.0, rank=len(results)+1))

        # Search for situation context
        situation_results = self.search_missions(situation, top_k=1)
        if situation_results:
            context_parts.append("\n## Situation Context")
            for r in situation_results:
                context_parts.append(f"- {r.document.content}")
                results.append(r)

        return RetrievalContext(
            query=f"{npc_id}: {situation}",
            results=results,
            formatted_context="\n".join(context_parts),
            metadata={"npc_id": npc_id, "character_id": character_id}
        )

    def retrieve_for_event(
        self,
        location: str,
        mission_type: str,
        character_id: str,
    ) -> RetrievalContext:
        """
        Retrieve context for dynamic event generation.

        Args:
            location: Current location
            mission_type: Type of mission
            character_id: Character on mission

        Returns:
            RetrievalContext with info for event generation
        """
        context_parts = []
        results = []

        # Get location info
        loc_results = self.search_locations(location, top_k=1)
        if loc_results:
            context_parts.append("## Location")
            context_parts.append(loc_results[0].document.content)
            results.extend(loc_results)

        # Get mission type info
        mission_results = self.search_missions(mission_type, top_k=1)
        if mission_results:
            context_parts.append("\n## Mission Type")
            context_parts.append(mission_results[0].document.content)
            results.extend(mission_results)

        # Get character info
        char_doc = self._character_store.get_document(f"char_{character_id}")
        if char_doc:
            context_parts.append("\n## Character")
            context_parts.append(char_doc.content)
            results.append(SearchResult(document=char_doc, score=1.0, rank=len(results)+1))

        # Get potential NPCs at location
        npc_results = self.search_npcs(location, top_k=2, location=location)
        if npc_results:
            context_parts.append("\n## Nearby NPCs")
            for r in npc_results:
                context_parts.append(f"- {r.document.metadata.get('name', 'Unknown')}")
            results.extend(npc_results)

        return RetrievalContext(
            query=f"Event at {location} for {mission_type}",
            results=results,
            formatted_context="\n".join(context_parts),
            metadata={
                "location": location,
                "mission_type": mission_type,
                "character_id": character_id,
            }
        )

    def retrieve_for_tutorial(
        self,
        topic: str,
        character_id: Optional[str] = None,
        category: Optional[str] = None,
    ) -> RetrievalContext:
        """
        Retrieve context for tutorial/help generation.

        Args:
            topic: Tutorial topic or question
            character_id: Optional character to focus on
            category: Optional tutorial category

        Returns:
            RetrievalContext with tutorial and game info
        """
        context_parts = []
        results = []

        # Search tutorials
        tutorial_results = self.search_tutorials(topic, top_k=3, category=category)
        if tutorial_results:
            context_parts.append("## Relevant Tutorials")
            for r in tutorial_results:
                context_parts.append(f"- {r.document.content}")
                results.append(r)

        # Search mechanics for gameplay questions
        mechanics_results = self.search_mechanics(topic, top_k=2)
        if mechanics_results:
            context_parts.append("\n## Game Mechanics")
            for r in mechanics_results:
                context_parts.append(f"- {r.document.content}")
                results.append(r)

        # Get character guide if specific character
        if character_id:
            guide_doc = self.get_character_guide(character_id)
            if guide_doc:
                context_parts.append("\n## Character Guide")
                context_parts.append(guide_doc.content)
                results.append(SearchResult(document=guide_doc, score=1.0, rank=len(results)+1))

        # Search missions for mission-related questions
        if any(keyword in topic.lower() for keyword in ["mission", "task", "dispatch", "deliver"]):
            mission_results = self.search_missions(topic, top_k=2)
            if mission_results:
                context_parts.append("\n## Mission Information")
                for r in mission_results:
                    context_parts.append(f"- {r.document.content}")
                    results.append(r)

        return RetrievalContext(
            query=topic,
            results=results,
            formatted_context="\n".join(context_parts),
            metadata={
                "topic": topic,
                "character_id": character_id,
                "category": category,
            }
        )

    def retrieve_for_progress_analysis(
        self,
        player_data: Dict[str, Any],
    ) -> RetrievalContext:
        """
        Retrieve context for player progress analysis.

        Args:
            player_data: Player's game data including:
                - missions_completed: int
                - characters_used: List[str]
                - locations_visited: List[str]
                - achievements_earned: List[str]
                - character_levels: Dict[str, int]

        Returns:
            RetrievalContext with achievement and progression info
        """
        context_parts = []
        results = []

        missions_completed = player_data.get("missions_completed", 0)
        characters_used = player_data.get("characters_used", [])
        locations_visited = player_data.get("locations_visited", [])
        achievements_earned = player_data.get("achievements_earned", [])

        # Find relevant achievements based on progress
        context_parts.append("## Achievement Progress")

        # Search for achievements they might be close to
        if missions_completed > 0:
            mission_achievements = self.search_achievements(
                f"complete {missions_completed} missions",
                top_k=3
            )
            if mission_achievements:
                context_parts.append("\n### Mission Achievements")
                for r in mission_achievements:
                    if r.document.id.replace("achievement_", "") not in achievements_earned:
                        context_parts.append(f"- {r.document.content}")
                        results.append(r)

        # Character-based achievements
        if characters_used:
            context_parts.append("\n### Character Achievements")
            char_achievements = self.search_achievements(
                f"use {len(characters_used)} characters",
                top_k=3
            )
            for r in char_achievements:
                if r.document.id.replace("achievement_", "") not in achievements_earned:
                    context_parts.append(f"- {r.document.content}")
                    results.append(r)

        # Location-based achievements
        if locations_visited:
            context_parts.append("\n### Exploration Achievements")
            loc_achievements = self.search_achievements(
                f"visit {len(locations_visited)} locations",
                top_k=2,
                category="exploration"
            )
            for r in loc_achievements:
                if r.document.id.replace("achievement_", "") not in achievements_earned:
                    context_parts.append(f"- {r.document.content}")
                    results.append(r)

        # Find current milestone
        context_parts.append("\n## Milestones")
        milestone_query = f"complete {missions_completed} missions level"
        milestone_results = self._achievement_store.search(
            milestone_query,
            top_k=2,
            where={"type": "milestone"}
        )
        for r in milestone_results:
            context_parts.append(f"- {r.document.content}")
            results.append(r)

        # Add progression tips
        context_parts.append("\n## Progression Tips")
        tip_results = self.search_tutorials("tips progress level up", top_k=2)
        for r in tip_results:
            context_parts.append(f"- {r.document.content}")
            results.append(r)

        return RetrievalContext(
            query=f"Progress analysis: {missions_completed} missions, {len(characters_used)} characters",
            results=results,
            formatted_context="\n".join(context_parts),
            metadata={
                "missions_completed": missions_completed,
                "characters_used": len(characters_used),
                "locations_visited": len(locations_visited),
                "achievements_earned": len(achievements_earned),
            }
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get knowledge base statistics."""
        return {
            "characters": self._character_store.get_stats(),
            "locations": self._location_store.get_stats(),
            "missions": self._mission_store.get_stats(),
            "npcs": self._npc_store.get_stats(),
            "events": self._event_store.get_stats(),
            "tutorials": self._tutorial_store.get_stats(),
            "achievements": self._achievement_store.get_stats(),
            "mechanics": self._mechanics_store.get_stats(),
        }


# Singleton instance
_knowledge_base: Optional[GameKnowledgeBase] = None


def get_knowledge_base(**kwargs) -> GameKnowledgeBase:
    """Get or create knowledge base singleton."""
    global _knowledge_base

    if _knowledge_base is None:
        from ...config import get_settings
        settings = get_settings()

        _knowledge_base = GameKnowledgeBase(
            characters_file=kwargs.get("characters_file", settings.game.characters_file),
            knowledge_dir=kwargs.get("knowledge_dir", settings.game.knowledge_dir),
        )

    return _knowledge_base
