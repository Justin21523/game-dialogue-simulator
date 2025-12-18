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
from ..asset_manifest import get_asset_manifest

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

        # 3. Generate NPCs using LLM (10-15 個，使用均勻分布算法)
        npc_count = random.randint(10, 15)  # Phase 4: 使用改良的分散算法
        npcs_data = await self._generate_npcs_batch(
            destination, npc_count, cultural_elements, mission_type
        )

        # 4. Return complete WorldSpec (procedural generation for buildings/items)
        # Buildings and items use procedural generation for now
        from backend.api.routers.world import generate_npc_position, BUILDING_TYPES

        # Generate NPC positions with proper spacing (使用網格分布算法)
        npc_positions = []
        npcs = []
        for i, npc_data in enumerate(npcs_data):
            x, y = generate_npc_position(npc_positions, min_distance=200, total_npcs=npc_count)
            npc_positions.append((x, y))

            # ===== Phase 3: 根據 NPC 類型分配行為 =====
            npc_type = npc_data.get("type", "resident")
            behavior, patrol_path, wander_radius = self._assign_npc_behavior(npc_type, x, y)

            npcs.append({
                "id": f"npc_{destination}_{i+1:03d}",
                "name": npc_data["name"],
                "type": npc_type,
                "archetype": npc_data.get("archetype", "resident"),
                "x": x,
                "y": y,
                "dialogue": npc_data["dialogue"],
                "personality": npc_data.get("personality", "friendly"),
                "has_quest": npc_data.get("has_quest", False),

                # Phase 3: 行為資訊
                "behavior": behavior,
                "patrol_path": patrol_path,
                "wander_radius": wander_radius
            })

        # Generate buildings (使用 AI + 程序化混合)
        building_count = random.randint(5, 8)
        buildings = await self._generate_buildings_ai(
            destination, building_count, cultural_elements, BUILDING_TYPES
        )

        # Generate items (程序化生成，增加到 8-12 個)
        item_count = random.randint(8, 12)
        items = self._generate_items_procedural(destination, item_count)

        # Select background using AssetManifest
        manifest = get_asset_manifest()
        available_backgrounds = manifest.get_available_backgrounds(destination)

        if available_backgrounds:
            background_key = random.choice(available_backgrounds)
            logger.info(f"✅ Selected background: {background_key} (from {len(available_backgrounds)} options)")
        else:
            # Fallback: 從所有背景中隨機選擇
            logger.warning(f"⚠️ No backgrounds found for {destination}, using fallback")
            all_backgrounds = manifest.get_available_backgrounds()
            background_key = random.choice(all_backgrounds) if all_backgrounds else f"{destination}_afternoon_clear"

        # Validate background_key
        if not manifest.validate_asset_key(background_key, "backgrounds"):
            logger.warning(f"⚠️ Background key '{background_key}' not found in manifest, using fallback")
            background_key = manifest.get_random_background(destination) or f"{destination}_afternoon_clear"

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
        """Generate multiple NPCs using LLM (分批生成，更可靠)."""
        # 分批生成：每次 4 個 NPC，避免 JSON 截斷
        batch_size = 4
        batches = (count + batch_size - 1) // batch_size  # 向上取整
        all_npcs = []

        logger.info(f"Generating {count} NPCs in {batches} batches of {batch_size}")

        for batch_num in range(batches):
            current_batch_size = min(batch_size, count - len(all_npcs))
            if current_batch_size <= 0:
                break

            try:
                batch_npcs = await self._generate_npc_batch_single(
                    destination, current_batch_size, cultural_elements, batch_num
                )
                all_npcs.extend(batch_npcs)
                logger.info(f"Batch {batch_num+1}/{batches}: Generated {len(batch_npcs)} NPCs (total: {len(all_npcs)})")
            except Exception as e:
                logger.error(f"Batch {batch_num+1} failed: {e}, using fallback for remaining")
                # 用 fallback 填充剩餘部分
                remaining = count - len(all_npcs)
                if remaining > 0:
                    fallback_npcs = self._fallback_npcs(destination, remaining, start_index=len(all_npcs))
                    all_npcs.extend(fallback_npcs)
                break

        return all_npcs[:count]

    async def _generate_npc_batch_single(
        self,
        destination: str,
        count: int,
        cultural_elements: List[str],
        batch_num: int = 0
    ) -> List[Dict[str, Any]]:
        """Generate a single batch of NPCs using LLM."""
        llm = await self._get_llm()

        # 文化適應的名字提示
        name_hints = self._get_cultural_name_hints(destination)
        cultural_note = ""
        if cultural_elements:
            cultural_note = f"\nCultural elements: {', '.join(cultural_elements[:3])}"  # 限制 3 個元素

        # 優化的 Prompt（更明確的指示）
        prompt = f"""Generate ONLY a JSON array. No explanation or extra text.

Location: {destination.title()}{cultural_note}
{name_hints}

Output format (EXACTLY {count} NPCs):
[
  {{"name":"Name","type":"resident","personality":"friendly","dialogue":["Hi!","Help?","Bye!"],"quest":false}},
  {{"name":"Name2","type":"shopkeeper","personality":"curious","dialogue":["Welcome!","Can I help?","Goodbye!"],"quest":false}}
]

Types: resident, shopkeeper, traveler, child, elder
Personalities: friendly, curious, busy, relaxed, shy

JSON array with {count} NPCs:"""

        try:
            config = GenerationConfig(max_new_tokens=1200, temperature=0.9)  # 增加到 1200 tokens
            response = await llm.generate(prompt, config)
            response_text = response.content if hasattr(response, 'content') else str(response)

            # Parse JSON
            npcs_data = self._parse_json_response(response_text)

            # Ensure it's a list
            if isinstance(npcs_data, dict):
                npcs_data = [npcs_data]
            elif not isinstance(npcs_data, list):
                logger.warning(f"NPC response is not a list: {type(npcs_data)}, wrapping in list")
                npcs_data = []

            # 標準化格式
            standardized_npcs = []
            for npc in npcs_data:
                if not isinstance(npc, dict):
                    continue

                standardized_npcs.append({
                    "name": npc.get("name", f"NPC {batch_num*4 + len(standardized_npcs)+1}"),
                    "type": npc.get("type", "resident"),
                    "archetype": f"{destination}_{npc.get('type', 'resident')}",
                    "personality": npc.get("personality", "friendly"),
                    "dialogue": npc.get("dialogue", ["Hello!", "How can I help?", "Goodbye!"]),
                    "has_quest": npc.get("quest", npc.get("has_quest", False))
                })

            if len(standardized_npcs) < count:
                logger.warning(f"LLM only generated {len(standardized_npcs)}/{count} NPCs, filling rest")
                remaining = count - len(standardized_npcs)
                fallback = self._fallback_npcs(destination, remaining, start_index=batch_num*4 + len(standardized_npcs))
                standardized_npcs.extend(fallback)

            return standardized_npcs[:count]

        except Exception as e:
            logger.error(f"Single batch NPC generation failed: {e}")
            return self._fallback_npcs(destination, count, start_index=batch_num*4)

    def _get_cultural_name_hints(self, destination: str) -> str:
        """Get culturally appropriate name hints for each destination."""
        name_pools = {
            "paris": "French names: Sophie, Pierre, Marie, Jean, Claire, Antoine, Camille, Lucas",
            "tokyo": "Japanese names: Yuki, Haruto, Sakura, Kenji, Aiko, Takeshi, Hana, Ryu",
            "london": "British names: Oliver, Emma, George, Charlotte, William, Sophie, James, Emily",
            "new_york": "American names: Michael, Sarah, David, Jessica, Chris, Emily, Alex, Olivia",
            "sydney": "Australian names: Jack, Olivia, William, Charlotte, Noah, Mia, Ethan, Ava",
            "rio": "Brazilian names: Lucas, Ana, Gabriel, Maria, Pedro, Julia, Miguel, Sofia",
            "moscow": "Russian names: Ivan, Natasha, Dmitri, Elena, Boris, Svetlana, Alexei, Olga",
            "dubai": "Arabic names: Ahmed, Fatima, Omar, Aisha, Hassan, Layla, Khalid, Noor"
        }
        return name_pools.get(destination, "Use names appropriate for the location.")

    def _fallback_npcs(self, destination: str, count: int, start_index: int = 0) -> List[Dict[str, Any]]:
        """Fallback NPC generation if LLM fails (with cultural names)."""
        # 文化適應的名字池
        cultural_names = {
            "paris": ["Sophie", "Pierre", "Marie", "Jean", "Claire", "Antoine", "Camille", "Lucas"],
            "tokyo": ["Yuki", "Haruto", "Sakura", "Kenji", "Aiko", "Takeshi", "Hana", "Ryu"],
            "london": ["Oliver", "Emma", "George", "Charlotte", "William", "Sophie", "James", "Emily"],
            "new_york": ["Michael", "Sarah", "David", "Jessica", "Chris", "Emily", "Alex", "Olivia"],
            "sydney": ["Jack", "Olivia", "William", "Charlotte", "Noah", "Mia", "Ethan", "Ava"],
            "rio": ["Lucas", "Ana", "Gabriel", "Maria", "Pedro", "Julia", "Miguel", "Sofia"],
            "moscow": ["Ivan", "Natasha", "Dmitri", "Elena", "Boris", "Svetlana", "Alexei", "Olga"],
            "dubai": ["Ahmed", "Fatima", "Omar", "Aisha", "Hassan", "Layla", "Khalid", "Noor"]
        }

        names = cultural_names.get(destination, ["Alex", "Sophie", "Charlie", "Emma", "Oliver", "Mia", "Lucas", "Lily"])
        types = ["resident", "shopkeeper", "traveler", "child"]
        personalities = ["friendly", "curious", "busy", "relaxed"]

        # 文化適應的對話
        greetings = {
            "paris": "Bonjour!",
            "tokyo": "Konnichiwa!",
            "london": "Hello there!",
            "new_york": "Hey!",
            "sydney": "G'day!",
            "rio": "Olá!",
            "moscow": "Privet!",
            "dubai": "Marhaba!"
        }
        greeting = greetings.get(destination, "Hello!")

        npcs = []
        for i in range(count):
            name_index = (start_index + i) % len(names)
            name = names[name_index]
            npc_type = types[i % len(types)]

            npcs.append({
                "name": name,
                "type": npc_type,
                "archetype": f"{destination}_{npc_type}",
                "personality": personalities[i % len(personalities)],
                "dialogue": [
                    f"{greeting} Welcome to {destination.title()}!",
                    "How can I help you?",
                    "Have a great day!"
                ],
                "has_quest": random.random() < 0.2
            })

        return npcs

    async def _generate_buildings_ai(
        self,
        destination: str,
        count: int,
        cultural_elements: List[str],
        building_types: List[str]
    ) -> List[Dict[str, Any]]:
        """Generate buildings using AI with cultural adaptation."""
        llm = await self._get_llm()

        # 構建 prompt
        cultural_context = ", ".join(cultural_elements) if cultural_elements else f"typical {destination} architecture"
        types_list = ", ".join(building_types)

        prompt = f"""Generate {count} buildings for {destination.title()} that reflect {cultural_context}.

Available building types: {types_list}

Output ONLY a valid JSON array of {count} buildings:
[
  {{
    "name": "Building name (e.g., 'Le Petit Café', 'Tokyo Ramen House')",
    "type": "one of: {types_list}",
    "description": "Brief description",
    "can_enter": true/false
  }},
  ...
]

Make building names culturally appropriate for {destination.title()}.
Output ONLY the JSON array:"""

        try:
            config = GenerationConfig(max_new_tokens=512, temperature=0.8)
            response = await llm.generate(prompt, config)
            content = response.content if hasattr(response, 'content') else str(response)
            buildings_data = self._parse_json_response(content)

            if not isinstance(buildings_data, list):
                logger.warning("Buildings response not a list, using fallback")
                return self._fallback_buildings(destination, count, building_types)

            # 標準化並添加位置
            buildings = []
            building_positions = []

            for i, building_data in enumerate(buildings_data[:count]):
                # 生成位置（確保不重疊）
                x = random.uniform(300, 1700)
                y = 400

                attempts = 0
                while any(abs(x - bx) < 300 for bx, _ in building_positions) and attempts < 50:
                    x = random.uniform(300, 1700)
                    attempts += 1

                building_positions.append((x, y))

                building_type = building_data.get("type", random.choice(building_types))
                if building_type not in building_types:
                    building_type = random.choice(building_types)

                buildings.append({
                    "id": f"building_{building_type}_{i+1:03d}",
                    "name": building_data.get("name", f"{building_type.title()} #{i+1}"),
                    "type": building_type,
                    "description": building_data.get("description", ""),
                    "x": x,
                    "y": y,
                    "width": random.uniform(120, 180),
                    "height": random.uniform(150, 250),
                    "can_enter": building_data.get("can_enter", building_type in ["shop", "cafe", "restaurant"])
                })

            # 如果生成不足，用 fallback 填充
            if len(buildings) < count:
                remaining = count - len(buildings)
                fallback = self._fallback_buildings(destination, remaining, building_types, start_index=len(buildings))
                # 確保 fallback 建築的位置也不重疊
                for building in fallback:
                    x = random.uniform(300, 1700)
                    attempts = 0
                    while any(abs(x - bx) < 300 for bx, _ in building_positions) and attempts < 50:
                        x = random.uniform(300, 1700)
                        attempts += 1
                    building_positions.append((x, 400))
                    building["x"] = x
                    building["y"] = 400
                buildings.extend(fallback)

            logger.info(f"Generated {len(buildings)} buildings for {destination} (AI)")
            return buildings

        except Exception as e:
            logger.error(f"Building AI generation failed: {e}, using fallback")
            return self._fallback_buildings(destination, count, building_types)

    def _fallback_buildings(
        self,
        destination: str,
        count: int,
        building_types: List[str],
        start_index: int = 0
    ) -> List[Dict[str, Any]]:
        """Fallback building generation if AI fails."""
        # 文化適應的建築名稱
        building_names = {
            "paris": {
                "cafe": ["Le Petit Café", "Café de la Paix", "Brasserie Belle"],
                "shop": ["Boutique Élégance", "La Maison du Pain", "Fleuriste de Paris"],
                "restaurant": ["Le Gourmet", "Bistro Français", "Restaurant du Coin"],
                "landmark": ["Tour Eiffel Miniature", "Arc de Triomphe Model", "Notre Dame Replica"]
            },
            "tokyo": {
                "cafe": ["Tokyo Café", "Sakura Tea House", "Matcha Corner"],
                "shop": ["Tokyo Mart", "Anime Store", "Kimono Shop"],
                "restaurant": ["Ramen House", "Sushi Bar", "Tempura Kitchen"],
                "landmark": ["Tokyo Tower Mini", "Temple Gate", "Pagoda"]
            },
            "london": {
                "cafe": ["The Tea Room", "British Café", "Hyde Park Bistro"],
                "shop": ["London Shop", "Westminster Store", "Thames Market"],
                "restaurant": ["Fish & Chips", "The Pub", "Royal Restaurant"],
                "landmark": ["Big Ben Model", "Tower Bridge Replica", "Palace Gate"]
            }
        }

        default_names = {
            "cafe": "Café",
            "shop": "Shop",
            "restaurant": "Restaurant",
            "landmark": "Landmark",
            "house": "House",
            "office": "Office"
        }

        buildings = []
        dest_names = building_names.get(destination, {})

        for i in range(count):
            building_type = building_types[(start_index + i) % len(building_types)]
            type_names = dest_names.get(building_type, [])

            if type_names:
                name = type_names[i % len(type_names)]
            else:
                name = f"{default_names.get(building_type, building_type.title())} #{start_index + i + 1}"

            buildings.append({
                "id": f"building_{building_type}_{start_index + i + 1:03d}",
                "name": name,
                "type": building_type,
                "description": f"A {building_type} in {destination.title()}",
                "x": 0,  # Will be set by caller
                "y": 0,
                "width": random.uniform(120, 180),
                "height": random.uniform(150, 250),
                "can_enter": building_type in ["shop", "cafe", "restaurant"]
            })

        return buildings

    def _generate_items_procedural(
        self,
        destination: str,
        count: int
    ) -> List[Dict[str, Any]]:
        """Generate items using procedural generation (fast and reliable)."""
        items = []

        # 物品類型權重（更多金幣，較少包裹）
        item_types = ["coin"] * 5 + ["package"] * 2 + ["collectible"] * 1

        for i in range(count):
            item_type = random.choice(item_types)

            # 根據物品類型設定不同的價值
            if item_type == "coin":
                value = random.randint(5, 20)
                name = "Gold Coin"
            elif item_type == "package":
                value = random.randint(50, 100)
                name = "Special Package"
            else:  # collectible
                value = random.randint(30, 60)
                # 文化適應的收藏品名稱
                collectible_names = {
                    "paris": ["Eiffel Tower Model", "Baguette", "French Flag"],
                    "tokyo": ["Lucky Cat", "Origami Crane", "Cherry Blossom"],
                    "london": ["Crown Jewel", "Tea Cup", "Union Jack"],
                    "new_york": ["Statue of Liberty", "Yellow Cab", "Hot Dog"],
                    "sydney": ["Boomerang", "Kangaroo Plush", "Opera House Model"]
                }
                dest_collectibles = collectible_names.get(destination, ["Souvenir", "Treasure", "Artifact"])
                name = random.choice(dest_collectibles)

            items.append({
                "id": f"item_{item_type}_{i+1:03d}",
                "name": name,
                "type": item_type,
                "x": random.uniform(200, 1800),
                "y": 500,
                "value": value
            })

        logger.info(f"Generated {len(items)} items for {destination} (procedural)")
        return items

    def _assign_npc_behavior(
        self,
        npc_type: str,
        x: float,
        y: float
    ) -> tuple[str, List[Dict[str, float]], int]:
        """
        根據 NPC 類型分配行為。

        Returns:
            (behavior, patrol_path, wander_radius)
        """
        # Guard/Shopkeeper → Patrol (巡邏)
        if npc_type in ["guard", "shopkeeper", "security"]:
            patrol_path = self._generate_patrol_path(x, y)
            return ("patrol", patrol_path, 0)

        # Child → Wander (小範圍漫遊)
        elif npc_type in ["child", "kid"]:
            wander_radius = random.randint(150, 250)
            return ("wander", [], wander_radius)

        # Traveler/Explorer → Wander (大範圍漫遊)
        elif npc_type in ["traveler", "explorer", "tourist"]:
            wander_radius = random.randint(250, 400)
            return ("wander", [], wander_radius)

        # Resident → 隨機 Idle 或 Wander
        else:
            rand = random.random()
            if rand < 0.4:
                # 40% Idle
                return ("idle", [], 0)
            else:
                # 60% Wander
                wander_radius = random.randint(150, 300)
                return ("wander", [], wander_radius)

    def _generate_patrol_path(
        self,
        start_x: float,
        start_y: float
    ) -> List[Dict[str, float]]:
        """
        為 NPC 生成巡邏路徑（3-5 個點）。

        Args:
            start_x: NPC 起始 X 座標
            start_y: NPC 起始 Y 座標

        Returns:
            巡邏路徑點列表 [{"x": float, "y": float}, ...]
        """
        num_points = random.randint(3, 5)
        patrol_path = []

        # 第一個點是起始位置
        patrol_path.append({"x": start_x, "y": start_y})

        # 生成剩餘的點（在起始位置周圍 300px 範圍內）
        for i in range(1, num_points):
            offset_x = random.uniform(-300, 300)
            new_x = start_x + offset_x

            # 確保在世界邊界內
            new_x = max(200, min(1800, new_x))

            patrol_path.append({"x": new_x, "y": start_y})

        logger.debug(f"Generated patrol path with {num_points} points starting at ({start_x:.0f}, {start_y:.0f})")
        return patrol_path

    def _parse_json_response(self, response: str):
        """Parse JSON from LLM response (supports both objects and arrays)."""
        # Try to find JSON in the response
        response = response.strip()

        # Remove markdown code blocks if present
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]

        response = response.strip()

        # Try direct parse first
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.debug(f"Initial JSON parse failed: {e}")

        # Try to find JSON array first (for NPC batches)
        array_start = response.find("[")
        array_end = response.rfind("]") + 1
        if array_start != -1 and array_end > array_start:
            try:
                return json.loads(response[array_start:array_end])
            except json.JSONDecodeError:
                # Try to fix truncated array
                json_str = response[array_start:array_end]
                # Find last complete object in array
                last_brace = json_str.rfind("}")
                if last_brace > 0:
                    truncated = json_str[:last_brace+1].rstrip(',').rstrip()
                    if not truncated.endswith(']'):
                        truncated += ']'
                    try:
                        return json.loads(truncated)
                    except json.JSONDecodeError:
                        pass

        # Try to find JSON object (for atmosphere)
        obj_start = response.find("{")
        obj_end = response.rfind("}") + 1
        if obj_start != -1 and obj_end > obj_start:
            try:
                return json.loads(response[obj_start:obj_end])
            except json.JSONDecodeError:
                # Try to fix truncated object
                json_str = response[obj_start:obj_end]
                last_quote = json_str.rfind('"')
                if last_quote > 0:
                    before_quote = json_str[:last_quote].rstrip()
                    if not before_quote.endswith(':'):
                        truncated = json_str[:last_quote+1].rstrip(',').rstrip()
                        if not truncated.endswith('}'):
                            truncated += '}'
                        try:
                            return json.loads(truncated)
                        except json.JSONDecodeError:
                            pass

        logger.warning(f"Could not parse JSON from response: {response[:200]}...")
        return {} if obj_start != -1 else []  # Return empty array if looking for array

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
