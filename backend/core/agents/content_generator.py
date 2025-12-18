"""
AI-powered content generator for Super Wings game.
Uses LLM to generate missions, locations, events, and more.
"""

import json
import logging
import random
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from ..llm import get_llm, GenerationConfig
from ..rag import get_knowledge_base

logger = logging.getLogger(__name__)


@dataclass
class GeneratedMission:
    """A generated mission."""
    id: str
    title: str
    type: str
    location: str
    description: str
    npc_name: str
    problem: str  # The child's problem that needs solving
    solution: str  # How Super Wings helps
    objectives: List[Dict[str, Any]]
    rewards: Dict[str, int]
    difficulty: str
    fuel_cost: int
    duration: int


@dataclass
class GeneratedLocation:
    """A generated location."""
    id: str
    name: str
    country: str
    region: str
    description: str
    cultural_notes: str
    landmarks: List[str]
    common_problems: List[str]


@dataclass
class GeneratedEvent:
    """A generated game event."""
    id: str
    name: str
    type: str  # seasonal, random, story
    description: str
    trigger_conditions: Dict[str, Any]
    rewards: Dict[str, Any]
    duration_hours: int


class ContentGeneratorAgent:
    """
    AI agent that generates game content using LLM and RAG.
    """

    MISSION_TYPES = [
        "delivery", "rescue", "construction", "performance",
        "security", "tracking", "underwater", "towing",
        "weather_emergency", "festival", "animal_rescue", "medical_delivery"
    ]

    REGIONS = [
        "Asia", "Europe", "North America", "South America",
        "Africa", "Oceania", "Polar"
    ]

    CHARACTER_SPECIALISTS = {
        "jett": ["delivery", "festival", "medical_delivery"],
        "jerome": ["performance"],
        "donnie": ["construction"],
        "chase": ["rescue", "weather_emergency"],
        "paul": ["security"],
        "bello": ["tracking", "animal_rescue"],
        "flip": ["underwater"],
        "todd": ["towing"],
    }

    def __init__(self, llm=None):
        self.llm = llm
        self.knowledge_base = get_knowledge_base()

    async def _get_llm(self):
        """Get or initialize the LLM."""
        if self.llm is None:
            self.llm = get_llm()
        return self.llm

    async def generate_mission(
        self,
        mission_type: Optional[str] = None,
        location: Optional[str] = None,
        difficulty: str = "medium",
        character_id: Optional[str] = None,
    ) -> GeneratedMission:
        """
        Generate a new mission using AI.

        Args:
            mission_type: Type of mission (random if not specified)
            location: Location for mission (random if not specified)
            difficulty: easy/medium/hard
            character_id: Specific character to tailor mission for

        Returns:
            GeneratedMission object
        """
        llm = await self._get_llm()

        # Select type and location if not specified
        if mission_type is None:
            if character_id and character_id in self.CHARACTER_SPECIALISTS:
                mission_type = random.choice(self.CHARACTER_SPECIALISTS[character_id])
            else:
                mission_type = random.choice(self.MISSION_TYPES)

        # Retrieve relevant context from knowledge base
        try:
            mission_results = self.knowledge_base.search_missions(mission_type, top_k=2)
            location_results = []
            if location:
                location_results = self.knowledge_base.search_locations(location, top_k=1)

            context_parts = []
            for r in mission_results:
                context_parts.append(r.document.content)
            for r in location_results:
                context_parts.append(r.document.content)
            context = "\n".join(context_parts)
        except Exception as e:
            logger.warning(f"Context retrieval failed: {e}")
            context = ""

        # Build a comprehensive prompt for mission generation
        location_str = location or "a city in " + random.choice(self.REGIONS)

        # Add context section if RAG retrieval was successful
        context_section = ""
        if context:
            context_section = f"\n\nReference examples from the series:\n{context}\n"

        prompt = f"""You are a creative writer for Super Wings, an animated series where robot planes help children around the world.

Generate a {mission_type} mission. The mission takes place in {location_str}.{context_section}

IMPORTANT: Output ONLY a valid JSON object with these exact fields:
{{
  "title": "A catchy mission title (3-6 words)",
  "location": "City name, Country",
  "npc_name": "A child's name appropriate for the location",
  "description": "One sentence describing the mission",
  "problem": "What problem does the child face?",
  "solution": "How do the Super Wings help solve it?"
}}

Example for a delivery mission in Paris:
{{
  "title": "Eiffel Tower Surprise",
  "location": "Paris, France",
  "npc_name": "Sophie",
  "description": "Deliver a birthday gift to the top of the Eiffel Tower.",
  "problem": "Sophie wants to surprise her grandmother with a birthday cake but cannot reach the observation deck in time.",
  "solution": "Jett flies the cake to the top while Donnie builds a special cake platform."
}}

Now generate a unique {mission_type} mission. Output ONLY the JSON, no explanation:"""

        config = GenerationConfig(
            max_new_tokens=512,
            temperature=0.7,
        )

        try:
            response = await llm.generate(prompt, config)
            # Extract content from LLMResponse
            response_text = response.content if hasattr(response, 'content') else str(response)
            data = self._parse_json_response(response_text)

            # Calculate rewards based on difficulty
            difficulty_multiplier = {"easy": 1.0, "medium": 1.5, "hard": 2.0}.get(difficulty, 1.0)
            base_money = int(100 * difficulty_multiplier)
            base_exp = int(50 * difficulty_multiplier)

            # Log successful generation
            logger.info(f"Generated mission: {data.get('title', 'Unknown')}")

            return GeneratedMission(
                id=f"m_{random.randint(10000, 99999)}",
                title=data.get("title", f"{mission_type.title()} Mission"),
                type=mission_type,
                location=data.get("location", location or "Unknown"),
                description=data.get("description", "Help someone in need!"),
                npc_name=data.get("npc_name", "Friend"),
                problem=data.get("problem", "A child needs help with a problem."),
                solution=data.get("solution", "The Super Wings team works together to help!"),
                objectives=[
                    {"type": "main", "description": data.get("description", "Complete the mission")},
                    {"type": "bonus", "description": "Collect bonus items along the way"}
                ],
                rewards={"money": base_money, "exp": base_exp},
                difficulty=difficulty,
                fuel_cost=int(10 * difficulty_multiplier),
                duration=int(60 * difficulty_multiplier),
            )

        except Exception as e:
            logger.error(f"Mission generation failed: {e}")
            # Return a fallback mission
            return self._fallback_mission(mission_type, location, difficulty)

    async def generate_location(
        self,
        region: Optional[str] = None,
        theme: Optional[str] = None,
    ) -> GeneratedLocation:
        """
        Generate a new location using AI.

        Args:
            region: Geographic region
            theme: Optional theme (urban, nature, historical, etc.)

        Returns:
            GeneratedLocation object
        """
        llm = await self._get_llm()
        region = region or random.choice(self.REGIONS)

        theme_str = theme or "any interesting theme (urban, nature, historical, coastal, etc.)"

        prompt = f"""You are a creative writer for Super Wings, an animated series about robot planes helping children worldwide.

Generate a new location in {region} with theme: {theme_str}

IMPORTANT: Output ONLY a valid JSON object with these exact fields:
{{
  "name": "City or place name",
  "country": "Country name",
  "description": "A brief description of the location (1-2 sentences)",
  "cultural_notes": "One fun fact about this place that children would enjoy",
  "landmarks": ["Famous landmark 1", "Famous landmark 2"],
  "common_problems": ["Type of problem 1", "Type of problem 2"]
}}

Example for Europe:
{{
  "name": "Venice",
  "country": "Italy",
  "description": "A magical city built on water with canals instead of streets.",
  "cultural_notes": "People travel by boat instead of car, and the city has over 400 bridges!",
  "landmarks": ["St. Mark's Square", "Rialto Bridge"],
  "common_problems": ["delivery by boat", "lost tourists", "flooding"]
}}

Now generate a unique location in {region}. Output ONLY the JSON:"""

        config = GenerationConfig(
            max_new_tokens=400,
            temperature=0.8,
        )

        try:
            response = await llm.generate(prompt, config)
            response_text = response.content if hasattr(response, 'content') else str(response)
            data = self._parse_json_response(response_text)

            loc_id = data.get("name", "location").lower().replace(" ", "_")[:20]
            logger.info(f"Generated location: {data.get('name', 'Unknown')}")

            return GeneratedLocation(
                id=f"{loc_id}_{random.randint(100, 999)}",
                name=data.get("name", "New Location"),
                country=data.get("country", "Unknown"),
                region=region,
                description=data.get("description", "A wonderful place to visit!"),
                cultural_notes=data.get("cultural_notes", "A fascinating place with rich culture."),
                landmarks=data.get("landmarks", ["Town Square", "Local Market"]),
                common_problems=data.get("common_problems", ["deliveries", "celebrations"]),
            )

        except Exception as e:
            logger.error(f"Location generation failed: {e}")
            return self._fallback_location(region)

    async def generate_event(
        self,
        event_type: str = "random",
        season: Optional[str] = None,
    ) -> GeneratedEvent:
        """
        Generate a game event using AI.

        Args:
            event_type: seasonal, random, or story
            season: For seasonal events

        Returns:
            GeneratedEvent object
        """
        llm = await self._get_llm()

        season_str = season or "any season"

        prompt = f"""You are a creative writer for Super Wings, an animated series about robot planes helping children worldwide.

Generate a {event_type} game event for {season_str}.

IMPORTANT: Output ONLY a valid JSON object with these exact fields:
{{
  "name": "Event name (2-4 words)",
  "description": "What happens during this event (1-2 sentences)",
  "trigger": "What starts this event",
  "duration_hours": 24
}}

Example for a seasonal event:
{{
  "name": "Winter Wonderland Festival",
  "description": "Snow falls around the world and children need help with winter activities!",
  "trigger": "December starts",
  "duration_hours": 72
}}

Now generate a unique {event_type} event. Output ONLY the JSON:"""

        config = GenerationConfig(
            max_new_tokens=300,
            temperature=0.8,
        )

        try:
            response = await llm.generate(prompt, config)
            response_text = response.content if hasattr(response, 'content') else str(response)
            data = self._parse_json_response(response_text)

            logger.info(f"Generated event: {data.get('name', 'Unknown')}")

            return GeneratedEvent(
                id=f"event_{random.randint(1000, 9999)}",
                name=data.get("name", "Special Event"),
                type=event_type,
                description=data.get("description", "A special event with bonus rewards!"),
                trigger_conditions={"trigger": data.get("trigger", "random")},
                rewards={"money_multiplier": 1.5, "exp_bonus": 50},
                duration_hours=data.get("duration_hours", 24),
            )

        except Exception as e:
            logger.error(f"Event generation failed: {e}")
            return self._fallback_event(event_type)

    async def generate_batch_missions(
        self,
        count: int = 5,
        variety: bool = True,
    ) -> List[GeneratedMission]:
        """Generate multiple missions at once."""
        missions = []
        used_types = set()

        for _ in range(count):
            mission_type = None
            if variety:
                available = [t for t in self.MISSION_TYPES if t not in used_types]
                if available:
                    mission_type = random.choice(available)
                    used_types.add(mission_type)

            try:
                mission = await self.generate_mission(
                    mission_type=mission_type,
                    difficulty=random.choice(["easy", "medium", "hard"]),
                )
                missions.append(mission)
            except Exception as e:
                logger.error(f"Batch mission generation error: {e}")
                continue

        return missions

    async def generate_world_spec(
        self,
        destination: str,
        mission_type: Optional[str] = None,
        difficulty: str = "normal",
    ) -> Dict[str, Any]:
        """
        Generate a complete world specification using AI.

        Args:
            destination: Destination city/location (e.g., "paris", "tokyo")
            mission_type: Type of mission (affects NPC generation)
            difficulty: Mission difficulty level

        Returns:
            Dict containing complete WorldSpec data
        """
        llm = await self._get_llm()

        # 1. RAG: Retrieve location context
        try:
            location_results = self.knowledge_base.search_locations(destination, top_k=2)
            location_context = "\n".join([r.document.content for r in location_results])
        except Exception as e:
            logger.warning(f"Location context retrieval failed: {e}")
            location_context = ""

        # 2. Generate world atmosphere and theme using LLM
        atmosphere_prompt = f"""You are creating an immersive world for Super Wings in {destination.title()}.

{f"Location context from the series: {location_context}" if location_context else ""}

Generate atmospheric details for this location. Output ONLY a valid JSON object:
{{
  "theme": "{destination}_[time]",
  "time_of_day": "morning/afternoon/evening/night",
  "weather": "clear/cloudy/rainy/snowy",
  "mood": "festive/busy/calm/mysterious",
  "cultural_elements": ["element1", "element2", "element3"]
}}

Example for Paris:
{{
  "theme": "paris_afternoon",
  "time_of_day": "afternoon",
  "weather": "clear",
  "mood": "romantic",
  "cultural_elements": ["cafe culture", "street artists", "fashion boutiques"]
}}

Generate for {destination.title()}. Output ONLY JSON:"""

        try:
            config = GenerationConfig(max_new_tokens=256, temperature=0.8)
            atmosphere_response = await llm.generate(atmosphere_prompt, config)
            atmosphere_data = self._parse_json_response(
                atmosphere_response.content if hasattr(atmosphere_response, 'content') else str(atmosphere_response)
            )

            theme = atmosphere_data.get("theme", f"{destination}_afternoon")
            time_of_day = atmosphere_data.get("time_of_day", "afternoon")
            weather = atmosphere_data.get("weather", "clear")
            cultural_elements = atmosphere_data.get("cultural_elements", [])

            logger.info(f"Generated atmosphere for {destination}: {theme}, {time_of_day}, {weather}")

        except Exception as e:
            logger.error(f"Atmosphere generation failed: {e}, using defaults")
            theme = f"{destination}_afternoon"
            time_of_day = "afternoon"
            weather = "clear"
            cultural_elements = []

        # 3. Generate NPCs using LLM
        npc_count = random.randint(10, 12)
        npcs_data = await self._generate_npcs_batch(
            destination, npc_count, cultural_elements, mission_type
        )

        # 4. Return complete WorldSpec (procedural generation for buildings/items)
        # Buildings and items use procedural generation for now
        from backend.api.routers.world import generate_npc_position, BUILDING_TYPES

        # Generate NPC positions with proper spacing
        npc_positions = []
        npcs = []
        for i, npc_data in enumerate(npcs_data):
            x, y = generate_npc_position(npc_positions, min_distance=150)
            npc_positions.append((x, y))

            npcs.append({
                "id": f"npc_{destination}_{i+1:03d}",
                "name": npc_data["name"],
                "type": npc_data["type"],
                "archetype": npc_data.get("archetype", "resident"),
                "x": x,
                "y": y,
                "dialogue": npc_data["dialogue"],
                "personality": npc_data.get("personality", "friendly"),
                "has_quest": npc_data.get("has_quest", False),
            })

        # Generate buildings (procedural)
        building_count = random.randint(3, 5)
        buildings = []
        building_positions = []

        for i in range(building_count):
            x = random.uniform(300, 1700)
            y = 400

            while any(abs(x - bx) < 300 for bx, _ in building_positions):
                x = random.uniform(300, 1700)

            building_positions.append((x, y))
            building_type = random.choice(BUILDING_TYPES)

            buildings.append({
                "id": f"building_{building_type}_{i+1:03d}",
                "name": f"{building_type.title()} #{i+1}",
                "type": building_type,
                "x": x,
                "y": y,
                "width": random.uniform(120, 180),
                "height": random.uniform(150, 250),
                "can_enter": building_type in ["shop", "cafe", "restaurant"]
            })

        # Generate items (procedural)
        item_count = random.randint(5, 8)
        items = []

        for i in range(item_count):
            item_type = random.choice(["coin", "coin", "coin", "package", "collectible"])
            items.append({
                "id": f"item_{item_type}_{i+1:03d}",
                "name": item_type.title(),
                "type": item_type,
                "x": random.uniform(200, 1800),
                "y": 500,
                "value": random.randint(5, 20) if item_type == "coin" else random.randint(50, 100)
            })

        # Select background
        backgrounds = {
            "paris": ["paris_sunset_clear", "paris_afternoon_clear", "paris_evening_cloudy"],
            "tokyo": ["tokyo_night_clear", "tokyo_afternoon_clear"],
            "london": ["london_afternoon_cloudy", "london_evening_rainy"],
        }
        background_key = random.choice(backgrounds.get(destination, [f"{destination}_afternoon_clear"]))

        return {
            "destination": destination,
            "theme": theme,
            "background_key": background_key,
            "time_of_day": time_of_day,
            "weather": weather,
            "npcs": npcs,
            "buildings": buildings,
            "items": items,
            "pois": [],
        }

    async def _generate_npcs_batch(
        self,
        destination: str,
        count: int,
        cultural_elements: List[str],
        mission_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Generate multiple NPCs using LLM."""
        llm = await self._get_llm()

        cultural_note = ""
        if cultural_elements:
            cultural_note = f"\nCultural elements to consider: {', '.join(cultural_elements)}"

        prompt = f"""You are creating NPCs for Super Wings in {destination.title()}.{cultural_note}

Generate {count} diverse NPCs with appropriate names for {destination}. Include residents, shopkeepers, travelers, children, and elderly.

Output ONLY a valid JSON array:
[
  {{
    "name": "Culturally appropriate name",
    "type": "resident/shopkeeper/traveler/child/elder",
    "archetype": "{destination}_[role]",
    "personality": "friendly/curious/busy/relaxed/shy",
    "dialogue": ["greeting", "helpful comment", "farewell"],
    "has_quest": true/false
  }}
]

Example for Paris (3 NPCs):
[
  {{
    "name": "Sophie",
    "type": "shopkeeper",
    "archetype": "paris_baker",
    "personality": "friendly",
    "dialogue": ["Bonjour! Welcome to my bakery!", "Would you like to try our croissants?", "Au revoir, have a wonderful day!"],
    "has_quest": true
  }},
  {{
    "name": "Pierre",
    "type": "resident",
    "archetype": "paris_artist",
    "personality": "creative",
    "dialogue": ["Ah, bonjour mon ami!", "I'm painting the Eiffel Tower today.", "Art is life, non?"],
    "has_quest": false
  }},
  {{
    "name": "Marie",
    "type": "child",
    "archetype": "paris_student",
    "personality": "curious",
    "dialogue": ["Hello! Are you a robot plane?", "Can you fly me to school?", "Wow, so cool!"],
    "has_quest": true
  }}
]

Generate {count} diverse NPCs for {destination.title()}. Output ONLY the JSON array:"""

        try:
            config = GenerationConfig(max_new_tokens=2048, temperature=0.9)  # Increased for batch NPC generation
            response = await llm.generate(prompt, config)
            response_text = response.content if hasattr(response, 'content') else str(response)

            # Parse JSON array
            try:
                npcs_data = self._parse_json_response(response_text)
            except Exception as parse_error:
                logger.warning(f"Could not parse JSON from response: {response_text[:200]}")
                logger.error(f"Parse error: {parse_error}")
                raise

            # Ensure it's a list
            if isinstance(npcs_data, dict):
                npcs_data = [npcs_data]
            elif not isinstance(npcs_data, list):
                logger.error(f"NPC response is not a list or dict: {type(npcs_data)}")
                raise ValueError("Invalid NPC data format")

            logger.info(f"Generated {len(npcs_data)} NPCs for {destination}")

            # Fill with fallback if not enough NPCs
            if len(npcs_data) < count:
                logger.warning(f"Only got {len(npcs_data)} NPCs, filling rest with fallback")
                fallback_npcs = self._fallback_npcs(destination, count - len(npcs_data))
                npcs_data.extend(fallback_npcs)

            return npcs_data[:count]  # Limit to requested count

        except Exception as e:
            logger.error(f"NPC generation failed: {e}, using fallback")
            return self._fallback_npcs(destination, count)

    def _fallback_npcs(self, destination: str, count: int) -> List[Dict[str, Any]]:
        """Fallback NPC generation if LLM fails."""
        npc_names = ["Alex", "Sophie", "Charlie", "Emma", "Oliver", "Mia", "Lucas", "Lily"]
        types = ["resident", "shopkeeper", "traveler", "child"]
        personalities = ["friendly", "curious", "busy", "relaxed"]

        npcs = []
        for i in range(count):
            name = random.choice(npc_names)
            npc_type = random.choice(types)

            npcs.append({
                "name": f"{name} {i+1}" if i > 0 else name,
                "type": npc_type,
                "archetype": f"{destination}_{npc_type}",
                "personality": random.choice(personalities),
                "dialogue": [
                    f"Hello! Welcome to {destination.title()}!",
                    "How can I help you?",
                    "Have a great day!"
                ],
                "has_quest": random.random() < 0.2
            })

        return npcs

    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from LLM response."""
        # Try to find JSON in the response
        response = response.strip()

        # Remove markdown code blocks if present
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]

        try:
            return json.loads(response.strip())
        except json.JSONDecodeError as e:
            logger.debug(f"Initial JSON parse failed: {e}")

            # Try to find JSON object in response
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                try:
                    return json.loads(response[start:end])
                except json.JSONDecodeError:
                    pass

            # Try to fix truncated JSON by finding the last complete field
            if start != -1:
                json_str = response[start:]
                # Find the last complete string value
                last_quote = json_str.rfind('"')
                if last_quote > 0:
                    # Check if this is the end of a value or a key
                    before_quote = json_str[:last_quote].rstrip()
                    if before_quote.endswith(':'):
                        # It's a value start, find the matching quote
                        pass
                    else:
                        # Try to close after the last complete value
                        truncated = json_str[:last_quote+1]
                        # Remove trailing incomplete parts
                        truncated = truncated.rstrip(',').rstrip()
                        if not truncated.endswith('}'):
                            truncated += '}'
                        try:
                            return json.loads(truncated)
                        except json.JSONDecodeError:
                            pass

            logger.warning(f"Could not parse JSON from response: {response[:200]}...")
            return {}

    def _fallback_mission(
        self,
        mission_type: str,
        location: Optional[str],
        difficulty: str,
    ) -> GeneratedMission:
        """Return a fallback mission when AI fails."""
        templates = {
            "delivery": ("Special Delivery", "Deliver an important package to someone who needs it.", "The package must arrive before sunset.", "Jett speeds through the sky to make the delivery on time."),
            "rescue": ("Emergency Rescue", "Help someone who is stuck or in danger.", "A child is stranded and needs help.", "Chase uses his rescue tools to save the day."),
            "construction": ("Building Project", "Help build something amazing.", "A structure needs to be built for a special event.", "Donnie brings his construction tools and expertise."),
            "performance": ("Show Time", "Help with a special performance.", "The show is about to start but something is missing.", "Jerome dances and entertains while the team solves the problem."),
            "security": ("Safety Patrol", "Keep everyone safe during an event.", "Suspicious activity has been reported.", "Paul investigates and ensures everyone's safety."),
            "tracking": ("Wildlife Watch", "Track and help animals in the wild.", "An animal has gone missing from the sanctuary.", "Bello uses his tracking skills to find the lost animal."),
            "underwater": ("Ocean Adventure", "Explore and help underwater.", "Something valuable is lost beneath the waves.", "Flip dives deep to recover the treasure."),
            "towing": ("Tow Truck Rescue", "Help vehicles that are stuck or broken down.", "A vehicle is stranded and blocking traffic.", "Todd tows the vehicle to safety."),
        }

        template = templates.get(mission_type, ("Adventure Time", "Go on an exciting adventure.", "Someone needs help with an unusual problem.", "The Super Wings team works together to help!"))
        locations = ["Paris, France", "Tokyo, Japan", "New York, USA", "Sydney, Australia", "Cairo, Egypt", "London, UK", "Rio de Janeiro, Brazil"]

        difficulty_multiplier = {"easy": 1.0, "medium": 1.5, "hard": 2.0}.get(difficulty, 1.0)

        return GeneratedMission(
            id=f"m_fallback_{random.randint(1000, 9999)}",
            title=template[0],
            type=mission_type,
            location=location or random.choice(locations),
            description=template[1],
            npc_name="Alex",
            problem=template[2],
            solution=template[3],
            objectives=[{"type": "main", "description": template[1]}],
            rewards={"money": int(100 * difficulty_multiplier), "exp": int(50 * difficulty_multiplier)},
            difficulty=difficulty,
            fuel_cost=int(10 * difficulty_multiplier),
            duration=int(60 * difficulty_multiplier),
        )

    def _fallback_location(self, region: str) -> GeneratedLocation:
        """Return a fallback location when AI fails."""
        region_templates = {
            "Asia": ("Tokyo", "Japan", "A bustling city where ancient temples meet modern skyscrapers.", "Tokyo has more than 100,000 restaurants!"),
            "Europe": ("Paris", "France", "The city of lights with beautiful architecture and art.", "The Eiffel Tower was supposed to be temporary!"),
            "North America": ("New York", "USA", "The city that never sleeps with towering buildings.", "Central Park is bigger than some small countries!"),
            "South America": ("Rio de Janeiro", "Brazil", "A colorful city famous for its carnival and beaches.", "The Christ the Redeemer statue is one of the New 7 Wonders!"),
            "Africa": ("Cairo", "Egypt", "An ancient city near the pyramids and the Nile River.", "The pyramids are over 4,500 years old!"),
            "Oceania": ("Sydney", "Australia", "A harbor city with the famous Opera House.", "The Sydney Opera House has over 1 million roof tiles!"),
            "Polar": ("Reykjavik", "Iceland", "A city where you can see the Northern Lights.", "Iceland has no mosquitoes!"),
        }

        template = region_templates.get(region, ("Adventure Town", "Worldwide", "A wonderful place to explore!", "Every place has a story to tell!"))

        return GeneratedLocation(
            id=f"loc_fallback_{random.randint(100, 999)}",
            name=template[0],
            country=template[1],
            region=region,
            description=template[2],
            cultural_notes=template[3],
            landmarks=["Town Square", "Local Park", "Community Center"],
            common_problems=["deliveries", "celebrations", "helping neighbors"],
        )

    def _fallback_event(self, event_type: str) -> GeneratedEvent:
        """Return a fallback event when AI fails."""
        event_templates = {
            "seasonal": ("Holiday Helpers", "Special missions during the holiday season with bonus rewards!", "Holiday season begins"),
            "random": ("Super Wings Day", "A special day to celebrate helping others around the world!", "Random occurrence"),
            "story": ("World Tour Challenge", "Complete missions across all continents for epic rewards!", "Player reaches level 10"),
        }

        template = event_templates.get(event_type, ("Special Event", "A special event with bonus rewards for all pilots!", "Random"))

        return GeneratedEvent(
            id=f"event_fallback_{random.randint(100, 999)}",
            name=template[0],
            type=event_type,
            description=template[1],
            trigger_conditions={"trigger": template[2]},
            rewards={"money_multiplier": 1.5, "exp_bonus": 50},
            duration_hours=24,
        )


# Singleton instance
_content_generator: Optional[ContentGeneratorAgent] = None


def get_content_generator() -> ContentGeneratorAgent:
    """Get the singleton content generator agent."""
    global _content_generator
    if _content_generator is None:
        _content_generator = ContentGeneratorAgent()
    return _content_generator
