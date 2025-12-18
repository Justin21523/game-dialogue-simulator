"""
ComfyUI Workflow Agent for Super Wings Simulator.
Handles communication with ComfyUI server for image generation.
"""

import json
import time
import uuid
import asyncio
import logging
import urllib.request
import urllib.parse
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, AsyncGenerator

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep

logger = logging.getLogger(__name__)


class WorkflowStatus(str, Enum):
    """Workflow execution status."""
    PENDING = "pending"
    QUEUED = "queued"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GenerationType(str, Enum):
    """Type of image generation."""
    CHARACTER_PORTRAIT = "character_portrait"
    CHARACTER_STATE = "character_state"
    CHARACTER_EXPRESSION = "character_expression"
    BACKGROUND = "background"
    UI_ELEMENT = "ui_element"
    TRANSFORMATION = "transformation"
    SCENE_COMPOSITE = "scene_composite"


@dataclass
class WorkflowNode:
    """A node in the ComfyUI workflow."""
    node_id: str
    class_type: str
    inputs: Dict[str, Any]


@dataclass
class ComfyUIWorkflow:
    """Complete ComfyUI workflow representation."""
    nodes: Dict[str, Dict[str, Any]]
    output_node_id: str = "9"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to ComfyUI API format."""
        return self.nodes


class GenerationRequest(BaseModel):
    """Request for image generation."""
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
    generation_type: GenerationType = GenerationType.CHARACTER_PORTRAIT
    output_filename: Optional[str] = None
    metadata: Dict[str, Any] = {}


class GenerationResult(BaseModel):
    """Result of image generation."""
    success: bool
    prompt_id: Optional[str] = None
    images: List[Dict[str, Any]] = []
    output_path: Optional[str] = None
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class WorkflowProgress(BaseModel):
    """Progress update during workflow execution."""
    prompt_id: str
    status: WorkflowStatus
    current_node: Optional[str] = None
    progress: float = 0.0  # 0.0 to 1.0
    message: str = ""
    preview_image: Optional[bytes] = None


# Singleton instance
_comfyui_agent: Optional["ComfyUIWorkflowAgent"] = None


def get_comfyui_agent() -> "ComfyUIWorkflowAgent":
    """Get or create ComfyUIWorkflowAgent singleton."""
    global _comfyui_agent
    if _comfyui_agent is None:
        _comfyui_agent = ComfyUIWorkflowAgent()
    return _comfyui_agent


class ComfyUIWorkflowAgent(BaseAgent):
    """
    Agent for managing ComfyUI workflows and image generation.

    This agent handles:
    - Building ComfyUI workflow JSON
    - Submitting workflows to the ComfyUI queue
    - Monitoring execution progress via WebSocket
    - Retrieving generated images
    """

    def __init__(
        self,
        server_address: str = "127.0.0.1:8188",
        timeout: int = 300,
        output_dir: str = "./assets/generated",
        base_model: str = "sd_xl_base_1.0.safetensors",
    ):
        super().__init__(
            name="comfyui_workflow_agent",
            description="Agent for building and executing ComfyUI workflows",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
        )

        self.server_address = server_address
        self.api_endpoint = f"http://{server_address}/prompt"
        self.ws_endpoint = f"ws://{server_address}/ws"
        self.timeout = timeout
        self.output_dir = Path(output_dir)
        self.base_model = base_model
        self.client_id = str(uuid.uuid4())

        # Active workflows tracking
        self._active_workflows: Dict[str, WorkflowStatus] = {}

        # WebSocket module (lazy loaded)
        self._websocket_module = None

    @property
    def websocket(self):
        """Lazy load websocket module."""
        if self._websocket_module is None:
            try:
                import websocket
                self._websocket_module = websocket
            except ImportError:
                logger.warning("websocket-client not installed, progress tracking disabled")
        return self._websocket_module

    async def get_system_prompt(self) -> str:
        return """You are a ComfyUI workflow management agent.
Your role is to build and execute image generation workflows.
You understand SDXL model architecture, LoRA integration, and ComfyUI node types."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute workflow step."""
        return {"step": step.step_number, "output": "Workflow executed", "success": True}

    def build_workflow(
        self,
        prompt: str,
        negative_prompt: str,
        width: int = 1024,
        height: int = 1024,
        steps: int = 40,
        cfg_scale: float = 8.0,
        sampler: str = "dpmpp_2m",
        scheduler: str = "karras",
        seed: int = -1,
        lora_path: Optional[str] = None,
        lora_weight: float = 0.9,
        filename_prefix: str = "SuperWings",
    ) -> ComfyUIWorkflow:
        """
        Build a complete ComfyUI workflow for SDXL + LoRA generation.

        Args:
            prompt: Positive prompt text
            negative_prompt: Negative prompt text
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg_scale: Classifier-free guidance scale
            sampler: Sampler name (dpmpp_2m, euler, etc.)
            scheduler: Scheduler type (karras, normal, etc.)
            seed: Random seed (-1 for random)
            lora_path: Optional path to LoRA model
            lora_weight: LoRA strength (0.0 to 1.0)
            filename_prefix: Prefix for saved images

        Returns:
            ComfyUIWorkflow ready for execution
        """
        if seed == -1:
            seed = int(time.time()) % 2147483647

        # Base SDXL workflow structure
        workflow = {
            # Checkpoint Loader
            "1": {
                "inputs": {
                    "ckpt_name": self.base_model
                },
                "class_type": "CheckpointLoaderSimple"
            },
            # KSampler
            "3": {
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg_scale,
                    "sampler_name": sampler,
                    "scheduler": scheduler,
                    "denoise": 1.0,
                    "model": ["4", 0] if lora_path else ["1", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                },
                "class_type": "KSampler"
            },
            # Empty Latent Image
            "5": {
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": 1
                },
                "class_type": "EmptyLatentImage"
            },
            # CLIP Text Encode (Positive)
            "6": {
                "inputs": {
                    "text": prompt,
                    "clip": ["1", 1] if not lora_path else ["4", 1]
                },
                "class_type": "CLIPTextEncode"
            },
            # CLIP Text Encode (Negative)
            "7": {
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["1", 1] if not lora_path else ["4", 1]
                },
                "class_type": "CLIPTextEncode"
            },
            # VAE Decode
            "8": {
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["1", 2]
                },
                "class_type": "VAEDecode"
            },
            # Save Image
            "9": {
                "inputs": {
                    "filename_prefix": filename_prefix,
                    "images": ["8", 0]
                },
                "class_type": "SaveImage"
            }
        }

        # Add LoRA loader if specified
        if lora_path:
            lora_name = Path(lora_path).name
            workflow["4"] = {
                "inputs": {
                    "lora_name": lora_name,
                    "strength_model": lora_weight,
                    "strength_clip": lora_weight,
                    "model": ["1", 0],
                    "clip": ["1", 1]
                },
                "class_type": "LoraLoader"
            }

        return ComfyUIWorkflow(nodes=workflow, output_node_id="9")

    def apply_lora(
        self,
        workflow: ComfyUIWorkflow,
        lora_path: str,
        lora_weight: float = 0.9,
    ) -> ComfyUIWorkflow:
        """
        Apply LoRA model to an existing workflow.

        Args:
            workflow: Existing workflow to modify
            lora_path: Path to LoRA model
            lora_weight: LoRA strength

        Returns:
            Modified workflow with LoRA
        """
        nodes = workflow.nodes.copy()
        lora_name = Path(lora_path).name

        # Add LoRA loader node
        nodes["4"] = {
            "inputs": {
                "lora_name": lora_name,
                "strength_model": lora_weight,
                "strength_clip": lora_weight,
                "model": ["1", 0],
                "clip": ["1", 1]
            },
            "class_type": "LoraLoader"
        }

        # Update KSampler to use LoRA model
        if "3" in nodes:
            nodes["3"]["inputs"]["model"] = ["4", 0]

        # Update CLIP encoders to use LoRA clip
        if "6" in nodes:
            nodes["6"]["inputs"]["clip"] = ["4", 1]
        if "7" in nodes:
            nodes["7"]["inputs"]["clip"] = ["4", 1]

        return ComfyUIWorkflow(nodes=nodes, output_node_id=workflow.output_node_id)

    def queue_workflow(self, workflow: ComfyUIWorkflow) -> Dict[str, Any]:
        """
        Submit workflow to ComfyUI queue.

        Args:
            workflow: Workflow to execute

        Returns:
            Queue response with prompt_id
        """
        payload = {
            "prompt": workflow.to_dict(),
            "client_id": self.client_id
        }
        data = json.dumps(payload).encode('utf-8')

        req = urllib.request.Request(
            self.api_endpoint,
            data=data,
            headers={'Content-Type': 'application/json'}
        )

        try:
            response = urllib.request.urlopen(req)
            result = json.loads(response.read())

            prompt_id = result.get('prompt_id')
            if prompt_id:
                self._active_workflows[prompt_id] = WorkflowStatus.QUEUED
                logger.info(f"Workflow queued: {prompt_id}")

            return result
        except Exception as e:
            logger.error(f"Failed to queue workflow: {e}")
            raise

    async def queue_workflow_async(self, workflow: ComfyUIWorkflow) -> Dict[str, Any]:
        """Async version of queue_workflow."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.queue_workflow, workflow)

    def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """
        Get execution history for a prompt.

        Args:
            prompt_id: The prompt ID to query

        Returns:
            History data including outputs
        """
        url = f"http://{self.server_address}/history/{prompt_id}"
        with urllib.request.urlopen(url) as response:
            return json.loads(response.read())

    def get_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        """
        Retrieve generated image from ComfyUI.

        Args:
            filename: Image filename
            subfolder: Subfolder path
            folder_type: Folder type (output, input, temp)

        Returns:
            Image data as bytes
        """
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type
        }
        url_params = urllib.parse.urlencode(params)
        url = f"http://{self.server_address}/view?{url_params}"

        with urllib.request.urlopen(url) as response:
            return response.read()

    def wait_for_completion(
        self,
        prompt_id: str,
        timeout: Optional[int] = None,
        progress_callback: Optional[Callable[[WorkflowProgress], None]] = None,
    ) -> Dict[str, Any]:
        """
        Wait for workflow completion using WebSocket.

        Args:
            prompt_id: Prompt ID to wait for
            timeout: Timeout in seconds (default: self.timeout)
            progress_callback: Optional callback for progress updates

        Returns:
            Execution history with outputs
        """
        if self.websocket is None:
            # Fallback to polling
            return self._poll_for_completion(prompt_id, timeout)

        timeout = timeout or self.timeout
        ws = self.websocket.WebSocket()
        ws.connect(f"{self.ws_endpoint}?clientId={self.client_id}")

        self._active_workflows[prompt_id] = WorkflowStatus.EXECUTING
        start_time = time.time()

        try:
            while True:
                if time.time() - start_time > timeout:
                    self._active_workflows[prompt_id] = WorkflowStatus.FAILED
                    ws.close()
                    raise TimeoutError(f"Workflow timed out after {timeout} seconds")

                out = ws.recv()
                if isinstance(out, str):
                    message = json.loads(out)
                    msg_type = message.get('type')
                    data = message.get('data', {})

                    if msg_type == 'executing':
                        current_node = data.get('node')
                        current_prompt_id = data.get('prompt_id')

                        if current_prompt_id == prompt_id:
                            if current_node is None:
                                # Execution complete
                                self._active_workflows[prompt_id] = WorkflowStatus.COMPLETED
                                break
                            elif progress_callback:
                                progress = WorkflowProgress(
                                    prompt_id=prompt_id,
                                    status=WorkflowStatus.EXECUTING,
                                    current_node=current_node,
                                    message=f"Executing node: {current_node}"
                                )
                                progress_callback(progress)

                    elif msg_type == 'progress' and progress_callback:
                        value = data.get('value', 0)
                        max_value = data.get('max', 100)
                        progress_pct = value / max_value if max_value > 0 else 0

                        progress = WorkflowProgress(
                            prompt_id=prompt_id,
                            status=WorkflowStatus.EXECUTING,
                            progress=progress_pct,
                            message=f"Progress: {value}/{max_value}"
                        )
                        progress_callback(progress)

                time.sleep(0.1)
        finally:
            ws.close()

        return self.get_history(prompt_id)

    async def wait_for_completion_async(
        self,
        prompt_id: str,
        timeout: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Async version of wait_for_completion."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.wait_for_completion,
            prompt_id,
            timeout,
            None
        )

    async def stream_progress(
        self,
        prompt_id: str,
        timeout: Optional[int] = None,
    ) -> AsyncGenerator[WorkflowProgress, None]:
        """
        Stream progress updates for a workflow.

        Args:
            prompt_id: Prompt ID to monitor
            timeout: Timeout in seconds

        Yields:
            WorkflowProgress updates
        """
        if self.websocket is None:
            yield WorkflowProgress(
                prompt_id=prompt_id,
                status=WorkflowStatus.FAILED,
                message="WebSocket not available"
            )
            return

        timeout = timeout or self.timeout
        ws = self.websocket.WebSocket()
        ws.connect(f"{self.ws_endpoint}?clientId={self.client_id}")

        start_time = time.time()

        try:
            while True:
                if time.time() - start_time > timeout:
                    yield WorkflowProgress(
                        prompt_id=prompt_id,
                        status=WorkflowStatus.FAILED,
                        message=f"Timeout after {timeout} seconds"
                    )
                    break

                # Non-blocking receive
                ws.settimeout(0.5)
                try:
                    out = ws.recv()
                except self.websocket.WebSocketTimeoutException:
                    await asyncio.sleep(0.1)
                    continue

                if isinstance(out, str):
                    message = json.loads(out)
                    msg_type = message.get('type')
                    data = message.get('data', {})

                    if msg_type == 'executing':
                        current_node = data.get('node')
                        current_prompt_id = data.get('prompt_id')

                        if current_prompt_id == prompt_id:
                            if current_node is None:
                                yield WorkflowProgress(
                                    prompt_id=prompt_id,
                                    status=WorkflowStatus.COMPLETED,
                                    progress=1.0,
                                    message="Generation complete"
                                )
                                break
                            else:
                                yield WorkflowProgress(
                                    prompt_id=prompt_id,
                                    status=WorkflowStatus.EXECUTING,
                                    current_node=current_node,
                                    message=f"Executing: {current_node}"
                                )

                    elif msg_type == 'progress':
                        value = data.get('value', 0)
                        max_value = data.get('max', 100)
                        progress_pct = value / max_value if max_value > 0 else 0

                        yield WorkflowProgress(
                            prompt_id=prompt_id,
                            status=WorkflowStatus.EXECUTING,
                            progress=progress_pct,
                            message=f"Step {value}/{max_value}"
                        )

                await asyncio.sleep(0.05)
        finally:
            ws.close()

    def _poll_for_completion(
        self,
        prompt_id: str,
        timeout: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Fallback polling method when WebSocket is unavailable."""
        timeout = timeout or self.timeout
        start_time = time.time()

        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Workflow timed out after {timeout} seconds")

            history = self.get_history(prompt_id)
            if prompt_id in history:
                outputs = history[prompt_id].get('outputs', {})
                if outputs:
                    return history

            time.sleep(1.0)

    async def generate(
        self,
        request: GenerationRequest,
        save_to_disk: bool = True,
    ) -> GenerationResult:
        """
        Complete image generation pipeline.

        Args:
            request: Generation request parameters
            save_to_disk: Whether to save images locally

        Returns:
            GenerationResult with image data
        """
        start_time = time.time()

        try:
            # Build workflow
            workflow = self.build_workflow(
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
                filename_prefix=request.output_filename or "SuperWings",
            )

            # Queue workflow
            queue_result = await self.queue_workflow_async(workflow)
            prompt_id = queue_result.get('prompt_id')

            if not prompt_id:
                return GenerationResult(
                    success=False,
                    error_message="Failed to queue workflow"
                )

            # Wait for completion
            history = await self.wait_for_completion_async(prompt_id)

            # Extract images
            images = []
            if prompt_id in history:
                outputs = history[prompt_id].get('outputs', {})
                for node_id, node_output in outputs.items():
                    if 'images' in node_output:
                        for img_info in node_output['images']:
                            image_data = self.get_image(
                                img_info['filename'],
                                img_info.get('subfolder', ''),
                                img_info.get('type', 'output')
                            )

                            images.append({
                                'filename': img_info['filename'],
                                'subfolder': img_info.get('subfolder', ''),
                                'type': img_info.get('type', 'output'),
                                'data': image_data if not save_to_disk else None,
                            })

                            # Save to disk if requested
                            if save_to_disk:
                                output_path = self._save_image(
                                    image_data,
                                    request,
                                    img_info['filename']
                                )
                                images[-1]['local_path'] = str(output_path)

            generation_time = (time.time() - start_time) * 1000

            return GenerationResult(
                success=True,
                prompt_id=prompt_id,
                images=images,
                output_path=str(self.output_dir),
                generation_time_ms=generation_time,
                metadata={
                    'request': request.model_dump(),
                    'seed': request.seed if request.seed != -1 else "random"
                }
            )

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            generation_time = (time.time() - start_time) * 1000

            return GenerationResult(
                success=False,
                error_message=str(e),
                generation_time_ms=generation_time
            )

    def _save_image(
        self,
        image_data: bytes,
        request: GenerationRequest,
        filename: str,
    ) -> Path:
        """Save image to local disk."""
        # Create output directory based on generation type
        type_dirs = {
            GenerationType.CHARACTER_PORTRAIT: "characters/portraits",
            GenerationType.CHARACTER_STATE: "characters/states",
            GenerationType.CHARACTER_EXPRESSION: "characters/expressions",
            GenerationType.BACKGROUND: "backgrounds",
            GenerationType.UI_ELEMENT: "ui",
            GenerationType.TRANSFORMATION: "transformations",
            GenerationType.SCENE_COMPOSITE: "scenes",
        }

        subdir = type_dirs.get(request.generation_type, "misc")
        output_dir = self.output_dir / subdir
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = output_dir / filename
        with open(output_path, 'wb') as f:
            f.write(image_data)

        logger.info(f"Saved image: {output_path}")
        return output_path

    def check_server_status(self) -> bool:
        """Check if ComfyUI server is running."""
        try:
            url = f"http://{self.server_address}/system_stats"
            with urllib.request.urlopen(url, timeout=5) as response:
                return response.status == 200
        except Exception:
            return False

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        try:
            url = f"http://{self.server_address}/queue"
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read())
        except Exception as e:
            logger.error(f"Failed to get queue status: {e}")
            return {"error": str(e)}

    def cancel_workflow(self, prompt_id: str) -> bool:
        """Cancel a queued or executing workflow."""
        try:
            url = f"http://{self.server_address}/interrupt"
            with urllib.request.urlopen(url) as response:
                self._active_workflows[prompt_id] = WorkflowStatus.CANCELLED
                return True
        except Exception as e:
            logger.error(f"Failed to cancel workflow: {e}")
            return False
