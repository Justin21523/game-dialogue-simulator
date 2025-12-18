"""
WorldSpec Schema - AI 生成的世界規格
定義探索模式中動態生成的世界內容
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator


class NPCSpec(BaseModel):
    """NPC 規格"""
    id: str = Field(..., description="NPC ID (唯一)")
    name: str = Field(..., description="NPC 名稱")
    type: str = Field(default="resident", description="NPC 類型：resident, shopkeeper, child, elder")
    archetype: Optional[str] = Field(None, description="NPC 原型：paris_shopkeeper, tokyo_child 等")

    # 位置
    x: float = Field(..., description="X 座標")
    y: float = Field(default=500, description="Y 座標（地面高度）")

    # 外觀
    appearance: Optional[str] = Field(None, description="外觀描述")
    model_key: Optional[str] = Field(None, description="3D 模型 asset key")

    # 對話
    dialogue: List[str] = Field(default_factory=lambda: ["Hello!"], description="對話內容")
    personality: Optional[str] = Field(None, description="性格描述")

    # 任務
    has_quest: bool = Field(default=False, description="是否有任務")
    quest_id: Optional[str] = Field(None, description="任務 ID")

    @validator('x')
    def validate_x(cls, v):
        if v < 0 or v > 2000:
            raise ValueError(f'X coordinate {v} out of bounds (0-2000)')
        return v

    @validator('y')
    def validate_y(cls, v):
        if v < 400 or v > 600:
            raise ValueError(f'Y coordinate {v} out of bounds (400-600)')
        return v


class BuildingSpec(BaseModel):
    """建築物規格"""
    id: str = Field(..., description="建築物 ID")
    name: str = Field(..., description="建築物名稱")
    type: str = Field(..., description="建築類型：shop, cafe, house, landmark")

    # 位置與尺寸
    x: float = Field(..., description="X 座標")
    y: float = Field(default=400, description="Y 座標")
    width: float = Field(default=150, description="寬度")
    height: float = Field(default=200, description="高度")

    # 資產
    asset_key: Optional[str] = Field(None, description="建築物 asset key")

    # 互動
    can_enter: bool = Field(default=False, description="是否可進入")
    interior_id: Optional[str] = Field(None, description="室內場景 ID")

    @validator('x')
    def validate_x(cls, v):
        if v < 0 or v > 2000:
            raise ValueError(f'X coordinate {v} out of bounds (0-2000)')
        return v


class ItemSpec(BaseModel):
    """物品規格"""
    id: str = Field(..., description="物品 ID")
    name: str = Field(..., description="物品名稱")
    type: str = Field(..., description="物品類型：coin, package, collectible")

    # 位置
    x: float = Field(..., description="X 座標")
    y: float = Field(default=500, description="Y 座標")

    # 資產
    asset_key: Optional[str] = Field(None, description="物品 asset key")

    # 屬性
    value: int = Field(default=10, description="物品價值")

    @validator('x')
    def validate_x(cls, v):
        if v < 0 or v > 2000:
            raise ValueError(f'X coordinate {v} out of bounds (0-2000)')
        return v


class POISpec(BaseModel):
    """興趣點規格（Point of Interest）"""
    id: str = Field(..., description="POI ID")
    name: str = Field(..., description="POI 名稱")
    type: str = Field(..., description="POI 類型：landmark, photo_spot, event_trigger")
    x: float = Field(..., description="X 座標")
    y: float = Field(default=500, description="Y 座標")
    description: Optional[str] = Field(None, description="描述")


class WorldSpec(BaseModel):
    """完整的世界規格"""
    # 基本資訊
    destination: str = Field(..., description="目的地名稱：paris, tokyo, london 等")
    theme: str = Field(..., description="場景主題：paris_afternoon, tokyo_night 等")

    # 環境
    background_key: str = Field(..., description="背景圖片 asset key")
    time_of_day: str = Field(default="afternoon", description="時段：morning, afternoon, evening, night")
    weather: str = Field(default="clear", description="天氣：clear, cloudy, rainy")

    # 實體
    npcs: List[NPCSpec] = Field(default_factory=list, description="NPC 列表")
    buildings: List[BuildingSpec] = Field(default_factory=list, description="建築物列表")
    items: List[ItemSpec] = Field(default_factory=list, description="物品列表")
    pois: List[POISpec] = Field(default_factory=list, description="興趣點列表")

    # 元數據
    trace_id: Optional[str] = Field(None, description="追蹤 ID（用於除錯）")
    generation_time: Optional[float] = Field(None, description="生成時間（秒）")

    @validator('npcs')
    def validate_npc_count(cls, v):
        if len(v) > 20:
            raise ValueError(f'Too many NPCs: {len(v)} (max: 20)')
        return v

    @validator('buildings')
    def validate_building_count(cls, v):
        if len(v) > 10:
            raise ValueError(f'Too many buildings: {len(v)} (max: 10)')
        return v

    @validator('items')
    def validate_item_count(cls, v):
        if len(v) > 20:
            raise ValueError(f'Too many items: {len(v)} (max: 20)')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "destination": "paris",
                "theme": "paris_afternoon",
                "background_key": "paris_sunset_clear",
                "time_of_day": "afternoon",
                "weather": "clear",
                "npcs": [
                    {
                        "id": "npc_pierre_001",
                        "name": "Pierre",
                        "type": "shopkeeper",
                        "x": 500,
                        "y": 500,
                        "dialogue": ["Bonjour! Welcome to my shop!"]
                    }
                ],
                "buildings": [
                    {
                        "id": "building_cafe_001",
                        "name": "Café de Paris",
                        "type": "cafe",
                        "x": 800,
                        "y": 400
                    }
                ],
                "items": [
                    {
                        "id": "item_coin_001",
                        "name": "Coin",
                        "type": "coin",
                        "x": 300,
                        "y": 500
                    }
                ]
            }
        }


class WorldGenerationRequest(BaseModel):
    """世界生成請求"""
    destination: str = Field(..., description="目的地")
    mission_type: Optional[str] = Field(None, description="任務類型")
    difficulty: str = Field(default="normal", description="難度：easy, normal, hard")
    trace_id: Optional[str] = Field(None, description="追蹤 ID")


class WorldGenerationResponse(BaseModel):
    """世界生成回應"""
    success: bool = Field(..., description="是否成功")
    world_spec: Optional[WorldSpec] = Field(None, description="世界規格")
    error: Optional[str] = Field(None, description="錯誤訊息")
    generation_time: Optional[float] = Field(None, description="生成時間（秒）")
