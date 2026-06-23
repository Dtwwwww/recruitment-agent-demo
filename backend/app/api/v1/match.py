"""匹配分析接口"""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.schemas.request import MatchAnalyzeRequest
from app.schemas.response import MatchResultResponse
from app.services.match_service import batch_match_analyze

logger = logging.getLogger(__name__)
router = APIRouter()
DB_MSG = "数据库不可用，请启动 docker-compose up -d postgres"


@router.post("/match/analyze", response_model=List[MatchResultResponse])
async def api_analyze_match(
    request: MatchAnalyzeRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)
    if len(request.candidate_ids) > 100:
        raise HTTPException(status_code=422, detail="单次最多100份简历")
    if len(request.candidate_ids) == 0:
        raise HTTPException(status_code=422, detail="至少选择1位候选人")

    try:
        results = await batch_match_analyze(db, request.job_id, request.candidate_ids)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"匹配失败: {e}")
        raise HTTPException(status_code=502, detail=f"LLM服务调用失败: {e}")

    return [MatchResultResponse(
        id=UUID("00000000-0000-0000-0000-000000000000"),
        candidate_id=UUID(r["candidate_id"]), job_id=request.job_id,
        overall_score=r.get("overall_score"), hard_score=r.get("hard_score"),
        soft_score=r.get("soft_score"), bonus_score=r.get("bonus_score"),
        rating=r.get("rating"), matched_points=r.get("matched_points", []),
        gap_points=r.get("gap_points", []),
        interview_questions=r.get("interview_questions", []),
        decision=r.get("decision"), analysis_summary=r.get("analysis_summary"),
    ) for r in results if r and "candidate_id" in r]
