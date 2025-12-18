"""
Campaign generation router for Super Wings Simulator.
Provides structured, multi-mission campaigns with AI-assisted or template fallbacks.
"""

import logging
import secrets
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)
router = APIRouter()

# Use cryptographically secure random number generator
_rng = secrets.SystemRandom()


class CampaignGenerationRequest(BaseModel):
    """Request body for campaign generation."""

    theme: Optional[str] = Field(
        default=None,
        description="Campaign theme or keyword, e.g. global_warming, rescue, festival",
    )
    length: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Number of missions in the campaign",
    )
    preferred_types: Optional[List[str]] = Field(
        default=None,
        description="Optional list of mission types to prioritize",
    )
    location_hints: Optional[List[str]] = Field(
        default=None,
        description="Optional list of locations to prefer",
    )

    @validator("preferred_types", "location_hints")
    def empty_to_none(cls, v):
        """Normalize empty lists to None for simpler handling."""
        if v == []:
            return None
        return v


class MissionObjective(BaseModel):
    """Structure describing a mission objective."""

    type: str = Field(description="Objective type, e.g. deliver, rescue, collect, chase")
    description: str = Field(description="Short player-facing description")
    target_npc_id: Optional[str] = Field(default=None, description="NPC involved in the objective")
    collectible_count: Optional[int] = Field(default=None, description="Count of items to collect/deliver")
    time_limit: Optional[int] = Field(default=None, description="Seconds allowed for the objective")
    success_condition: Optional[str] = Field(default=None, description="Clear condition for completion")


class CampaignMission(BaseModel):
    """Single mission within a campaign."""

    id: str
    title: str
    mission_type: str
    location: str
    synopsis: str
    objectives: List[MissionObjective]
    rewards: Dict[str, Any]


class CampaignResponse(BaseModel):
    """Structured campaign response."""

    campaign_id: str
    theme: Optional[str]
    mission_count: int
    missions: List[CampaignMission]


MISSION_TYPES = [
    "Delivery",
    "Rescue",
    "Construction",
    "Sports",
    "Police",
    "Nature",
    "Chase",
]

DEFAULT_LOCATIONS = [
    "Paris",
    "New York",
    "Beijing",
    "London",
    "Tokyo",
    "Sydney",
    "Cairo",
    "Rio de Janeiro",
    "Moscow",
    "Rome",
    "Antarctica",
    "Amazon Rainforest",
    "Himalayas",
]

NPC_POOL = [
    "Mina",
    "Leo",
    "Professor Kim",
    "Captain Mira",
    "Farmer Luis",
    "Ranger Ada",
    "Chef Paolo",
]


def _pick_mission_type(request: CampaignGenerationRequest, index: int) -> str:
    """Pick a mission type honoring preferences when provided."""
    candidates = request.preferred_types or MISSION_TYPES
    # Cycle preferences if provided, otherwise sample
    if request.preferred_types:
        return candidates[index % len(candidates)]
    return _rng.choice(candidates)


def _pick_location(request: CampaignGenerationRequest) -> str:
    """Pick a location honoring hints when provided."""
    if request.location_hints:
        return _rng.choice(request.location_hints)
    return _rng.choice(DEFAULT_LOCATIONS)


def _build_objectives(mission_type: str, location: str) -> List[MissionObjective]:
    """Create lightweight objectives tailored to mission type."""
    npc = _rng.choice(NPC_POOL)

    if mission_type.lower() == "delivery":
        return [
            MissionObjective(
                type="deliver",
                description=f"將包裹送達 {npc}（地點：{location}）",
                target_npc_id=npc,
                collectible_count=1,
                success_condition="抵達指定位置並完成交付",
            ),
        ]
    if mission_type.lower() == "rescue":
        return [
            MissionObjective(
                type="rescue",
                description=f"救援受困的 {npc}，清理路障",
                target_npc_id=npc,
                time_limit=120,
                success_condition="在時限內抵達並拖離障礙",
            ),
        ]
    if mission_type.lower() == "chase":
        return [
            MissionObjective(
                type="chase",
                description="追上逃跑的無人機，避免撞擊障礙",
                time_limit=90,
                success_condition="保持追擊進度條達到 100%",
            ),
        ]
    if mission_type.lower() == "sports":
        return [
            MissionObjective(
                type="collect",
                description="收集 10 個飛行金幣並完成空中技巧",
                collectible_count=10,
                success_condition="金幣收集完且未受傷",
            ),
        ]
    if mission_type.lower() == "construction":
        return [
            MissionObjective(
                type="assemble",
                description="運送零件並在工地組裝支架",
                collectible_count=3,
                success_condition="所有支架按順序完成",
            ),
        ]
    return [
        MissionObjective(
            type="assist",
            description=f"協助 {npc} 完成 {mission_type} 任務",
            target_npc_id=npc,
            success_condition="互動提示全部完成",
        ),
    ]


async def _generate_synopsis(
    mission_type: str,
    location: str,
    theme: Optional[str],
) -> str:
    """
    Try to generate a short synopsis using the narrator agent, with template fallback.
    """
    try:
        from ...core.agents import get_narrator_agent, NarrationRequest, NarrationPhase

        narrator = get_narrator_agent()
        narration = await narrator.generate_narration(
            NarrationRequest(
                phase=NarrationPhase.DISPATCH,
                character_id="campaign",
                character_name="Super Wings",
                location=location,
                problem=f"{mission_type} mission about {theme or 'help'}",
            ),
            use_llm=True,
        )
        return narration.text
    except Exception as e:
        logger.warning(f"Narration fallback used for campaign synopsis: {e}")
        return f"A {mission_type} 任務即將在 {location} 展開，主題關於 {theme or '援助'}。"


def _build_rewards(index: int) -> Dict[str, Any]:
    """Create a simple reward block with slight scaling per mission index."""
    base_money = 150 + (index * 50)
    base_exp = 75 + (index * 25)
    return {
        "money": base_money,
        "exp": base_exp,
        "items": [
            {"id": "repair_kit", "count": 1 if index < 2 else 2},
        ],
    }


@router.post("/generate", response_model=CampaignResponse)
async def generate_campaign(request: CampaignGenerationRequest) -> CampaignResponse:
    """
    Generate a structured multi-mission campaign.

    Returns missions with types, objectives, and rewards. Uses AI narration when available,
    and falls back to deterministic templates to keep the endpoint stable.
    """
    try:
        missions: List[CampaignMission] = []
        campaign_id = f"camp_{uuid.uuid4().hex[:8]}"

        for i in range(request.length):
            m_type = _pick_mission_type(request, i)
            location = _pick_location(request)
            objectives = _build_objectives(m_type, location)
            synopsis = await _generate_synopsis(m_type, location, request.theme)

            mission = CampaignMission(
                id=f"m_{uuid.uuid4().hex[:6]}",
                title=f"{m_type} - {location}",
                mission_type=m_type,
                location=location,
                synopsis=synopsis,
                objectives=objectives,
                rewards=_build_rewards(i),
            )
            missions.append(mission)

        return CampaignResponse(
            campaign_id=campaign_id,
            theme=request.theme,
            mission_count=len(missions),
            missions=missions,
        )
    except Exception as e:
        logger.error(f"Failed to generate campaign: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate campaign: {str(e)}",
        )
