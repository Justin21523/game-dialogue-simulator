"""
World Generation API Router
動態世界生成 API endpoint
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import time
import random

from backend.schemas.world_spec import (
    WorldGenerationRequest,
    WorldGenerationResponse,
    WorldSpec,
    NPCSpec,
    BuildingSpec,
    ItemSpec
)

router = APIRouter(prefix="/world", tags=["world"])


# ===== 臨時資料：可用的資產 =====
# TODO: 未來從 AssetRegistry 動態載入

AVAILABLE_BACKGROUNDS = {
    "paris": ["paris_sunset_clear", "paris_afternoon_clear", "paris_evening_cloudy"],
    "tokyo": ["tokyo_night_clear", "tokyo_afternoon_clear"],
    "london": ["london_afternoon_cloudy", "london_evening_rainy"],
    "new_york": ["newyork_morning_clear", "newyork_afternoon_clear"],
    "sydney": ["sydney_morning_clear"],
    "rio": ["rio_afternoon_clear"],
    "moscow": ["moscow_evening_clear"],
    "dubai": ["dubai_afternoon_clear"]
}

NPC_ARCHETYPES = {
    "paris": ["paris_shopkeeper", "paris_artist", "paris_waiter", "paris_tourist"],
    "tokyo": ["tokyo_salaryman", "tokyo_student", "tokyo_elder", "tokyo_child"],
    "london": ["london_gentleman", "london_shopkeeper", "london_guard"],
    "default": ["resident", "shopkeeper", "traveler", "local"]
}

BUILDING_TYPES = ["shop", "cafe", "restaurant", "house", "landmark", "park"]


def generate_npc_position(existing_positions: list, min_distance: float = 200, total_npcs: int = 10) -> tuple:
    """
    程序化生成 NPC 位置（改良版 Poisson Disk Sampling）
    確保 NPC 之間不會太近，並均勻分布在整個世界

    Args:
        existing_positions: 已有的 NPC 位置列表
        min_distance: 最小間距（像素）
        total_npcs: 預期總 NPC 數量，用於計算理想間距
    """
    world_width = 1600  # 200-1800
    world_start = 200
    world_end = 1800

    # 如果是第一個 NPC，使用網格分布策略
    if len(existing_positions) < total_npcs:
        # 計算理想間距
        ideal_spacing = world_width / total_npcs
        # 當前 NPC 索引
        index = len(existing_positions)
        # 計算理想 X 位置（加上隨機偏移）
        ideal_x = world_start + (index + 0.5) * ideal_spacing
        offset = random.uniform(-ideal_spacing * 0.3, ideal_spacing * 0.3)
        x = max(world_start, min(world_end, ideal_x + offset))
        y = 500

        # 確保與現有位置不會太近
        too_close = any(
            ((x - ex) ** 2 + (y - ey) ** 2) ** 0.5 < min_distance
            for ex, ey in existing_positions
        )

        if not too_close:
            return x, y

    # Fallback: 隨機搜尋
    max_attempts = 50
    for _ in range(max_attempts):
        x = random.uniform(world_start, world_end)
        y = 500

        # 檢查與現有位置的距離
        too_close = False
        for ex, ey in existing_positions:
            distance = ((x - ex) ** 2 + (y - ey) ** 2) ** 0.5
            if distance < min_distance:
                too_close = True
                break

        if not too_close:
            return x, y

    # 如果找不到合適位置，返回隨機位置（降低最小間距要求）
    return random.uniform(world_start, world_end), 500


@router.post("/generate", response_model=WorldGenerationResponse)
async def generate_world(request: WorldGenerationRequest):
    """
    生成動態世界（使用 LLM AI）

    Args:
        request: 世界生成請求

    Returns:
        WorldGenerationResponse: 包含 WorldSpec 的回應
    """
    start_time = time.time()

    try:
        print(f"[WorldAPI] 🤖 Generating AI world for {request.destination} (trace: {request.trace_id})")

        # ===== 使用 AI 生成 =====
        from backend.core.agents.content_generator import get_content_generator

        try:
            content_gen = get_content_generator()
            world_data = await content_gen.generate_world_spec(
                destination=request.destination,
                mission_type=request.mission_type,
                difficulty=request.difficulty
            )

            # 轉換為 WorldSpec
            world_spec = WorldSpec(
                destination=world_data["destination"],
                theme=world_data["theme"],
                background_key=world_data["background_key"],
                time_of_day=world_data["time_of_day"],
                weather=world_data["weather"],
                npcs=[NPCSpec(**npc) for npc in world_data["npcs"]],
                buildings=[BuildingSpec(**b) for b in world_data["buildings"]],
                items=[ItemSpec(**item) for item in world_data["items"]],
                pois=[],
                trace_id=request.trace_id,
                generation_time=time.time() - start_time
            )

            generation_time = time.time() - start_time

            print(f"[WorldAPI] ✅ AI generated world: {len(world_spec.npcs)} NPCs, {len(world_spec.buildings)} buildings, {len(world_spec.items)} items ({generation_time:.2f}s)")

            return WorldGenerationResponse(
                success=True,
                world_spec=world_spec,
                generation_time=generation_time
            )

        except Exception as ai_error:
            print(f"[WorldAPI] ⚠️ AI generation failed: {ai_error}, falling back to procedural")
            # Fallback to procedural generation if AI fails
            pass

        # ===== Fallback: 程序化生成 =====
        print(f"[WorldAPI] 🎲 Using procedural generation fallback")

        # ===== 1. 選擇背景 =====
        backgrounds = AVAILABLE_BACKGROUNDS.get(request.destination, AVAILABLE_BACKGROUNDS.get("paris", []))
        if not backgrounds:
            backgrounds = ["generic_background"]
        background_key = random.choice(backgrounds)

        # ===== 2. 決定主題 =====
        theme = f"{request.destination}_{random.choice(['morning', 'afternoon', 'evening'])}"
        time_of_day = random.choice(['morning', 'afternoon', 'evening', 'night'])
        weather = random.choice(['clear', 'clear', 'clear', 'cloudy', 'rainy'])  # 70% clear

        # ===== 3. 生成 NPCs =====
        npc_count = random.randint(10, 15)
        npcs = []
        npc_positions = []
        archetypes = NPC_ARCHETYPES.get(request.destination, NPC_ARCHETYPES["default"])

        npc_names_pool = [
            "Alex", "Sophie", "Charlie", "Emma", "Oliver", "Mia",
            "Lucas", "Lily", "Jack", "Grace", "Henry", "Chloe",
            "Pierre", "Marie", "Jean", "Claire", "Jacques", "Isabelle"
        ]

        for i in range(npc_count):
            x, y = generate_npc_position(npc_positions)
            npc_positions.append((x, y))

            npc_type = random.choice(["resident", "resident", "shopkeeper", "traveler"])
            archetype = random.choice(archetypes) if archetypes else "resident"

            # 隨機名字
            name = random.choice(npc_names_pool) if npc_names_pool else f"NPC {i+1}"
            if name in [npc.name for npc in npcs]:
                name = f"{name} {random.randint(1, 99)}"

            npc = NPCSpec(
                id=f"npc_{request.destination}_{i+1:03d}",
                name=name,
                type=npc_type,
                archetype=archetype,
                x=x,
                y=y,
                dialogue=[
                    f"Hello! Welcome to {request.destination.title()}!",
                    "How can I help you today?",
                    "Have a wonderful day!"
                ],
                personality=random.choice(["friendly", "curious", "busy", "relaxed"]),
                has_quest=random.random() < 0.2  # 20% 機率有任務
            )
            npcs.append(npc)

        # ===== 4. 生成建築物 =====
        building_count = random.randint(3, 5)
        buildings = []
        building_positions = []

        for i in range(building_count):
            # 建築物較大，需要更大的間距
            x = random.uniform(300, 1700)
            y = 400

            # 檢查與現有建築的距離
            while any(abs(x - bx) < 300 for bx, _ in building_positions):
                x = random.uniform(300, 1700)

            building_positions.append((x, y))

            building_type = random.choice(BUILDING_TYPES)
            building = BuildingSpec(
                id=f"building_{building_type}_{i+1:03d}",
                name=f"{building_type.title()} #{i+1}",
                type=building_type,
                x=x,
                y=y,
                width=random.uniform(120, 180),
                height=random.uniform(150, 250),
                can_enter=building_type in ["shop", "cafe", "restaurant"]
            )
            buildings.append(building)

        # ===== 5. 生成物品 =====
        item_count = random.randint(5, 8)
        items = []

        for i in range(item_count):
            item_type = random.choice(["coin", "coin", "coin", "package", "collectible"])
            items.append(ItemSpec(
                id=f"item_{item_type}_{i+1:03d}",
                name=item_type.title(),
                type=item_type,
                x=random.uniform(200, 1800),
                y=500,
                value=random.randint(5, 20) if item_type == "coin" else random.randint(50, 100)
            ))

        # ===== 6. 建立 WorldSpec =====
        world_spec = WorldSpec(
            destination=request.destination,
            theme=theme,
            background_key=background_key,
            time_of_day=time_of_day,
            weather=weather,
            npcs=npcs,
            buildings=buildings,
            items=items,
            pois=[],  # 暫時為空
            trace_id=request.trace_id,
            generation_time=time.time() - start_time
        )

        generation_time = time.time() - start_time

        print(f"[WorldAPI] ✅ Generated world: {len(npcs)} NPCs, {len(buildings)} buildings, {len(items)} items ({generation_time:.2f}s)")

        return WorldGenerationResponse(
            success=True,
            world_spec=world_spec,
            generation_time=generation_time
        )

    except Exception as e:
        print(f"[WorldAPI] ❌ Error generating world: {e}")
        import traceback
        traceback.print_exc()

        return WorldGenerationResponse(
            success=False,
            error=str(e),
            generation_time=time.time() - start_time
        )


@router.get("/destinations")
async def get_available_destinations():
    """
    取得可用的目的地列表
    """
    return {
        "destinations": list(AVAILABLE_BACKGROUNDS.keys())
    }


@router.get("/catalog")
async def get_asset_catalog():
    """
    取得資產目錄（背景、NPC 原型等）
    """
    return {
        "backgrounds": AVAILABLE_BACKGROUNDS,
        "npc_archetypes": NPC_ARCHETYPES,
        "building_types": BUILDING_TYPES
    }
