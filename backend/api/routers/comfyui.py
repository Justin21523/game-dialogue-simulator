"""
ComfyUI API router for Super Wings Simulator.
Provides image generation endpoints with WebSocket streaming support.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_comfyui_agent,
    GenerationRequest,
    GenerationResult,
    GenerationType,
    WorkflowStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateRequestBody(BaseModel):
    """Request body for image generation."""
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 40
    cfg_scale: float = 8.0
    sampler: str = "dpmpp_2m"
    scheduler: str = "karras"
    seed: int = -1
    lora_path: Optional[str] = None
    lora_weight: float = 0.9
    generation_type: str = "character_portrait"
    output_filename: Optional[str] = None
    save_to_disk: bool = True


class GenerateResponse(BaseModel):
    """Response for image generation."""
    success: bool
    prompt_id: Optional[str] = None
    images: List[Dict[str, Any]] = []
    output_path: Optional[str] = None
    generation_time_ms: float = 0
    error_message: Optional[str] = None


class ServerStatusResponse(BaseModel):
    """Response for server status check."""
    online: bool
    server_address: str
    queue_pending: int = 0
    queue_running: int = 0


class QueueStatusResponse(BaseModel):
    """Response for queue status."""
    pending: List[Dict[str, Any]] = []
    running: List[Dict[str, Any]] = []


@router.get("/status", response_model=ServerStatusResponse)
async def check_server_status() -> ServerStatusResponse:
    """
    Check if ComfyUI server is online and get queue status.
    """
    agent = get_comfyui_agent()
    online = agent.check_server_status()

    queue_pending = 0
    queue_running = 0

    if online:
        queue_status = agent.get_queue_status()
        queue_pending = len(queue_status.get("queue_pending", []))
        queue_running = len(queue_status.get("queue_running", []))

    return ServerStatusResponse(
        online=online,
        server_address=agent.server_address,
        queue_pending=queue_pending,
        queue_running=queue_running,
    )


@router.get("/queue", response_model=QueueStatusResponse)
async def get_queue_status() -> QueueStatusResponse:
    """
    Get current ComfyUI queue status.
    """
    agent = get_comfyui_agent()
    status = agent.get_queue_status()

    return QueueStatusResponse(
        pending=status.get("queue_pending", []),
        running=status.get("queue_running", []),
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate_image(request: GenerateRequestBody) -> GenerateResponse:
    """
    Generate an image using ComfyUI.

    This is a synchronous endpoint that waits for generation to complete.
    For streaming progress updates, use the WebSocket endpoint.
    """
    try:
        agent = get_comfyui_agent()

        # Check server status
        if not agent.check_server_status():
            raise HTTPException(
                status_code=503,
                detail="ComfyUI server is not available"
            )

        # Parse generation type
        try:
            gen_type = GenerationType(request.generation_type)
        except ValueError:
            gen_type = GenerationType.CHARACTER_PORTRAIT

        # Create generation request
        gen_request = GenerationRequest(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            steps=request.steps,
            cfg_scale=request.cfg_scale,
            sampler=request.sampler,
            scheduler=request.scheduler,
            seed=request.seed,
            lora_path=request.lora_path,
            lora_weight=request.lora_weight,
            generation_type=gen_type,
            output_filename=request.output_filename,
        )

        # Generate image
        result = await agent.generate(gen_request, save_to_disk=request.save_to_disk)

        return GenerateResponse(
            success=result.success,
            prompt_id=result.prompt_id,
            images=result.images,
            output_path=result.output_path,
            generation_time_ms=result.generation_time_ms,
            error_message=result.error_message,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {str(e)}"
        )


@router.post("/workflow/queue")
async def queue_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """
    Queue a raw ComfyUI workflow.

    Use this for custom workflows not covered by the standard generation endpoints.
    """
    try:
        agent = get_comfyui_agent()

        if not agent.check_server_status():
            raise HTTPException(
                status_code=503,
                detail="ComfyUI server is not available"
            )

        from ...core.agents import ComfyUIWorkflow
        comfy_workflow = ComfyUIWorkflow(nodes=workflow)

        result = await agent.queue_workflow_async(comfy_workflow)

        return {
            "success": True,
            "prompt_id": result.get("prompt_id"),
            "number": result.get("number"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Workflow queue failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue workflow: {str(e)}"
        )


@router.get("/history/{prompt_id}")
async def get_history(prompt_id: str) -> Dict[str, Any]:
    """
    Get execution history for a prompt.
    """
    try:
        agent = get_comfyui_agent()
        history = agent.get_history(prompt_id)

        if prompt_id not in history:
            raise HTTPException(
                status_code=404,
                detail=f"No history found for prompt_id: {prompt_id}"
            )

        return history[prompt_id]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get history: {str(e)}"
        )


@router.post("/cancel/{prompt_id}")
async def cancel_generation(prompt_id: str) -> Dict[str, Any]:
    """
    Cancel a running generation.
    """
    try:
        agent = get_comfyui_agent()
        success = agent.cancel_workflow(prompt_id)

        return {
            "success": success,
            "prompt_id": prompt_id,
            "message": "Cancellation requested" if success else "Failed to cancel"
        }

    except Exception as e:
        logger.error(f"Failed to cancel: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel: {str(e)}"
        )


@router.websocket("/ws/{session_id}")
async def generation_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming generation progress.

    Message format (client -> server):
    {
        "type": "generate",
        "prompt": "...",
        "negative_prompt": "...",
        "width": 1024,
        "height": 1024,
        "steps": 40,
        "cfg_scale": 8.0,
        "lora_path": "...",
        "lora_weight": 0.9,
        ...
    }

    Response format (server -> client):
    {
        "type": "queued" | "progress" | "completed" | "error",
        "prompt_id": "...",
        "progress": 0.0-1.0,
        "current_node": "...",
        "images": [...],
        "error": "..."
    }
    """
    await websocket.accept()
    logger.info(f"ComfyUI WebSocket connected: session={session_id}")

    try:
        agent = get_comfyui_agent()

        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "generate")

            if msg_type == "generate":
                try:
                    # Parse generation type
                    gen_type_str = message.get("generation_type", "character_portrait")
                    try:
                        gen_type = GenerationType(gen_type_str)
                    except ValueError:
                        gen_type = GenerationType.CHARACTER_PORTRAIT

                    # Build workflow
                    workflow = agent.build_workflow(
                        prompt=message.get("prompt", ""),
                        negative_prompt=message.get("negative_prompt", ""),
                        width=message.get("width", 1024),
                        height=message.get("height", 1024),
                        steps=message.get("steps", 40),
                        cfg_scale=message.get("cfg_scale", 8.0),
                        sampler=message.get("sampler", "dpmpp_2m"),
                        scheduler=message.get("scheduler", "karras"),
                        seed=message.get("seed", -1),
                        lora_path=message.get("lora_path"),
                        lora_weight=message.get("lora_weight", 0.9),
                        filename_prefix=message.get("output_filename", "SuperWings"),
                    )

                    # Queue workflow
                    queue_result = await agent.queue_workflow_async(workflow)
                    prompt_id = queue_result.get("prompt_id")

                    await websocket.send_json({
                        "type": "queued",
                        "prompt_id": prompt_id,
                        "message": "Workflow queued for execution"
                    })

                    # Stream progress
                    async for progress in agent.stream_progress(prompt_id):
                        if progress.status == WorkflowStatus.COMPLETED:
                            # Get final results
                            history = agent.get_history(prompt_id)
                            images = []

                            if prompt_id in history:
                                outputs = history[prompt_id].get("outputs", {})
                                for node_id, node_output in outputs.items():
                                    if "images" in node_output:
                                        images.extend(node_output["images"])

                            await websocket.send_json({
                                "type": "completed",
                                "prompt_id": prompt_id,
                                "images": images,
                                "message": "Generation complete"
                            })
                            break

                        elif progress.status == WorkflowStatus.FAILED:
                            await websocket.send_json({
                                "type": "error",
                                "prompt_id": prompt_id,
                                "error": progress.message
                            })
                            break

                        else:
                            await websocket.send_json({
                                "type": "progress",
                                "prompt_id": prompt_id,
                                "progress": progress.progress,
                                "current_node": progress.current_node,
                                "message": progress.message
                            })

                except Exception as e:
                    logger.error(f"Generation error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "error": str(e)
                    })

            elif msg_type == "status":
                # Return server status
                online = agent.check_server_status()
                queue_status = agent.get_queue_status() if online else {}

                await websocket.send_json({
                    "type": "status",
                    "online": online,
                    "queue_pending": len(queue_status.get("queue_pending", [])),
                    "queue_running": len(queue_status.get("queue_running", [])),
                })

            elif msg_type == "cancel":
                prompt_id = message.get("prompt_id")
                if prompt_id:
                    success = agent.cancel_workflow(prompt_id)
                    await websocket.send_json({
                        "type": "cancelled",
                        "prompt_id": prompt_id,
                        "success": success
                    })

            else:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Unknown message type: {msg_type}"
                })

    except WebSocketDisconnect:
        logger.info(f"ComfyUI WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"ComfyUI WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
