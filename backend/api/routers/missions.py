"""
Missions API router for Super Wings Simulator.
Handles mission dispatch recommendations and mission management.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...core.agents import (
    get_dispatcher_agent,
    get_content_generator,
    get_dialogue_agent,
    MissionRequest,
    DispatchRecommendation,
)
from ...core.rag import get_knowledge_base
from ...core.llm import get_llm

logger = logging.getLogger(__name__)
router = APIRouter()


class DispatchRequestBody(BaseModel):
    """Request body for dispatch recommendation."""
    mission_type: str
    location: str
    problem_description: str
    urgency: str = "normal"
    available_characters: Optional[List[str]] = None


class MissionStartRequest(BaseModel):
    """Request to start a new mission."""
    mission_type: str
    location: str
    problem_description: str
    character_id: str
    npc_name: Optional[str] = None


class MissionAdvanceRequest(BaseModel):
    """Request to advance mission phase."""
    action: Optional[str] = None
    choice: Optional[str] = None


class MissionGenerationRequest(BaseModel):
    """Request to generate a new mission."""
    level: int = 1
    mission_type: Optional[str] = None
    location: Optional[str] = None


@router.post("/generate")
async def generate_mission(request: MissionGenerationRequest) -> Dict[str, Any]:
    """
    Generate a new mission with dynamic content using AI.
    """
    import secrets
    rng = secrets.SystemRandom()

    # 1. Select Type & Location
    mission_types = ["Delivery", "Rescue", "Construction", "Sports", "Police", "Nature"]
    locations = [
        "Paris", "New York", "Beijing", "London", "Tokyo",
        "Sydney", "Cairo", "Rio de Janeiro", "Moscow", "Rome",
        "Antarctica", "Amazon Rainforest", "Himalayas"
    ]

    m_type = request.mission_type or rng.choice(mission_types)
    location = request.location or rng.choice(locations)
    
    # 2. Generate Content (Using Narrator or Template Fallback)
    try:
        from ...core.agents import get_narrator_agent, NarrationRequest, NarrationPhase
        narrator = get_narrator_agent()
        
        # Use narrator to generate a "Dispatch" briefing
        # We simulate a request for the Dispatch phase
        narration_req = NarrationRequest(
            phase=NarrationPhase.DISPATCH,
            character_id="jett", # Default placeholder, will be generic
            character_name="Super Wings",
            location=location,
            problem=f"needs help with a {m_type.lower()} mission",
        )
        
        # Try to generate text (this might fail if LLM not ready, so we wrap)
        briefing = await narrator.generate_narration(narration_req)
        description = briefing.text
        
    except Exception as e:
        logger.warning(f"AI generation failed, using template: {e}")
        description = f"Urgent {m_type} mission in {location}! Please help immediately."

    # 3. Calculate Rewards based on Level
    base_reward = 100 * request.level
    duration = 30 + (request.level * 10)
    fuel_cost = 10 + (request.level * 2)

    return {
        "id": f"m_{rng.randint(1000, 9999)}",
        "title": f"{m_type} in {location}",
        "description": description,
        "type": m_type,
        "location": location,
        "levelReq": request.level,
        "duration": duration,
        "fuelCost": fuel_cost,
        "rewardMoney": int(base_reward * (0.8 + rng.random() * 0.4)),
        "rewardExp": int(50 * request.level)
    }


@router.post("/dispatch/recommend", response_model=DispatchRecommendation)
async def recommend_dispatch(request: DispatchRequestBody) -> DispatchRecommendation:
    """
    Get AI recommendation for which character to dispatch.

    The agent analyzes the mission requirements and recommends the best
    Super Wings character based on their abilities and specializations.
    """
    try:
        dispatcher = get_dispatcher_agent()

        mission_request = MissionRequest(
            mission_type=request.mission_type,
            location=request.location,
            problem_description=request.problem_description,
            urgency=request.urgency,
            available_characters=request.available_characters,
        )

        recommendation = await dispatcher.recommend_dispatch(mission_request)
        return recommendation

    except Exception as e:
        logger.error(f"Dispatch recommendation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate dispatch recommendation: {str(e)}",
        )


@router.get("/dispatch/explain/{character_id}")
async def explain_character_match(
    character_id: str,
    mission_type: str = Query(..., description="Type of mission"),
) -> Dict[str, Any]:
    """
    Explain how well a specific character matches a mission type.
    """
    try:
        dispatcher = get_dispatcher_agent()
        explanation = await dispatcher.explain_character_match(
            character_id=character_id,
            mission_type=mission_type,
        )

        return {
            "character_id": character_id,
            "mission_type": mission_type,
            "explanation": explanation,
        }

    except Exception as e:
        logger.error(f"Character match explanation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to explain character match: {str(e)}",
        )


@router.get("/dispatch/best-for/{mission_type}")
async def get_best_characters(
    mission_type: str,
    top_k: int = Query(default=3, ge=1, le=10),
) -> Dict[str, Any]:
    """
    Get the top recommended characters for a specific mission type.
    """
    try:
        dispatcher = get_dispatcher_agent()
        rankings = await dispatcher.get_best_for_mission_type(
            mission_type=mission_type,
            top_k=top_k,
        )

        return {
            "mission_type": mission_type,
            "rankings": rankings,
        }

    except Exception as e:
        logger.error(f"Best characters lookup failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get best characters: {str(e)}",
        )


# Mission session management (in-memory for now)
_active_missions: Dict[str, Dict[str, Any]] = {}


@router.post("/start")
async def start_mission(request: MissionStartRequest) -> Dict[str, Any]:
    """
    Start a new mission session.
    """
    import uuid

    session_id = str(uuid.uuid4())

    mission_state = {
        "session_id": session_id,
        "mission_type": request.mission_type,
        "location": request.location,
        "problem_description": request.problem_description,
        "character_id": request.character_id,
        "npc_name": request.npc_name,
        "phase": "dispatch",
        "phase_index": 0,
        "events": [],
        "dialogue_history": [],
    }

    _active_missions[session_id] = mission_state

    logger.info(f"Started mission session: {session_id}")

    return {
        "session_id": session_id,
        "status": "started",
        "current_phase": "dispatch",
        "character_id": request.character_id,
    }


@router.get("/progress/{session_id}")
async def get_mission_progress(session_id: str) -> Dict[str, Any]:
    """
    Get the current progress of a mission.
    """
    if session_id not in _active_missions:
        raise HTTPException(status_code=404, detail="Mission session not found")

    mission = _active_missions[session_id]

    return {
        "session_id": session_id,
        "current_phase": mission["phase"],
        "phase_index": mission["phase_index"],
        "character_id": mission["character_id"],
        "location": mission["location"],
        "events_count": len(mission["events"]),
    }


@router.post("/advance/{session_id}")
async def advance_mission(
    session_id: str,
    request: Optional[MissionAdvanceRequest] = None,
) -> Dict[str, Any]:
    """
    Advance the mission to the next phase.
    """
    if session_id not in _active_missions:
        raise HTTPException(status_code=404, detail="Mission session not found")

    mission = _active_missions[session_id]

    # Phase progression
    phases = [
        "dispatch",
        "departure",
        "flying",
        "arrival",
        "meeting_npc",
        "understanding",
        "transformation",
        "solving",
        "resolution",
        "celebration",
        "return",
        "completed",
    ]

    current_index = mission["phase_index"]
    if current_index < len(phases) - 1:
        mission["phase_index"] = current_index + 1
        mission["phase"] = phases[mission["phase_index"]]

    return {
        "session_id": session_id,
        "previous_phase": phases[current_index],
        "current_phase": mission["phase"],
        "completed": mission["phase"] == "completed",
    }


@router.delete("/{session_id}")
async def end_mission(session_id: str) -> Dict[str, str]:
    """
    End and clean up a mission session.
    """
    if session_id not in _active_missions:
        raise HTTPException(status_code=404, detail="Mission session not found")

    del _active_missions[session_id]
    logger.info(f"Ended mission session: {session_id}")

    return {
        "session_id": session_id,
        "status": "ended",
    }


@router.get("/active")
async def list_active_missions() -> Dict[str, Any]:
    """
    List all active mission sessions.
    """
    return {
        "count": len(_active_missions),
        "sessions": [
            {
                "session_id": sid,
                "phase": m["phase"],
                "character_id": m["character_id"],
                "location": m["location"],
            }
            for sid, m in _active_missions.items()
        ],
    }


# ===== 新增：AI 動態任務系統端點 =====

@router.post("/generate-graph")
async def generate_mission_graph(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    生成動態任務圖，支援分支和替代路徑。

    這個端點讓 AI 生成一個任務節點網絡，而非固定的線性流程。
    """
    try:
        destination = request.get("destination", "Unknown")
        difficulty = request.get("difficulty", 1)
        available_characters = request.get("availableCharacters", [])
        mission_type = request.get("mission_type", "delivery")

        logger.info(f"Generating AI mission graph for {destination}, difficulty={difficulty}")

        # ===== AI Integration: Use ContentGenerator to create dynamic mission =====
        try:
            content_gen = get_content_generator()
            llm = get_llm()

            # Use LLM to generate mission graph structure
            prompt = f"""Generate a dynamic mission graph for a {mission_type} mission in {destination}.
Difficulty level: {difficulty}/5
Available characters: {', '.join(available_characters) if available_characters else 'any'}

Create a mission graph with:
1. Multiple entry points (at least 2 different ways to start)
2. Alternative paths and branches (at least 3 alternatives)
3. Different completion methods (at least 2 ways to finish)
4. Node types: talk, explore, fetch, solve, rescue

Return JSON format with nodes array and entry_points array.
Each node should have: id, type, title, description, prerequisites (optional), alternatives (optional)."""

            response = await llm.generate(prompt, max_tokens=800)

            # Try to parse AI response as JSON
            import json
            try:
                ai_graph = json.loads(response.strip())
                if "nodes" in ai_graph:
                    logger.info(f"AI generated {len(ai_graph['nodes'])} mission nodes")
                    return ai_graph
            except json.JSONDecodeError:
                logger.warning("AI response not valid JSON, using fallback structure")

        except Exception as e:
            logger.warning(f"AI generation failed: {e}, using fallback")

        # Fallback: Template-based graph with dynamic content
        return {
            "nodes": [
                {
                    "id": "start",
                    "type": "talk",
                    "title": f"Talk to NPC in {destination}",
                    "alternatives": ["explore_first"],
                    "description": "Learn about the mission details"
                },
                {
                    "id": "explore_first",
                    "type": "explore",
                    "title": "Explore the surroundings first",
                    "alternatives": [],
                    "description": "Optional alternative starting approach"
                },
                {
                    "id": "collect",
                    "type": "fetch",
                    "title": "Collect required items",
                    "prerequisites": ["start"],
                    "description": "Find and collect mission items"
                },
                {
                    "id": "deliver",
                    "type": "fetch",
                    "title": "Deliver items",
                    "prerequisites": ["collect"],
                    "alternatives": ["ask_for_help"],
                    "description": "Hand over items to NPC"
                },
                {
                    "id": "ask_for_help",
                    "type": "talk",
                    "title": "Ask other NPCs for help",
                    "alternatives": [],
                    "description": "Alternative completion method"
                }
            ],
            "entry_points": ["start", "explore_first"]
        }

    except Exception as e:
        logger.error(f"Error generating mission graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-progress")
async def evaluate_mission_progress_ai(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    評估任務進度，AI 建議下一步行動。

    這個端點持續評估玩家的任務進度，並提供動態建議。
    """
    try:
        mission_id = request.get("mission_id")
        completed_nodes = request.get("completed_nodes", [])
        player_actions = request.get("player_actions", [])
        mission_context = request.get("mission_context", {})

        logger.info(f"Evaluating progress for mission {mission_id}, completed {len(completed_nodes)} nodes")

        # ===== AI Integration: Use LLM to evaluate mission progress =====
        try:
            llm = get_llm()

            prompt = f"""Evaluate mission progress and provide suggestions.

Mission ID: {mission_id}
Completed Nodes: {', '.join(completed_nodes) if completed_nodes else 'none yet'}
Recent Actions: {len(player_actions)} actions taken
Mission Context: {mission_context.get('description', 'Unknown mission')}

Based on the progress, provide:
1. Next recommended options (e.g., continue_main_quest, explore_side_quest, seek_help)
2. Helpful hints (2-3 sentences)
3. Any dynamic branches to unlock (optional)
4. Suggested new tasks (optional)

Return JSON format with: next_options (array), hints (array), dynamic_branches (array), suggested_tasks (array)"""

            response = await llm.generate(prompt, max_tokens=500)

            # Try to parse AI response
            import json
            try:
                ai_evaluation = json.loads(response.strip())
                if "next_options" in ai_evaluation:
                    logger.info(f"AI suggested {len(ai_evaluation.get('next_options', []))} next options")
                    return ai_evaluation
            except json.JSONDecodeError:
                logger.warning("AI response not valid JSON, using fallback logic")

        except Exception as e:
            logger.warning(f"AI evaluation failed: {e}, using fallback")

        # Fallback: Rule-based logic
        if len(completed_nodes) >= 2:
            next_options = ["continue_main_quest"]
            hints = ["You're making good progress! Keep going with the main mission."]
        else:
            next_options = ["continue_main_quest", "explore_side_quest"]
            hints = ["You can explore nearby areas, there might be hidden side quests."]

        return {
            "next_options": next_options,
            "hints": hints,
            "dynamic_branches": [],
            "suggested_tasks": []
        }

    except Exception as e:
        logger.error(f"Error evaluating mission progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-completion")
async def evaluate_mission_completion(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    評估任務是否完成，支援替代完成方式。

    這個端點讓 AI 判斷任務是否達成，即使沒有完全按照原定路線。
    """
    try:
        mission_id = request.get("mission_id")
        completed_tasks = request.get("completed_tasks", [])
        alternative_completions = request.get("alternative_completions", [])
        player_progress = request.get("player_progress", {})

        logger.info(f"Evaluating completion for mission {mission_id}, {len(completed_tasks)} tasks done")

        # ===== AI Integration: Use LLM to evaluate mission completion =====
        try:
            llm = get_llm()

            prompt = f"""Evaluate if the mission is complete, considering alternative completion methods.

Mission ID: {mission_id}
Completed Tasks: {completed_tasks}
Alternative Completions: {alternative_completions}
Player Progress: {player_progress}

Evaluate:
1. Is the mission complete? (true/false)
2. Completion type: "full" (all main tasks), "alternative" (creative solution), "partial" (some tasks)
3. Reward modifier: 0.0 to 1.2 (higher for creative alternatives)
4. Summary message for player
5. Can continue? (if not fully complete)

Return JSON format with: is_complete, type, reward_modifier, summary, can_continue"""

            response = await llm.generate(prompt, max_tokens=400)

            # Try to parse AI response
            import json
            try:
                ai_result = json.loads(response.strip())
                if "is_complete" in ai_result:
                    logger.info(f"AI evaluated: {ai_result['type']} completion, modifier={ai_result.get('reward_modifier', 1.0)}")
                    return ai_result
            except json.JSONDecodeError:
                logger.warning("AI response not valid JSON, using fallback logic")

        except Exception as e:
            logger.warning(f"AI completion evaluation failed: {e}, using fallback")

        # Fallback: Rule-based logic
        is_complete = len(completed_tasks) >= 2

        completion_type = "full"
        reward_modifier = 1.0

        if len(alternative_completions) > 0:
            completion_type = "alternative"
            reward_modifier = 0.9  # Alternative completion reward
        elif len(completed_tasks) < 3:
            completion_type = "partial"
            reward_modifier = 0.8

        return {
            "is_complete": is_complete,
            "type": completion_type,
            "reward_modifier": reward_modifier,
            "summary": f"Mission complete! {'(Perfect completion)' if completion_type == 'full' else '(Alternative completion)'}",
            "can_continue": not is_complete
        }

    except Exception as e:
        logger.error(f"Error evaluating mission completion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-state")
async def evaluate_mission_state(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    持續評估任務狀態，用於 AI 任務協調器。

    這個端點每隔一段時間被調用，讓 AI 動態調整任務內容。
    """
    try:
        rag_session_id = request.get("rag_session_id")
        mission = request.get("mission", {})
        game_state = request.get("game_state", {})
        player_actions = request.get("player_actions", [])

        logger.info(f"Evaluating mission state for RAG session {rag_session_id}")

        # ===== AI Integration: Use RAG + LLM to continuously evaluate mission state =====
        try:
            knowledge_base = get_knowledge_base()
            llm = get_llm()

            # Query RAG for mission context
            mission_context = ""
            if rag_session_id and rag_session_id != "offline":
                try:
                    rag_results = await knowledge_base.search_similar(
                        query=f"{mission.get('destination', '')} {mission.get('type', '')} mission",
                        collection_name="super_wings_missions",
                        n_results=3
                    )
                    if rag_results and rag_results.get('documents'):
                        mission_context = "\n".join(rag_results['documents'])
                except Exception as e:
                    logger.warning(f"RAG query failed: {e}")

            # Use LLM with RAG context to evaluate state
            prompt = f"""Evaluate the current mission state and provide dynamic suggestions.

RAG Context:
{mission_context[:500] if mission_context else 'No RAG context available'}

Mission Info:
- ID: {mission.get('id')}
- Destination: {mission.get('destination')}
- Type: {mission.get('type')}
- Progress: {mission.get('progress', 0)}%

Game State:
- Recent Actions: {len(player_actions)} actions
- Player Position: {game_state.get('player_position', 'unknown')}

Based on this, suggest:
1. Suggested events to trigger (e.g., "npc_arrives", "weather_change")
2. New opportunities to unlock (e.g., "shortcut_discovered", "helper_found")
3. Hints for the player (2-3 sentences)
4. Hint urgency level: "low", "medium", "high"

Return JSON format with: suggested_events (array), new_opportunities (array), hints (array), hint_urgency (string)"""

            response = await llm.generate(prompt, max_tokens=500)

            # Try to parse AI response
            import json
            try:
                ai_state = json.loads(response.strip())
                if "hints" in ai_state:
                    logger.info(f"AI suggested {len(ai_state.get('suggested_events', []))} events, urgency={ai_state.get('hint_urgency', 'low')}")
                    return ai_state
            except json.JSONDecodeError:
                logger.warning("AI response not valid JSON, using fallback logic")

        except Exception as e:
            logger.warning(f"AI state evaluation failed: {e}, using fallback")

        # Fallback: Rule-based logic
        suggested_events = []
        new_opportunities = []
        hints = []
        hint_urgency = "low"

        recent_actions_count = len(player_actions)
        if recent_actions_count < 2:
            hints.append("Try talking to nearby NPCs, they might have important information.")
            hint_urgency = "medium"

        return {
            "suggested_events": suggested_events,
            "new_opportunities": new_opportunities,
            "hints": hints,
            "hint_urgency": hint_urgency
        }

    except Exception as e:
        logger.error(f"Error evaluating mission state: {e}")
        # 返回空結果而非錯誤，讓遊戲可以繼續
        return {
            "suggested_events": [],
            "new_opportunities": [],
            "hints": [],
            "hint_urgency": "low",
            "error": str(e)
        }
