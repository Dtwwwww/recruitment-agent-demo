"""面试决策接口"""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.v1.deps import get_db
from app.schemas.request import DecisionRecommendRequest
from app.services.decision_service import get_decision_recommendations

logger = logging.getLogger(__name__)
router = APIRouter()
DB_MSG = "数据库不可用，请启动 docker-compose up -d postgres"


class DecisionItem(BaseModel):
    rank: int
    candidate_id: str
    candidate_name: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    rating: Optional[str] = None
    overall_score: float = 0
    hard_score: float = 0
    soft_score: float = 0
    bonus_score: float = 0
    matched_points: List[str] = []
    gap_points: List[str] = []
    interview_questions: List[str] = []
    decision: Optional[str] = None
    analysis_summary: Optional[str] = None


class DecisionStats(BaseModel):
    total: int = 0
    s_count: int = 0
    a_count: int = 0
    b_count: int = 0
    c_count: int = 0
    interview_count: int = 0
    backup_count: int = 0
    reject_count: int = 0


class DecisionRecommendResponse(BaseModel):
    decisions: List[DecisionItem]
    stats: DecisionStats


@router.post("/decision/recommend", response_model=DecisionRecommendResponse)
async def api_recommend_decision(
    request: DecisionRecommendRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)

    try:
        decisions, stats = await get_decision_recommendations(db, request.job_id, request.candidate_ids)
    except Exception as e:
        logger.exception(f"决策推荐失败: {e}")
        raise HTTPException(status_code=502, detail=f"决策分析失败: {e}")

    return DecisionRecommendResponse(
        decisions=[DecisionItem(**d) for d in decisions],
        stats=DecisionStats(**stats),
    )
