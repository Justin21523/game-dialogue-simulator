"""
RAG (Retrieval-Augmented Generation) API endpoints.
管理知識庫檢索增強生成系統的API端點。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

# ===== RAG Session Management =====
# In-memory session store (in production, use Redis or database)
_rag_sessions: Dict[str, Dict[str, Any]] = {}


class RAGSessionRequest(BaseModel):
    """創建RAG會話的請求"""
    type: str  # 'global' or 'mission'
    mission_id: Optional[str] = None
    parent_session: Optional[str] = None
    knowledge_domains: List[str] = []


class RAGContextUpdate(BaseModel):
    """更新RAG上下文的請求"""
    session_id: str
    game_state: Dict[str, Any]
    recent_events: List[Dict[str, Any]] = []
    player_actions: List[Dict[str, Any]] = []


class RAGQuery(BaseModel):
    """查詢RAG系統的請求"""
    session_id: str
    question: str
    context: Dict[str, Any] = {}
    max_results: int = 5


@router.post("/create-session")
async def create_rag_session(request: RAGSessionRequest):
    """
    創建新的RAG會話，用於遊戲任務或全局知識檢索。

    Args:
        request: RAG會話請求，包含會話類型和知識領域

    Returns:
        包含session_id的字典
    """
    try:
        from ...core.rag import get_knowledge_base

        kb = get_knowledge_base()
        session_id = f"session_{request.type}_{id(request)}"

        # Store session in memory
        _rag_sessions[session_id] = {
            "session_id": session_id,
            "type": request.type,
            "mission_id": request.mission_id,
            "parent_session": request.parent_session,
            "knowledge_domains": request.knowledge_domains,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "contexts": [],
            "queries_count": 0
        }

        logger.info(f"Created RAG session: {session_id} (type={request.type}, mission={request.mission_id})")

        return {
            "session_id": session_id,
            "type": request.type,
            "mission_id": request.mission_id,
            "domains": request.knowledge_domains,
            "created_at": _rag_sessions[session_id]["created_at"]
        }

    except Exception as e:
        logger.error(f"Error creating RAG session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-context")
async def update_rag_context(request: RAGContextUpdate):
    """
    更新RAG上下文，將當前遊戲狀態加入知識庫。

    Args:
        request: 包含session_id和遊戲狀態的請求

    Returns:
        操作成功狀態
    """
    try:
        logger.info(f"Updating RAG context for session: {request.session_id}")

        # ===== AI Integration: Store context in session =====
        if request.session_id not in _rag_sessions:
            # Session doesn't exist, create it
            _rag_sessions[request.session_id] = {
                "session_id": request.session_id,
                "created_at": datetime.now().isoformat(),
                "type": "unknown",
                "contexts": [],
                "queries_count": 0
            }

        session = _rag_sessions[request.session_id]

        # Add current context to history
        context_entry = {
            "timestamp": datetime.now().isoformat(),
            "game_state": request.game_state,
            "recent_events": request.recent_events,
            "player_actions": request.player_actions
        }

        # Keep last 10 context entries to avoid memory issues
        if "contexts" not in session:
            session["contexts"] = []

        session["contexts"].append(context_entry)
        if len(session["contexts"]) > 10:
            session["contexts"].pop(0)

        session["updated_at"] = datetime.now().isoformat()

        logger.info(f"Updated RAG session {request.session_id}, now has {len(session['contexts'])} context entries")

        return {
            "success": True,
            "session_id": request.session_id,
            "updated_at": session["updated_at"],
            "context_count": len(session["contexts"])
        }

    except Exception as e:
        logger.error(f"Error updating RAG context: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def query_rag(request: RAGQuery):
    """
    查詢RAG系統，檢索相關知識。

    Args:
        request: 包含問題和上下文的查詢請求

    Returns:
        相關文檔列表
    """
    try:
        from ...core.rag import get_knowledge_base

        kb = get_knowledge_base()

        # 執行語義搜尋
        results = await kb.search_similar(
            request.question,
            collection_name="super_wings_missions",
            n_results=request.max_results
        )

        logger.info(f"RAG query returned {len(results) if results else 0} results")

        return {
            "results": results or [],
            "question": request.question,
            "session_id": request.session_id
        }

    except Exception as e:
        logger.error(f"Error querying RAG: {e}")
        # 返回空結果而非錯誤，讓遊戲可以繼續運行
        return {
            "results": [],
            "question": request.question,
            "session_id": request.session_id,
            "error": str(e)
        }


@router.get("/status/{session_id}")
async def get_session_status(session_id: str):
    """
    獲取RAG會話狀態。

    Args:
        session_id: 會話ID

    Returns:
        會話狀態資訊
    """
    try:
        # ===== AI Integration: Retrieve session from store =====
        if session_id not in _rag_sessions:
            # Session not found
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        session = _rag_sessions[session_id]

        return {
            "session_id": session_id,
            "active": True,
            "type": session.get("type", "unknown"),
            "created_at": session.get("created_at"),
            "updated_at": session.get("updated_at"),
            "queries_count": session.get("queries_count", 0),
            "context_count": len(session.get("contexts", [])),
            "mission_id": session.get("mission_id")
        }

    except Exception as e:
        logger.error(f"Error getting session status: {e}")
        raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """
    刪除RAG會話，釋放資源。

    Args:
        session_id: 會話ID

    Returns:
        刪除成功狀態
    """
    try:
        logger.info(f"Deleting RAG session: {session_id}")

        # ===== AI Integration: Delete session from store =====
        if session_id in _rag_sessions:
            session_type = _rag_sessions[session_id].get("type", "unknown")
            context_count = len(_rag_sessions[session_id].get("contexts", []))

            # Remove session
            del _rag_sessions[session_id]

            logger.info(f"Deleted RAG session {session_id} (type={session_type}, contexts={context_count})")

            return {
                "success": True,
                "session_id": session_id,
                "message": f"Session deleted successfully (type={session_type}, contexts={context_count})"
            }
        else:
            logger.warning(f"Attempted to delete non-existent session: {session_id}")
            return {
                "success": True,
                "session_id": session_id,
                "message": "Session not found (already deleted or never existed)"
            }

    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
