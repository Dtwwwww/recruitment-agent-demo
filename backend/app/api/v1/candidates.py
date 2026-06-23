"""候选人接口 — POST /api/v1/candidates"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.schemas.request import CreateCandidateRequest
from app.models.candidate import Candidate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/candidates")
async def create_candidate(
    request: CreateCandidateRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    """创建候选人记录，返回 candidate_id"""
    if db is None:
        raise HTTPException(status_code=503, detail="数据库不可用")

    candidate = Candidate(
        name=request.name,
        current_title=request.current_title,
        current_company=request.current_company,
        experience_years=request.experience_years,
        education=request.education,
        school=request.school,
        skills=request.skills,
        industry_tags=request.industry_tags,
        source_platform=request.source_platform,
        raw_data={"raw_text": request.raw_text},
    )
    db.add(candidate)
    await db.flush()
    await db.commit()
    await db.close()

    return {"candidate_id": str(candidate.id)}
