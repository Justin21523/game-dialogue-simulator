"""
Base Agent System for Super Wings Simulator.
Provides planning, reasoning, and multi-step execution capabilities.
"""

import json
import logging
import time
import asyncio
from abc import ABC, abstractmethod
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, Union

from pydantic import BaseModel

from ..llm import ChatMessage, LLMResponse, GenerationConfig, MessageRole
from ..llm.transformers_adapter import get_llm

logger = logging.getLogger(__name__)


class AgentState(Enum):
    """Agent execution states."""
    IDLE = "idle"
    PLANNING = "planning"
    THINKING = "thinking"
    EXECUTING = "executing"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    ERROR = "error"


class ReasoningMode(str, Enum):
    """Reasoning modes for agents."""
    COT = "cot"          # Chain of Thought
    REACT = "react"      # ReAct: Reason + Act
    SIMPLE = "simple"    # Direct response


@dataclass
class AgentMemory:
    """Agent working memory for task execution."""
    task_description: str
    current_step: int = 0
    max_steps: int = 10
    tools_used: List[str] = field(default_factory=list)
    step_history: List[Dict[str, Any]] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    reasoning_chain: List[str] = field(default_factory=list)

    def add_step(
        self,
        step_type: str,
        content: str,
        result: Any = None,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Add a step to history."""
        self.step_history.append({
            "step": self.current_step,
            "type": step_type,
            "content": content,
            "result": result,
            "metadata": metadata or {},
            "timestamp": time.time(),
        })
        self.current_step += 1

    def add_reasoning(self, thought: str) -> None:
        """Add reasoning to chain."""
        self.reasoning_chain.append(thought)

    def get_context_summary(self, max_recent: int = 5) -> str:
        """Get condensed context for LLM."""
        summary_parts = [f"Task: {self.task_description}"]
        summary_parts.append(f"Progress: Step {self.current_step}/{self.max_steps}")

        if self.step_history:
            recent = self.step_history[-max_recent:]
            summary_parts.append("\nRecent actions:")
            for step in recent:
                summary_parts.append(
                    f"  - Step {step['step']} ({step['type']}): {step['content'][:100]}"
                )

        return "\n".join(summary_parts)

    def get_full_history(self) -> str:
        """Get full execution history."""
        parts = [f"Task: {self.task_description}\n"]

        for step in self.step_history:
            parts.append(f"Step {step['step']} [{step['type']}]:")
            parts.append(f"  Action: {step['content']}")
            if step.get('result'):
                result_str = str(step['result'])[:200]
                parts.append(f"  Result: {result_str}")
            parts.append("")

        return "\n".join(parts)


class AgentResponse(BaseModel):
    """Agent execution response."""
    success: bool
    result: Any
    tools_used: List[str] = []
    steps_taken: int = 0
    execution_time_ms: float = 0
    reasoning_chain: Optional[List[str]] = None
    error_message: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True


@dataclass
class PlanStep:
    """A single step in an execution plan."""
    step_number: int
    description: str
    action_type: str
    expected_output: str
    dependencies: List[int] = field(default_factory=list)


@dataclass
class ExecutionPlan:
    """Multi-step execution plan."""
    task: str
    steps: List[PlanStep]
    reasoning: str
    estimated_complexity: str = "medium"


class BaseAgent(ABC):
    """
    Abstract base agent with planning and reasoning capabilities.

    Implements the ReAct pattern:
    1. Plan - Break down task into steps
    2. Think - Reason about current state
    3. Act - Execute action
    4. Observe - Process results
    5. Synthesize - Combine results
    """

    def __init__(
        self,
        name: str = "base_agent",
        description: str = "General purpose agent",
        max_iterations: int = 10,
        reasoning_mode: ReasoningMode = ReasoningMode.REACT,
        enable_planning: bool = True,
        llm=None,
    ):
        self.name = name
        self.description = description
        self.max_iterations = max_iterations
        self.reasoning_mode = reasoning_mode
        self.enable_planning = enable_planning

        self._llm = llm
        self._state = AgentState.IDLE
        self._memory: Optional[AgentMemory] = None
        self._tools: Dict[str, Callable] = {}

    @property
    def llm(self):
        """Lazy load LLM."""
        if self._llm is None:
            self._llm = get_llm()
        return self._llm

    @property
    def state(self) -> AgentState:
        """Current agent state."""
        return self._state

    def register_tool(self, name: str, func: Callable, description: str = "") -> None:
        """Register a tool for the agent to use."""
        self._tools[name] = {
            "function": func,
            "description": description,
        }
        logger.debug(f"Registered tool: {name}")

    def get_available_tools(self) -> List[Dict[str, str]]:
        """Get list of available tools."""
        return [
            {"name": name, "description": tool["description"]}
            for name, tool in self._tools.items()
        ]

    async def _call_llm(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
    ) -> str:
        """Call LLM with messages."""
        response = await self.llm.chat(messages, config)
        return response.content

    async def _call_llm_stream(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
    ):
        """Stream LLM response."""
        async for token in self.llm.stream_chat(messages, config):
            yield token

    @abstractmethod
    async def get_system_prompt(self) -> str:
        """Get the system prompt for this agent."""
        pass

    async def plan_task(
        self,
        task_description: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExecutionPlan:
        """
        Break down task into actionable steps.

        Args:
            task_description: What needs to be done
            context: Additional context

        Returns:
            ExecutionPlan with ordered steps
        """
        from .prompts import PLANNING_PROMPT

        self._state = AgentState.PLANNING

        system_prompt = await self.get_system_prompt()
        planning_prompt = PLANNING_PROMPT.format(
            task=task_description,
            context=json.dumps(context or {}, indent=2),
            tools=json.dumps(self.get_available_tools(), indent=2),
        )

        messages = [
            ChatMessage.system(system_prompt),
            ChatMessage.user(planning_prompt),
        ]

        response = await self._call_llm(messages)

        # Parse plan from response
        try:
            plan_data = self._parse_json_response(response)
            steps = [
                PlanStep(
                    step_number=i + 1,
                    description=step.get("description", ""),
                    action_type=step.get("action_type", "think"),
                    expected_output=step.get("expected_output", ""),
                    dependencies=step.get("dependencies", []),
                )
                for i, step in enumerate(plan_data.get("steps", []))
            ]

            return ExecutionPlan(
                task=task_description,
                steps=steps,
                reasoning=plan_data.get("reasoning", ""),
                estimated_complexity=plan_data.get("complexity", "medium"),
            )
        except Exception as e:
            logger.warning(f"Failed to parse plan, using simple plan: {e}")
            # Fallback to simple single-step plan
            return ExecutionPlan(
                task=task_description,
                steps=[PlanStep(
                    step_number=1,
                    description=task_description,
                    action_type="execute",
                    expected_output="Task result",
                )],
                reasoning="Direct execution",
            )

    async def think(
        self,
        current_step: str,
        context: Optional[str] = None,
    ) -> str:
        """
        Reason about current step and decide action.

        Args:
            current_step: Current step description
            context: Current context/history

        Returns:
            Reasoning output
        """
        from .prompts import THINKING_PROMPT

        self._state = AgentState.THINKING

        thinking_prompt = THINKING_PROMPT.format(
            step=current_step,
            context=context or self._memory.get_context_summary() if self._memory else "",
            tools=json.dumps(self.get_available_tools(), indent=2),
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(thinking_prompt),
        ]

        response = await self._call_llm(messages)

        if self._memory:
            self._memory.add_reasoning(response)

        return response

    @abstractmethod
    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a single plan step.

        Args:
            step: Step to execute
            context: Execution context

        Returns:
            Step execution result
        """
        pass

    async def synthesize(
        self,
        results: List[Dict[str, Any]],
    ) -> str:
        """
        Synthesize results into final output.

        Args:
            results: Results from all steps

        Returns:
            Synthesized final result
        """
        from .prompts import SYNTHESIS_PROMPT

        self._state = AgentState.SYNTHESIZING

        synthesis_prompt = SYNTHESIS_PROMPT.format(
            task=self._memory.task_description if self._memory else "Unknown task",
            results=json.dumps(results, indent=2, default=str),
            history=self._memory.get_full_history() if self._memory else "",
        )

        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(synthesis_prompt),
        ]

        response = await self._call_llm(messages)
        return response

    async def execute_task(
        self,
        task_description: str,
        context: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> AgentResponse:
        """
        Execute a complete task with planning and reasoning.

        Args:
            task_description: What to accomplish
            context: Additional context
            **kwargs: Additional parameters

        Returns:
            AgentResponse with results
        """
        start_time = time.time()
        self._memory = AgentMemory(
            task_description=task_description,
            max_steps=self.max_iterations,
            context=context or {},
        )

        try:
            # Phase 1: Planning
            if self.enable_planning:
                plan = await self.plan_task(task_description, context)
                self._memory.add_step("plan", f"Created plan with {len(plan.steps)} steps")
            else:
                plan = ExecutionPlan(
                    task=task_description,
                    steps=[PlanStep(
                        step_number=1,
                        description=task_description,
                        action_type="execute",
                        expected_output="Result",
                    )],
                    reasoning="Direct execution",
                )

            # Phase 2: Execute steps
            self._state = AgentState.EXECUTING
            results = []

            for step in plan.steps:
                if self._memory.current_step >= self.max_iterations:
                    logger.warning("Max iterations reached")
                    break

                # Think before acting (if ReAct mode)
                if self.reasoning_mode == ReasoningMode.REACT:
                    thought = await self.think(step.description)
                    self._memory.add_step("think", thought)

                # Execute step
                result = await self.execute_step(step, self._memory.context)
                results.append(result)
                self._memory.add_step(
                    "execute",
                    step.description,
                    result=result,
                )

                # Update context with result
                self._memory.context[f"step_{step.step_number}_result"] = result

            # Phase 3: Synthesize
            final_result = await self.synthesize(results)

            self._state = AgentState.COMPLETED
            execution_time = (time.time() - start_time) * 1000

            return AgentResponse(
                success=True,
                result=final_result,
                tools_used=self._memory.tools_used,
                steps_taken=self._memory.current_step,
                execution_time_ms=execution_time,
                reasoning_chain=self._memory.reasoning_chain,
            )

        except Exception as e:
            self._state = AgentState.ERROR
            logger.error(f"Agent execution error: {e}")
            execution_time = (time.time() - start_time) * 1000

            return AgentResponse(
                success=False,
                result=None,
                tools_used=self._memory.tools_used if self._memory else [],
                steps_taken=self._memory.current_step if self._memory else 0,
                execution_time_ms=execution_time,
                error_message=str(e),
            )

    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        """Parse JSON from LLM response."""
        # Try to find JSON in response
        response = response.strip()

        # Look for JSON block
        if "```json" in response:
            start = response.find("```json") + 7
            end = response.find("```", start)
            response = response[start:end].strip()
        elif "```" in response:
            start = response.find("```") + 3
            end = response.find("```", start)
            response = response[start:end].strip()

        # Try to find JSON object or array
        if response.startswith("{"):
            end = response.rfind("}") + 1
            response = response[:end]
        elif response.startswith("["):
            end = response.rfind("]") + 1
            response = response[:end]

        return json.loads(response)

    def reset(self) -> None:
        """Reset agent state."""
        self._state = AgentState.IDLE
        self._memory = None


class SimpleReasoningAgent(BaseAgent):
    """
    Simple reasoning agent for straightforward tasks.
    Uses Chain-of-Thought reasoning without complex planning.
    """

    def __init__(self, **kwargs):
        super().__init__(
            reasoning_mode=ReasoningMode.COT,
            enable_planning=False,
            **kwargs,
        )

    async def get_system_prompt(self) -> str:
        return f"""You are {self.name}, an AI assistant.
{self.description}

When responding:
1. Think step by step
2. Explain your reasoning
3. Provide clear, helpful answers

Always respond in English unless specifically asked for another language."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute step with simple reasoning."""
        messages = [
            ChatMessage.system(await self.get_system_prompt()),
            ChatMessage.user(step.description),
        ]

        response = await self._call_llm(messages)

        return {
            "step": step.step_number,
            "output": response,
            "success": True,
        }
