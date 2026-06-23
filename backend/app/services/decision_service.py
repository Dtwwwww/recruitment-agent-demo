"""决策服务 — 基于匹配结果生成面试决策"""
import logging
from uuid import UUID
from typing import List, Tuple, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.match import MatchResult
from app.models.candidate import Candidate
from app.models.talent import Talent

logger = logging.getLogger(__name__)


async def get_decision_recommendations(
    db: AsyncSession, job_id: UUID, candidate_ids: List[UUID],
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """生成面试决策排序列表"""
    # 先从 Talent 表查匹配结果
    talents = (await db.execute(
        select(Talent).where(Talent.id.in_(candidate_ids))
    )).scalars().all()
    talent_map = {t.id: t for t in talents}

    # 再从 match_results 表查
    matches = (await db.execute(
        select(MatchResult).where(
            and_(MatchResult.job_id == job_id, MatchResult.candidate_id.in_(candidate_ids))
        ).order_by(MatchResult.rating.asc(), MatchResult.overall_score.desc())
    )).scalars().all()

    if not talents and not matches:
        return [], {"total": 0, "s_count": 0, "a_count": 0, "b_count": 0, "c_count": 0,
                     "interview_count": 0, "backup_count": 0, "reject_count": 0}

    # 查候选人信息
    cand_ids = [m.candidate_id for m in matches] + [t.id for t in talents]
    cand_rows = (await db.execute(select(Candidate).where(Candidate.id.in_(cand_ids)))).scalars().all()
    talent_rows = (await db.execute(select(Talent).where(Talent.id.in_(cand_ids)))).scalars().all()
    cand_map = {c.id: c for c in cand_rows}
    cand_map.update({t.id: t for t in talent_rows})

    decisions = []
    # Talent 匹配结果
    for t in talents:
        mj = (t.match_json or {})
        if not mj: continue
        rating = mj.get("rating", "C")
        action = "interview" if rating in ("S", "A") else ("backup" if rating == "B" else "reject")
        decisions.append({
            "rank": 0, "candidate_id": str(t.id),
            "candidate_name": t.name,
            "current_title": t.current_title, "current_company": t.current_company,
            "rating": rating, "overall_score": float(mj.get("overall_score", 0)),
            "hard_score": float(mj.get("hard_score", 0)),
            "soft_score": float(mj.get("soft_score", 0)),
            "bonus_score": float(mj.get("bonus_score", 0)),
            "matched_points": mj.get("matched_points", []),
            "gap_points": mj.get("gap_points", []),
            "interview_questions": mj.get("interview_questions", []),
            "decision": action, "analysis_summary": mj.get("analysis_summary", ""),
        })

    # match_results 表结果
    for rank, m in enumerate(matches, len(decisions) + 1):
        c = cand_map.get(m.candidate_id)
        action = "interview" if m.rating in ("S", "A") else ("backup" if m.rating == "B" else "reject")
        decisions.append({
            "rank": rank, "candidate_id": str(m.candidate_id),
            "candidate_name": c.name if c else None,
            "current_title": c.current_title if c else None,
            "current_company": c.current_company if c else None,
            "rating": m.rating, "overall_score": float(m.overall_score or 0),
            "hard_score": float(m.hard_score or 0),
            "soft_score": float(m.soft_score or 0),
            "bonus_score": float(m.bonus_score or 0),
            "matched_points": m.matched_points or [],
            "gap_points": m.gap_points or [],
            "interview_questions": m.interview_questions or [],
            "decision": action, "analysis_summary": m.analysis_summary,
        })

    # 按分数降序重排
    decisions.sort(key=lambda d: d.get("overall_score", 0), reverse=True)
    for i, d in enumerate(decisions, 1):
        d["rank"] = i

    s_cnt = sum(1 for d in decisions if d["rating"] == "S")
    a_cnt = sum(1 for d in decisions if d["rating"] == "A")
    b_cnt = sum(1 for d in decisions if d["rating"] == "B")
    c_cnt = sum(1 for d in decisions if d["rating"] == "C")

    stats = {"total": len(decisions), "s_count": s_cnt, "a_count": a_cnt,
             "b_count": b_cnt, "c_count": c_cnt,
             "interview_count": s_cnt + a_cnt, "backup_count": b_cnt, "reject_count": c_cnt}

    return decisions, stats
