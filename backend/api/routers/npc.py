"""
NPC Generation API Router
提供 NPC 動態生成的 API 端點
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field

from ...core.agents.npc_generator import get_npc_generator, GeneratedNPC

router = APIRouter(tags=["npc"])


# ===== Request Models =====

class NPCGenerateRequest(BaseModel):
    """生成 NPC 的請求"""
    location: str = Field(
        default='paris',
        description="地點名稱 (例如：paris, tokyo, london)"
    )
    location_type: str = Field(
        default='outdoor',
        description="地點類型 (outdoor, shop, cafe, library, etc.)"
    )
    role: Optional[str] = Field(
        default=None,
        description="指定角色類型 (可選，例如：shopkeeper, citizen, child)"
    )
    count: int = Field(
        default=1,
        ge=1,
        le=10,
        description="生成 NPC 數量 (1-10)"
    )


class NPCBatchGenerateRequest(BaseModel):
    """批量生成 NPC 的請求"""
    location: str = Field(
        default='paris',
        description="地點名稱"
    )
    npcs_per_type: dict = Field(
        default_factory=lambda: {
            'outdoor': 3,
            'shop': 2,
            'cafe': 2
        },
        description="每種地點類型要生成的 NPC 數量"
    )


# ===== Response Models =====

class NPCGenerateResponse(BaseModel):
    """生成 NPC 的響應"""
    success: bool
    npcs: List[dict]
    count: int
    message: Optional[str] = None


class NPCRolesResponse(BaseModel):
    """NPC 角色資訊響應"""
    roles: List[str]
    personalities: List[str]
    dialogue_styles: List[str]
    location_types: List[str]


# ===== API Endpoints =====

@router.post("/generate", response_model=NPCGenerateResponse)
async def generate_npcs(request: NPCGenerateRequest):
    """
    生成指定數量的 NPC

    **參數**:
    - location: 地點名稱 (例如：paris, tokyo, london)
    - location_type: 地點類型 (outdoor, shop, cafe, library, etc.)
    - role: 指定角色類型 (可選)
    - count: 生成數量 (1-10)

    **返回**:
    - success: 是否成功
    - npcs: 生成的 NPC 列表
    - count: 實際生成數量
    """
    try:
        generator = get_npc_generator()

        npcs = await generator.generate_npc(
            location=request.location,
            location_type=request.location_type,
            role=request.role,
            count=request.count
        )

        # 轉換為 dict 列表
        npc_dicts = [
            {
                'npc_id': npc.npc_id,
                'name': npc.name,
                'role': npc.role,
                'personality': npc.personality,
                'appearance': npc.appearance,
                'dialogue_style': npc.dialogue_style,
                'location_type': npc.location_type,
                'has_quest': npc.has_quest,
                'quest_hint': npc.quest_hint
            }
            for npc in npcs
        ]

        return NPCGenerateResponse(
            success=True,
            npcs=npc_dicts,
            count=len(npc_dicts),
            message=f"成功生成 {len(npc_dicts)} 個 NPC"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"NPC 生成失敗: {str(e)}"
        )


@router.post("/batch", response_model=NPCGenerateResponse)
async def batch_generate_npcs(request: NPCBatchGenerateRequest):
    """
    批量生成不同類型的 NPC

    **參數**:
    - location: 地點名稱
    - npcs_per_type: 每種地點類型要生成的 NPC 數量字典
      例如：{"outdoor": 3, "shop": 2, "cafe": 2}

    **返回**:
    - success: 是否成功
    - npcs: 生成的所有 NPC 列表
    - count: 實際生成總數
    """
    try:
        generator = get_npc_generator()
        all_npcs = []

        for location_type, count in request.npcs_per_type.items():
            if count > 0:
                npcs = await generator.generate_npc(
                    location=request.location,
                    location_type=location_type,
                    count=count
                )
                all_npcs.extend(npcs)

        # 轉換為 dict 列表
        npc_dicts = [
            {
                'npc_id': npc.npc_id,
                'name': npc.name,
                'role': npc.role,
                'personality': npc.personality,
                'appearance': npc.appearance,
                'dialogue_style': npc.dialogue_style,
                'location_type': npc.location_type,
                'has_quest': npc.has_quest,
                'quest_hint': npc.quest_hint
            }
            for npc in all_npcs
        ]

        return NPCGenerateResponse(
            success=True,
            npcs=npc_dicts,
            count=len(npc_dicts),
            message=f"成功批量生成 {len(npc_dicts)} 個 NPC"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"批量 NPC 生成失敗: {str(e)}"
        )


@router.get("/roles", response_model=NPCRolesResponse)
async def get_npc_roles():
    """
    獲取可用的 NPC 角色、性格、對話風格等選項

    **返回**:
    - roles: 可用的角色類型列表
    - personalities: 可用的性格類型列表
    - dialogue_styles: 可用的對話風格列表
    - location_types: 可用的地點類型列表
    """
    generator = get_npc_generator()

    return NPCRolesResponse(
        roles=generator.NPC_ROLES,
        personalities=generator.PERSONALITIES,
        dialogue_styles=generator.DIALOGUE_STYLES,
        location_types=[
            'outdoor', 'shop', 'cafe', 'library',
            'hospital', 'school', 'town_hall', 'warehouse'
        ]
    )


@router.get("/test", response_model=NPCGenerateResponse)
async def test_generate_npcs():
    """
    測試端點：生成 3 個戶外 NPC（巴黎）

    用於快速測試 NPC 生成系統是否正常運作
    """
    try:
        generator = get_npc_generator()

        npcs = await generator.generate_npc(
            location='paris',
            location_type='outdoor',
            count=3
        )

        npc_dicts = [
            {
                'npc_id': npc.npc_id,
                'name': npc.name,
                'role': npc.role,
                'personality': npc.personality,
                'appearance': npc.appearance,
                'dialogue_style': npc.dialogue_style,
                'location_type': npc.location_type,
                'has_quest': npc.has_quest,
                'quest_hint': npc.quest_hint
            }
            for npc in npcs
        ]

        return NPCGenerateResponse(
            success=True,
            npcs=npc_dicts,
            count=len(npc_dicts),
            message="測試成功：生成 3 個巴黎戶外 NPC"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"測試失敗: {str(e)}"
        )
