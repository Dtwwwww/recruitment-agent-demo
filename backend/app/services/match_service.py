"""匹配分析服务 — 批量简历 vs JD 交叉分析"""
import asyncio
import json
import logging
from uuid import UUID
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.job import Job
from app.models.candidate import Candidate
from app.models.talent import Talent
from app.models.match import MatchResult
from app.agents.resume_matcher import ResumeMatcherAgent
from app.agents.interview_questions import InterviewQuestionsAgent

logger = logging.getLogger(__name__)
MAX_CONCURRENT = 5


def _get_candidate_dict(obj) -> dict:
    """兼容 Candidate 和 Talent 两种模型"""
    if isinstance(obj, Talent):
        return json.dumps({
            "name": obj.name, "current_title": obj.current_title,
            "current_company": obj.current_company,
            "experience_years": obj.experience_years,
            "education": obj.education, "school": obj.school,
            "skills": obj.skills, "industry_tags": obj.industry_tags,
            "ai_analysis": obj.resume_json,
        }, ensure_ascii=False, indent=2)
    return json.dumps({
        "name": obj.name, "current_title": obj.current_title,
        "current_company": obj.current_company,
        "experience_years": obj.experience_years,
        "education": obj.education, "school": obj.school,
        "skills": obj.skills, "industry_tags": obj.industry_tags,
    }, ensure_ascii=False, indent=2)


async def _match_one(job: Job, candidate, sem: asyncio.Semaphore) -> dict:
    matcher = ResumeMatcherAgent()
    jd_text = json.dumps(job.structured_requirements, ensure_ascii=False, indent=2)
    cand_text = _get_candidate_dict(candidate)

    async with sem:
        try:
            result = await matcher.run(job_requirements=jd_text, candidate_record=cand_text)
            result["candidate_id"] = str(candidate.id)
            return result
        except Exception as e:
            logger.error(f"匹配失败 {candidate.id}: {e}")
            return {"candidate_id": str(candidate.id), "error": str(e),
                    "overall_score": 0, "rating": "C", "decision": "reject"}


async def _gen_questions(match: dict, candidate: Candidate, job: Job, sem: asyncio.Semaphore) -> List[str]:
    if match.get("rating") not in ("S", "A"):
        return []
    agent = InterviewQuestionsAgent()
    async with sem:
        try:
            res = await agent.run(
                match_result_summary=json.dumps(match, ensure_ascii=False),
                candidate_summary=json.dumps({
                    "name": candidate.name, "current_title": candidate.current_title,
                    "experience_years": candidate.experience_years,
                    "skills": candidate.skills,
                }, ensure_ascii=False),
                job_summary=json.dumps(job.structured_requirements.get("core_requirements", []), ensure_ascii=False),
            )
            return [q.get("question", "") for q in res.get("questions", [])]
        except Exception as e:
            logger.error(f"面试关注点失败: {e}")
            return []


async def batch_match_analyze(
    db: AsyncSession, job_id: UUID, candidate_ids: List[UUID],
) -> List[dict]:
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one_or_none()
    if not job:
        raise ValueError(f"职位不存在: {job_id}")

    candidates = (await db.execute(
        select(Candidate).where(Candidate.id.in_(candidate_ids))
    )).scalars().all()

    # 兼容 Talent 表：Candidate 找不到就查 Talent
    if not candidates:
        candidates = (await db.execute(
            select(Talent).where(Talent.id.in_(candidate_ids))
        )).scalars().all()

    if not candidates:
        raise ValueError("候选人不存在")

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    results = await asyncio.gather(
        *[_match_one(job, c, sem) for c in candidates], return_exceptions=True,
    )
    valid = [r for r in results if isinstance(r, dict) and r.get("candidate_id") and not r.get("error")]

    cand_map = {str(c.id): c for c in candidates}
    q_sem = asyncio.Semaphore(MAX_CONCURRENT)
    for r in valid:
        c = cand_map.get(r["candidate_id"])
        if c and r.get("rating") in ("S", "A"):
            r["interview_questions"] = await _gen_questions(r, c, job, q_sem)
        else:
            r.setdefault("interview_questions", [])

    # 保存结果：Talent 存 match_json，Candidate 存 match_results
    for r in valid:
        tid = UUID(r["candidate_id"])
        # 尝试更新 Talent 的 match_json
        talent = (await db.execute(select(Talent).where(Talent.id == tid))).scalar_one_or_none()
        if talent:
            talent.match_json = r
            talent.quick_score = r.get("overall_score", 0)
        else:
            # Candidate 表：写入 match_results
            existing = (await db.execute(
                select(MatchResult).where(MatchResult.candidate_id == tid, MatchResult.job_id == job_id)
            )).scalar_one_or_none()
            if existing:
                existing.overall_score = r.get("overall_score", 0)
                existing.rating = r.get("rating", "C")
                existing.matched_points = r.get("matched_points", [])
                existing.gap_points = r.get("gap_points", [])
                existing.decision = r.get("decision", "reject")
                existing.analysis_summary = r.get("analysis_summary", "")
            else:
                db.add(MatchResult(
                    candidate_id=tid, job_id=job_id,
                    overall_score=r.get("overall_score", 0),
                    rating=r.get("rating", "C"),
                    matched_points=r.get("matched_points", []),
                    gap_points=r.get("gap_points", []),
                    decision=r.get("decision", "reject"),
                    analysis_summary=r.get("analysis_summary", ""),
                ))
    await db.flush()

    valid.sort(key=lambda x: x.get("overall_score", 0), reverse=True)
    return valid
