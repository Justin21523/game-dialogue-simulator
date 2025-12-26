"""
Dialogue API router for Super Wings Simulator.
Provides character dialogue generation with WebSocket streaming support.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_dialogue_agent,
    DialogueRequest,
    NPCDialogueRequest,
    DialogueType,
    MissionPhase,
)
from ...core.rag import get_knowledge_base
from ...core.llm import get_llm

logger = logging.getLogger(__name__)
router = APIRouter()


class DialogueRequestBody(BaseModel):
    """Request body for dialogue generation."""
    character_id: str
    dialogue_type: str = "conversation"
    situation: str
    mission_phase: Optional[str] = None
    emotion: str = "happy"
    speaking_to: str = "child"
    dialogue_history: Optional[List[str]] = None
    location: Optional[str] = None
    problem: Optional[str] = None


class NPCDialogueRequestBody(BaseModel):
    """Request body for NPC dialogue generation."""
    npc_name: str
    location: str
    dialogue_type: str
    problem: str
    cultural_notes: Optional[str] = None
    character_name: Optional[str] = None
    solution_summary: Optional[str] = None


class DialogueResponse(BaseModel):
    """Response for dialogue generation."""
    character_id: str
    dialogue: str
    dialogue_type: str


@router.post("/generate", response_model=DialogueResponse)
async def generate_dialogue(request: DialogueRequestBody) -> DialogueResponse:
    """
    Generate dialogue for a character (non-streaming).
    """
    try:
        agent = get_dialogue_agent()

        # Convert string to enum
        try:
            dialogue_type = DialogueType(request.dialogue_type)
        except ValueError:
            dialogue_type = DialogueType.CONVERSATION

        mission_phase = None
        if request.mission_phase:
            try:
                mission_phase = MissionPhase(request.mission_phase)
            except ValueError:
                pass

        dialogue_request = DialogueRequest(
            character_id=request.character_id,
            dialogue_type=dialogue_type,
            situation=request.situation,
            mission_phase=mission_phase,
            emotion=request.emotion,
            speaking_to=request.speaking_to,
            dialogue_history=request.dialogue_history,
            location=request.location,
            problem=request.problem,
        )

        dialogue = await agent.generate_dialogue(dialogue_request)

        return DialogueResponse(
            character_id=request.character_id,
            dialogue=dialogue,
            dialogue_type=request.dialogue_type,
        )

    except Exception as e:
        logger.error(f"Dialogue generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate dialogue: {str(e)}",
        )


# Removed old /npc/generate endpoint - replaced by AI-driven version below (line 363)


@router.post("/greeting/{character_id}")
async def generate_greeting(
    character_id: str,
    location: str,
    problem: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a mission greeting for a character.
    """
    try:
        agent = get_dialogue_agent()

        request = DialogueRequest(
            character_id=character_id,
            dialogue_type=DialogueType.GREETING,
            situation=f"Starting mission to {location}",
            location=location,
            problem=problem or "help someone",
        )

        greeting = await agent.generate_dialogue(request)

        return {
            "character_id": character_id,
            "greeting": greeting,
            "location": location,
        }

    except Exception as e:
        logger.error(f"Greeting generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate greeting: {str(e)}",
        )


@router.post("/transformation/{character_id}")
async def generate_transformation_call(
    character_id: str,
    situation: str,
) -> Dict[str, Any]:
    """
    Generate a transformation call for a character.
    """
    try:
        agent = get_dialogue_agent()

        request = DialogueRequest(
            character_id=character_id,
            dialogue_type=DialogueType.TRANSFORMATION,
            situation=situation,
        )

        transformation = await agent.generate_dialogue(request)

        return {
            "character_id": character_id,
            "transformation_call": transformation,
            "situation": situation,
        }

    except Exception as e:
        logger.error(f"Transformation call generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate transformation call: {str(e)}",
        )


@router.websocket("/ws/{session_id}")
async def dialogue_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming dialogue generation.

    Message format (client -> server):
    {
        "type": "character_dialogue" | "npc_dialogue",
        "character_id": "jett",  # for character_dialogue
        "npc_name": "Maria",     # for npc_dialogue
        "dialogue_type": "conversation",
        "situation": "...",
        ...other fields...
    }

    Response format (server -> client):
    {
        "type": "dialogue_token" | "dialogue_complete" | "error",
        "token": "...",  # for dialogue_token
        "full_dialogue": "...",  # for dialogue_complete
        "error": "..."  # for error
    }
    """
    await websocket.accept()
    logger.info(f"WebSocket connected: session={session_id}")

    try:
        agent = get_dialogue_agent()

        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "character_dialogue")

            try:
                if msg_type == "character_dialogue":
                    # Parse character dialogue request
                    try:
                        dialogue_type = DialogueType(message.get("dialogue_type", "conversation"))
                    except ValueError:
                        dialogue_type = DialogueType.CONVERSATION

                    mission_phase = None
                    if message.get("mission_phase"):
                        try:
                            mission_phase = MissionPhase(message["mission_phase"])
                        except ValueError:
                            pass

                    request = DialogueRequest(
                        character_id=message["character_id"],
                        dialogue_type=dialogue_type,
                        situation=message.get("situation", ""),
                        mission_phase=mission_phase,
                        emotion=message.get("emotion", "happy"),
                        speaking_to=message.get("speaking_to", "child"),
                        dialogue_history=message.get("dialogue_history"),
                        location=message.get("location"),
                        problem=message.get("problem"),
                    )

                    # Stream dialogue
                    full_dialogue = ""
                    async for token in agent.stream_dialogue(request):
                        full_dialogue += token
                        await websocket.send_json({
                            "type": "dialogue_token",
                            "token": token,
                        })

                    # Send completion
                    await websocket.send_json({
                        "type": "dialogue_complete",
                        "character_id": message["character_id"],
                        "full_dialogue": full_dialogue,
                    })

                elif msg_type == "npc_dialogue":
                    # Parse NPC dialogue request
                    try:
                        dialogue_type = DialogueType(message.get("dialogue_type", "npc_greeting"))
                    except ValueError:
                        dialogue_type = DialogueType.NPC_GREETING

                    request = NPCDialogueRequest(
                        npc_name=message["npc_name"],
                        location=message.get("location", ""),
                        dialogue_type=dialogue_type,
                        problem=message.get("problem", ""),
                        cultural_notes=message.get("cultural_notes"),
                        character_name=message.get("character_name"),
                        solution_summary=message.get("solution_summary"),
                    )

                    # Stream NPC dialogue
                    full_dialogue = ""
                    async for token in agent.stream_npc_dialogue(request):
                        full_dialogue += token
                        await websocket.send_json({
                            "type": "dialogue_token",
                            "token": token,
                        })

                    # Send completion
                    await websocket.send_json({
                        "type": "dialogue_complete",
                        "npc_name": message["npc_name"],
                        "full_dialogue": full_dialogue,
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}",
                    })

            except Exception as e:
                logger.error(f"Dialogue generation error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": str(e),
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass


@router.get("/types")
async def list_dialogue_types() -> Dict[str, Any]:
    """
    List available dialogue types.
    """
    return {
        "character_dialogue_types": [t.value for t in DialogueType if not t.value.startswith("npc_")],
        "npc_dialogue_types": [t.value for t in DialogueType if t.value.startswith("npc_")],
        "mission_phases": [p.value for p in MissionPhase],
    }


# ===== New: AI-driven NPC Dialogue System =====

@router.post("/npc/generate")
async def generate_npc_dialogue(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate NPC dialogue with full AI context and mission awareness.

    This endpoint generates dynamic NPC dialogue based on:
    - NPC personality and type
    - Current mission context
    - Previous interactions
    - World state

    All dialogue content is in English.
    """
    try:
        npc_id = request.get("npc_id", "unknown_npc")
        npc_type = request.get("npc_type", "resident")
        player_id = request.get("player_id", "jett")
        mission_context = request.get("mission_context", {})
        previous_interactions = request.get("previous_interactions", [])
        is_mission_npc = request.get("is_mission_npc", False)
        mission_registered = request.get("mission_registered", False)

        logger.info(f"Generating NPC dialogue for {npc_id} (type={npc_type}, mission_npc={is_mission_npc})")

        # ===== AI Integration: Use RAG + LLM to generate contextual NPC dialogue =====
        try:
            kb = get_knowledge_base()
            llm = get_llm()

            # Query RAG for NPC and mission context
            rag_context = ""
            try:
                if mission_context.get("has_mission"):
                    rag_results = await kb.search_similar(
                        query=f"{npc_type} NPC mission dialogue {player_id}",
                        collection_name="super_wings_missions",
                        n_results=2
                    )
                    if rag_results and rag_results.get('documents'):
                        rag_context = "\n".join(rag_results['documents'][:2])
            except Exception as e:
                logger.warning(f"RAG query failed: {e}")

            # Generate dialogue with AI
            mission_status = "mission NPC not yet registered" if (is_mission_npc and not mission_registered) else \
                            "target NPC for active mission" if mission_context.get("is_target") else \
                            "regular NPC"

            prompt = f"""Generate NPC dialogue for a Super Wings game.

NPC Info:
- ID: {npc_id}
- Type: {npc_type}
- Role: {mission_status}

Player Info:
- Character: {player_id}
- Previous interactions: {len(previous_interactions)} times

Mission Context:
{rag_context[:300] if rag_context else 'No mission context'}

Generate a multi-turn dialogue with 3-5 lines that:
1. Starts with an appropriate greeting for the NPC type
2. Includes meaningful conversation (not just "hello" and "goodbye")
3. Shows NPC personality through dialogue
4. If first interaction: introduce themselves and provide context
5. If mission NPC and not registered: explain their problem naturally across multiple lines
6. If returning player: acknowledge previous interaction and continue conversation

Important: Create NATURAL dialogue with 3-5 distinct lines. Each line should add new information or depth to the conversation.

Return JSON format with:
- lines: array of 3-5 dialogue lines (strings)
- emotion: "happy" | "worried" | "hopeful" | "neutral" | "excited" | "grateful"

Example good response:
{{"lines": ["Hello there! Welcome to our village!", "I'm Maria, the local baker. We make the best bread in the region!", "Have you tried our special cinnamon rolls? They're famous around here!", "If you need anything during your stay, feel free to ask me!"], "emotion": "happy"}}"""

            response = await llm.generate(prompt, max_tokens=300)

            # Try to parse AI response
            try:
                ai_dialogue = json.loads(response.strip())
                if "lines" in ai_dialogue:
                    logger.info(f"AI generated {len(ai_dialogue['lines'])} dialogue lines for {npc_id}")
                    return {
                        "lines": ai_dialogue["lines"],
                        "emotion": ai_dialogue.get("emotion", "neutral"),
                        "can_register_mission": is_mission_npc and not mission_registered,
                        "npc_id": npc_id,
                        "npc_type": npc_type
                    }
            except json.JSONDecodeError:
                logger.warning("AI dialogue not valid JSON, using fallback")

        except Exception as e:
            logger.warning(f"AI dialogue generation failed: {e}, using fallback")

        # Fallback: Template-based multi-turn responses
        dialogue_templates = {
            "merchant": {
                "lines": [
                    "Welcome to my shop! I'm glad you stopped by.",
                    "We have fresh supplies delivered every day from the nearby villages.",
                    "Is there anything special you're looking for today?",
                    "Feel free to browse, and let me know if you need any recommendations!"
                ],
                "emotion": "happy"
            },
            "resident": {
                "lines": [
                    "Hello there! Welcome to our town!",
                    "It's always nice to see new faces around here.",
                    "The weather has been beautiful lately, hasn't it?",
                    "If you need directions or information, I'd be happy to help!"
                ],
                "emotion": "happy"
            },
            "official": {
                "lines": [
                    "Good day. I'm the local official here.",
                    "I handle administrative matters and keep things running smoothly.",
                    "State your business, and I'll see what I can do to assist.",
                    "Everything must be done properly and by the rules, of course."
                ],
                "emotion": "neutral"
            },
            "child": {
                "lines": [
                    "Wow! A real Super Wing! This is so cool!",
                    "I've always wanted to see one up close!",
                    "Can you really fly and transform? That's amazing!",
                    "Maybe one day I can help with a delivery too!"
                ],
                "emotion": "excited"
            },
            "questgiver": {
                "lines": [
                    "Oh, thank goodness someone has arrived!",
                    "I've been hoping a Super Wing would come to help.",
                    "We have a situation here that requires your special skills.",
                    "Would you be willing to hear me out?"
                ],
                "emotion": "worried"
            }
        }

        # Choose template based on NPC type
        template_key = "questgiver" if (is_mission_npc and not mission_registered) else npc_type
        template = dialogue_templates.get(template_key, dialogue_templates["resident"])

        lines = template["lines"].copy()
        emotion = template["emotion"]

        # Add mission-specific lines if needed
        if is_mission_npc and not mission_registered:
            # Already handled by questgiver template
            pass
        elif mission_context.get("is_target"):
            lines = [
                "You're here! I've been waiting for you!",
                "Thank you so much for coming to help.",
                "This means a lot to me and everyone here.",
                "Please, let me know how I can assist with your mission."
            ]
            emotion = "grateful"

        # Add variety for returning players
        if len(previous_interactions) > 0:
            lines[0] = f"Welcome back! It's good to see you again."
            if len(previous_interactions) > 2:
                lines.insert(1, "You've been very helpful around here. Everyone appreciates it!")

        return {
            "lines": lines,
            "emotion": emotion,
            "can_register_mission": is_mission_npc and not mission_registered,
            "npc_id": npc_id,
            "npc_type": npc_type
        }

    except Exception as e:
        logger.error(f"Error generating NPC dialogue: {e}")
        # Return fallback dialogue instead of error
        return {
            "lines": ["Hello! How can I help you?"],
            "emotion": "neutral",
            "can_register_mission": False,
            "error": str(e)
        }


@router.post("/evaluate-interaction")
async def evaluate_npc_interaction(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluate the impact of NPC interaction on the active mission.

    This endpoint determines if an NPC interaction should:
    - Create new subtasks
    - Provide hints
    - Unlock alternative paths
    - Trigger dynamic events

    This is the core of making all NPC interactions potentially meaningful.
    """
    try:
        npc_id = request.get("npc_id")
        npc_type = request.get("npc_type", "resident")
        player_id = request.get("player_id")
        dialogue_content = request.get("dialogue_content", {})
        active_mission = request.get("active_mission")
        interaction_history = request.get("interaction_history", [])

        logger.info(f"Evaluating interaction: player={player_id}, npc={npc_id}, mission={active_mission}")

        # ===== AI Integration: Use RAG + LLM to evaluate NPC interaction impact =====
        try:
            kb = get_knowledge_base()
            llm = get_llm()

            # Query RAG for mission and NPC context
            rag_context = ""
            try:
                if active_mission:
                    rag_results = await kb.search_similar(
                        query=f"{npc_type} NPC mission interaction {active_mission}",
                        collection_name="super_wings_missions",
                        n_results=2
                    )
                    if rag_results and rag_results.get('documents'):
                        rag_context = "\n".join(rag_results['documents'][:2])
            except Exception as e:
                logger.warning(f"RAG query failed: {e}")

            # Use AI to evaluate interaction
            prompt = f"""Evaluate if this NPC interaction should affect the active mission.

NPC Info:
- ID: {npc_id}
- Type: {npc_type}
- Previous interactions: {len(interaction_history)} times

Player: {player_id}
Active Mission: {active_mission}
Dialogue: {dialogue_content}

Mission Context:
{rag_context[:300] if rag_context else 'No mission context'}

Decide if this interaction should:
1. Create subtask (20% chance) - Generate: type, title, description
2. Provide hint (30% chance) - Generate hint text (2-3 sentences)
3. Unlock alternative path (15% chance) - Generate: title, description
4. Trigger event (10% chance) - Generate: event type, description

Return JSON format with: creates_subtask, subtask_data, provides_hint, hint, unlocks_alternative, alternative_data, triggers_event, event_data"""

            response = await llm.generate(prompt, max_tokens=500)

            # Try to parse AI response
            try:
                ai_evaluation = json.loads(response.strip())
                if "creates_subtask" in ai_evaluation:
                    logger.info(f"AI evaluated interaction: subtask={ai_evaluation.get('creates_subtask')}, hint={ai_evaluation.get('provides_hint')}")
                    return ai_evaluation
            except json.JSONDecodeError:
                logger.warning("AI evaluation not valid JSON, using fallback")

        except Exception as e:
            logger.warning(f"AI interaction evaluation failed: {e}, using fallback")

        # Fallback: Simple heuristic logic
        creates_subtask = False
        provides_hint = False
        unlocks_alternative = False
        triggers_event = False

        subtask_data = None
        hint = None
        alternative_data = None
        event_data = None

        if npc_type in ["merchant", "resident"] and active_mission:
            import secrets
            rng = secrets.SystemRandom()
            if rng.random() < 0.3:
                provides_hint = True
                hint = "Try talking to the people near the town square. They might know something."

            if rng.random() < 0.2:
                creates_subtask = True
                subtask_data = {
                    "type": "fetch",
                    "title": "Collect helpful item",
                    "description": "This NPC mentioned an item that might help with the mission.",
                    "targetItems": ["helpful_item"],
                    "optional": True,
                    "isDynamic": True
                }

        if npc_type == "official" and active_mission:
            import secrets
            rng = secrets.SystemRandom()
            if rng.random() < 0.15:
                unlocks_alternative = True
                alternative_data = {
                    "title": "Official Permission",
                    "description": "The official can help you complete the mission in a different way.",
                    "difficulty": "easy"
                }

        return {
            "creates_subtask": creates_subtask,
            "subtask_data": subtask_data,
            "provides_hint": provides_hint,
            "hint": hint,
            "unlocks_alternative": unlocks_alternative,
            "alternative_data": alternative_data,
            "triggers_event": triggers_event,
            "event_data": event_data
        }

    except Exception as e:
        logger.error(f"Error evaluating NPC interaction: {e}")
        # Return no impact instead of error
        return {
            "creates_subtask": False,
            "provides_hint": False,
            "unlocks_alternative": False,
            "triggers_event": False,
            "error": str(e)
        }
