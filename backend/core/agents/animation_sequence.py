"""
Animation Sequence Agent for Super Wings Simulator.
Handles animation planning and frame sequence management.
"""

import logging
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from .base_agent import BaseAgent, ReasoningMode, PlanStep

logger = logging.getLogger(__name__)


class AnimationType(str, Enum):
    """Types of animations."""

    TRANSFORMATION = "transformation"
    FLIGHT = "flight"
    TAKEOFF = "takeoff"
    LANDING = "landing"
    CELEBRATION = "celebration"
    IDLE = "idle"
    EXPRESSION_CHANGE = "expression_change"


class EasingFunction(str, Enum):
    """Easing functions for animation timing."""

    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    BOUNCE = "bounce"
    ELASTIC = "elastic"


class ExportFormat(str, Enum):
    """Export formats for animations."""

    GIF = "gif"
    SPRITE_SHEET = "sprite_sheet"
    MP4 = "mp4"
    WEBM = "webm"
    FRAMES = "frames"


@dataclass
class AnimationKeyframe:
    """A keyframe in an animation sequence."""

    frame_number: int
    time_ms: float
    progress: float  # 0.0 to 1.0
    state: str
    properties: Dict[str, Any] = field(default_factory=dict)
    image_path: Optional[str] = None


@dataclass
class AnimationTrack:
    """A track of keyframes for a specific property."""

    name: str
    property_path: str
    keyframes: List[AnimationKeyframe] = field(default_factory=list)


class AnimationPlan(BaseModel):
    """Plan for an animation sequence."""

    animation_type: AnimationType
    character_id: str
    total_duration_ms: int
    frame_rate: int = 24
    total_frames: int = 0
    keyframes: List[Dict[str, Any]] = field(default_factory=list)
    easing: EasingFunction = EasingFunction.EASE_IN_OUT
    loop: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


class AnimationRequest(BaseModel):
    """Request for animation planning."""

    animation_type: AnimationType
    character_id: str
    duration_ms: int = 2000
    frame_rate: int = 24
    easing: EasingFunction = EasingFunction.EASE_IN_OUT
    loop: bool = False
    export_format: ExportFormat = ExportFormat.GIF


class AnimationResult(BaseModel):
    """Result of animation planning/generation."""

    success: bool
    animation_type: str
    character_id: str
    plan: Optional[AnimationPlan] = None
    frame_count: int = 0
    duration_ms: int = 0
    export_path: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# Animation templates
ANIMATION_TEMPLATES = {
    AnimationType.TRANSFORMATION: {
        "stages": [
            {
                "progress": 0.0,
                "state": "plane_form",
                "description": "Full airplane form",
            },
            {
                "progress": 0.2,
                "state": "initiating",
                "description": "Starting transformation",
            },
            {
                "progress": 0.5,
                "state": "mid_transform",
                "description": "Halfway transformed",
            },
            {"progress": 0.8, "state": "late_transform", "description": "Almost robot"},
            {"progress": 1.0, "state": "robot_form", "description": "Full robot form"},
        ],
        "recommended_duration_ms": 3000,
        "recommended_easing": EasingFunction.EASE_IN_OUT,
    },
    AnimationType.FLIGHT: {
        "stages": [
            {"progress": 0.0, "state": "cruise", "description": "Level flight"},
            {"progress": 0.25, "state": "bank_left", "description": "Banking left"},
            {"progress": 0.5, "state": "cruise", "description": "Level flight"},
            {"progress": 0.75, "state": "bank_right", "description": "Banking right"},
            {"progress": 1.0, "state": "cruise", "description": "Level flight"},
        ],
        "recommended_duration_ms": 2000,
        "recommended_easing": EasingFunction.LINEAR,
        "loop": True,
    },
    AnimationType.TAKEOFF: {
        "stages": [
            {"progress": 0.0, "state": "ground", "description": "On ground"},
            {"progress": 0.3, "state": "accelerating", "description": "Speeding up"},
            {"progress": 0.6, "state": "lift_off", "description": "Leaving ground"},
            {"progress": 1.0, "state": "airborne", "description": "In the air"},
        ],
        "recommended_duration_ms": 2500,
        "recommended_easing": EasingFunction.EASE_OUT,
    },
    AnimationType.LANDING: {
        "stages": [
            {"progress": 0.0, "state": "approach", "description": "Approaching runway"},
            {
                "progress": 0.5,
                "state": "descending",
                "description": "Lowering altitude",
            },
            {"progress": 0.8, "state": "touchdown", "description": "Wheels touching"},
            {"progress": 1.0, "state": "stopped", "description": "Fully stopped"},
        ],
        "recommended_duration_ms": 2500,
        "recommended_easing": EasingFunction.EASE_IN,
    },
    AnimationType.CELEBRATION: {
        "stages": [
            {"progress": 0.0, "state": "start", "description": "Starting pose"},
            {"progress": 0.3, "state": "jump_up", "description": "Jumping up"},
            {"progress": 0.5, "state": "peak", "description": "At peak"},
            {"progress": 0.7, "state": "landing", "description": "Coming down"},
            {"progress": 1.0, "state": "finish", "description": "Victory pose"},
        ],
        "recommended_duration_ms": 1500,
        "recommended_easing": EasingFunction.BOUNCE,
    },
    AnimationType.IDLE: {
        "stages": [
            {"progress": 0.0, "state": "neutral", "description": "Neutral pose"},
            {"progress": 0.5, "state": "slight_move", "description": "Subtle movement"},
            {"progress": 1.0, "state": "neutral", "description": "Back to neutral"},
        ],
        "recommended_duration_ms": 2000,
        "recommended_easing": EasingFunction.EASE_IN_OUT,
        "loop": True,
    },
}


# Singleton instance
_animation_agent: Optional["AnimationSequenceAgent"] = None


def get_animation_agent() -> "AnimationSequenceAgent":
    """Get or create AnimationSequenceAgent singleton."""
    global _animation_agent
    if _animation_agent is None:
        _animation_agent = AnimationSequenceAgent()
    return _animation_agent


class AnimationSequenceAgent(BaseAgent):
    """
    Agent for planning and managing animation sequences.

    This agent handles:
    - Animation planning (keyframe calculation)
    - Frame timing with easing functions
    - Transformation animation sequences
    - Flight animation cycles
    - Export format preparation
    """

    def __init__(
        self,
        output_dir: str = "./assets/animations",
    ):
        super().__init__(
            name="animation_sequence_agent",
            description="Agent for planning Super Wings animation sequences",
            reasoning_mode=ReasoningMode.REACT,
            enable_planning=True,
        )

        self.output_dir = Path(output_dir)

    async def get_system_prompt(self) -> str:
        return """You are an Animation Sequence agent for Super Wings.
Your role is to plan animation sequences and calculate frame timings.
You understand animation principles and can create smooth transitions
between keyframes using appropriate easing functions."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute animation planning step."""
        return {
            "step": step.step_number,
            "output": "Animation planned",
            "success": True,
        }

    def _apply_easing(self, t: float, easing: EasingFunction) -> float:
        """Apply easing function to normalized time value."""
        import math

        if easing == EasingFunction.LINEAR:
            return t

        elif easing == EasingFunction.EASE_IN:
            return t * t

        elif easing == EasingFunction.EASE_OUT:
            return 1 - (1 - t) * (1 - t)

        elif easing == EasingFunction.EASE_IN_OUT:
            if t < 0.5:
                return 2 * t * t
            else:
                return 1 - pow(-2 * t + 2, 2) / 2

        elif easing == EasingFunction.BOUNCE:
            if t < 1 / 2.75:
                return 7.5625 * t * t
            elif t < 2 / 2.75:
                t -= 1.5 / 2.75
                return 7.5625 * t * t + 0.75
            elif t < 2.5 / 2.75:
                t -= 2.25 / 2.75
                return 7.5625 * t * t + 0.9375
            else:
                t -= 2.625 / 2.75
                return 7.5625 * t * t + 0.984375

        elif easing == EasingFunction.ELASTIC:
            if t == 0 or t == 1:
                return t
            p = 0.3
            s = p / 4
            return pow(2, -10 * t) * math.sin((t - s) * (2 * math.pi) / p) + 1

        return t

    def _interpolate_stages(
        self,
        stages: List[Dict[str, Any]],
        progress: float,
    ) -> Dict[str, Any]:
        """Find the appropriate stage for a given progress value."""
        for i, stage in enumerate(stages):
            if progress <= stage["progress"]:
                if i == 0:
                    return stage
                # Interpolate between previous and current stage
                prev_stage = stages[i - 1]
                segment_progress = (progress - prev_stage["progress"]) / (
                    stage["progress"] - prev_stage["progress"]
                )
                return {
                    "progress": progress,
                    "state": stage["state"],
                    "segment_progress": segment_progress,
                    "prev_state": prev_stage["state"],
                    "description": stage["description"],
                }
        return stages[-1]

    async def plan_animation(
        self,
        request: AnimationRequest,
    ) -> AnimationPlan:
        """
        Plan an animation sequence with calculated keyframes.

        Args:
            request: AnimationRequest with all parameters

        Returns:
            AnimationPlan with keyframe information
        """
        template = ANIMATION_TEMPLATES.get(request.animation_type, {})
        stages = template.get("stages", [])

        # Calculate total frames
        total_frames = int((request.duration_ms / 1000) * request.frame_rate)

        # Generate keyframes
        keyframes = []
        for frame_num in range(total_frames + 1):
            # Calculate normalized time
            t = frame_num / total_frames if total_frames > 0 else 0

            # Apply easing
            eased_t = self._apply_easing(t, request.easing)

            # Get stage info
            stage_info = self._interpolate_stages(stages, eased_t)

            keyframes.append(
                {
                    "frame_number": frame_num,
                    "time_ms": int((frame_num / request.frame_rate) * 1000),
                    "progress": eased_t,
                    "state": stage_info.get("state", ""),
                    "description": stage_info.get("description", ""),
                    "segment_progress": stage_info.get("segment_progress", 0),
                }
            )

        return AnimationPlan(
            animation_type=request.animation_type,
            character_id=request.character_id,
            total_duration_ms=request.duration_ms,
            frame_rate=request.frame_rate,
            total_frames=total_frames,
            keyframes=keyframes,
            easing=request.easing,
            loop=request.loop or template.get("loop", False),
            metadata={
                "export_format": request.export_format.value,
                "template_stages": len(stages),
            },
        )

    async def create_animation(
        self,
        request: AnimationRequest,
    ) -> AnimationResult:
        """
        Create a complete animation plan.

        Args:
            request: AnimationRequest with all parameters

        Returns:
            AnimationResult with plan and metadata
        """
        try:
            plan = await self.plan_animation(request)

            return AnimationResult(
                success=True,
                animation_type=request.animation_type.value,
                character_id=request.character_id,
                plan=plan,
                frame_count=plan.total_frames,
                duration_ms=request.duration_ms,
                metadata={
                    "easing": request.easing.value,
                    "loop": plan.loop,
                    "export_format": request.export_format.value,
                },
            )

        except Exception as e:
            logger.error(f"Animation planning failed: {e}")
            return AnimationResult(
                success=False,
                animation_type=request.animation_type.value,
                character_id=request.character_id,
                error_message=str(e),
            )

    async def plan_transformation_animation(
        self,
        character_id: str,
        duration_ms: int = 3000,
        frame_rate: int = 24,
    ) -> AnimationResult:
        """
        Plan a transformation animation for a character.

        Args:
            character_id: Character ID
            duration_ms: Duration in milliseconds
            frame_rate: Frames per second

        Returns:
            AnimationResult with transformation plan
        """
        request = AnimationRequest(
            animation_type=AnimationType.TRANSFORMATION,
            character_id=character_id,
            duration_ms=duration_ms,
            frame_rate=frame_rate,
            easing=EasingFunction.EASE_IN_OUT,
        )
        return await self.create_animation(request)

    async def plan_flight_animation(
        self,
        character_id: str,
        duration_ms: int = 2000,
        frame_rate: int = 24,
    ) -> AnimationResult:
        """
        Plan a looping flight animation for a character.

        Args:
            character_id: Character ID
            duration_ms: Duration of one cycle in milliseconds
            frame_rate: Frames per second

        Returns:
            AnimationResult with flight plan
        """
        request = AnimationRequest(
            animation_type=AnimationType.FLIGHT,
            character_id=character_id,
            duration_ms=duration_ms,
            frame_rate=frame_rate,
            easing=EasingFunction.LINEAR,
            loop=True,
        )
        return await self.create_animation(request)

    def get_frames_for_progress_range(
        self,
        plan: AnimationPlan,
        start_progress: float,
        end_progress: float,
    ) -> List[Dict[str, Any]]:
        """
        Get keyframes within a progress range.

        Args:
            plan: Animation plan
            start_progress: Start of range (0.0 to 1.0)
            end_progress: End of range (0.0 to 1.0)

        Returns:
            List of keyframes in the range
        """
        return [
            kf
            for kf in plan.keyframes
            if start_progress <= kf["progress"] <= end_progress
        ]

    def calculate_sprite_sheet_layout(
        self,
        frame_count: int,
        frame_width: int = 256,
        frame_height: int = 256,
        max_columns: int = 8,
    ) -> Dict[str, Any]:
        """
        Calculate sprite sheet dimensions.

        Args:
            frame_count: Number of frames
            frame_width: Width of each frame
            frame_height: Height of each frame
            max_columns: Maximum columns in sprite sheet

        Returns:
            Layout information
        """
        columns = min(frame_count, max_columns)
        rows = (frame_count + columns - 1) // columns

        return {
            "columns": columns,
            "rows": rows,
            "frame_width": frame_width,
            "frame_height": frame_height,
            "sheet_width": columns * frame_width,
            "sheet_height": rows * frame_height,
            "frame_count": frame_count,
        }

    async def get_animation_recommendations(
        self,
        animation_type: AnimationType,
    ) -> Dict[str, Any]:
        """
        Get recommended settings for an animation type.

        Args:
            animation_type: Type of animation

        Returns:
            Recommended settings
        """
        template = ANIMATION_TEMPLATES.get(animation_type, {})

        return {
            "animation_type": animation_type.value,
            "recommended_duration_ms": template.get("recommended_duration_ms", 2000),
            "recommended_easing": template.get(
                "recommended_easing", EasingFunction.LINEAR
            ).value,
            "stages": template.get("stages", []),
            "should_loop": template.get("loop", False),
            "recommended_frame_rate": 24,
        }
