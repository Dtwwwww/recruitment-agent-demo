"""渠道搜索接口"""
from __future__ import annotations
import logging, sys, os, threading, uuid as _uuid
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.v1.deps import get_db
from app.schemas.request import SearchExecuteRequest, CreateCandidateRequest, JDParseRequest
from app.schemas.response import SearchTaskResponse, CandidateResponse, ResumeAnalysisResponse
from app.schemas.talent import TalentListItem
from app.models.task import SearchTask
from app.models.candidate import Candidate
from app.models.talent import Talent
from app.services.search_service import execute_search, create_search_task, complete_task

logger = logging.getLogger(__name__)
router = APIRouter()
DB_MSG = "数据库不可用，请启动 docker-compose up -d postgres"

# 实时搜索进度（线程共享，供 status API 读取）
_live_progress: dict = {}


@router.post("/search/execute", response_model=SearchTaskResponse)
async def api_execute_search(
    request: SearchExecuteRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)

    # 创建任务，立即返回
    task = await create_search_task(db, request.job_id, request.platform,
                                     request.keywords, request.location)
    await db.commit()

    # 标记为 running，启动后台线程
    task.status = "running"
    await db.commit()

    import threading
    t = threading.Thread(target=_run_search_sync, args=(
        task.id, request.platform, request.keywords,
        request.location, min(request.max_pages, 10), request.job_id,
    ), daemon=True)
    t.start()

    return SearchTaskResponse(
        task_id=task.id, status="running",
        progress=task.progress, result_count=0,
    )


def _run_search_sync(task_id, platform, keywords, location, max_pages, job_id):
    """纯线程函数 + asyncio.run 包装 DB 操作 — 批量入库版本"""
    import asyncio
    from app.core.config import get_settings
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.models.task import SearchTask
    from app.models.talent import Talent
    from sqlalchemy import select as sa_select, and_ as sa_and

    # 进度回调：线程安全地写入 _live_progress
    def _progress_cb(page_num, candidate_count, status_text):
        _live_progress[str(task_id)] = {
            "pages": page_num, "candidates": candidate_count,
            "scraping": status_text, "current_page": page_num,
        }

    async def _db_ops(records):
        s = get_settings()
        engine = create_async_engine(s.database_url, echo=False)
        sess = async_sessionmaker(engine, expire_on_commit=False)
        async with sess() as db:
            talent_ids = set()
            for rec in records:
                existing = None
                if rec.name and rec.current_company:
                    r = await db.execute(sa_select(Talent).where(sa_and(
                        Talent.source_platform == platform,
                        Talent.name == rec.name,
                        Talent.current_company == rec.current_company)))
                    existing = r.scalars().first()
                if existing:
                    # 更新已有记录
                    existing.skills = rec.skills or existing.skills
                    existing.resume_json = rec.raw_data or existing.resume_json
                    existing.source_url = rec.source_url or existing.source_url
                    tid = str(existing.id)
                else:
                    # 新增记录，捕获实际生成的 id
                    new_t = Talent(
                        name=rec.name, current_title=rec.current_title,
                        current_company=rec.current_company, experience_years=rec.experience_years,
                        education=rec.education, school=rec.school,
                        skills=rec.skills, industry_tags=rec.industry_tags,
                        source_platform=platform, source_url=rec.source_url,
                        resume_json=rec.raw_data, status="new", job_id=job_id)
                    db.add(new_t)
                    await db.flush()
                    tid = str(new_t.id)
                talent_ids.add(tid)
            task = await db.get(SearchTask, task_id)
            if task:
                task.status = "completed"
                task.result_count = len(records)
                task.progress = {"talent_ids": list(talent_ids), "total_candidates": len(records)}
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
            await engine.dispose()

    try:
        from app.services.search_service import _sync_search
        records, meta = _sync_search(platform, keywords, location, max_pages, task_id, progress_cb=_progress_cb)
        asyncio.run(_db_ops(records))
        _live_progress.pop(str(task_id), None)  # 清除实时进度
        logger.info(f"Search done: {len(records)} candidates")
    except Exception as e:
        _live_progress.pop(str(task_id), None)
        logger.exception(f"Search failed: {e}")
        async def _fail():
            s = get_settings()
            engine = create_async_engine(s.database_url, echo=False)
            sess = async_sessionmaker(engine, expire_on_commit=False)
            async with sess() as db:
                task = await db.get(SearchTask, task_id)
                if task:
                    task.status = "failed"
                    task.error_message = str(e)
                    await db.commit()
                await engine.dispose()
        try: asyncio.run(_fail())
        except: pass


@router.get("/search/{task_id}/status", response_model=SearchTaskResponse)
async def api_get_status(task_id: UUID, db: Optional[AsyncSession] = Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)
    r = await db.execute(select(SearchTask).where(SearchTask.id == task_id))
    task = r.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    # 合并实时进度（线程写入的 _live_progress 优先于 DB 中的静态 progress）
    live = _live_progress.get(str(task_id))
    progress = {**(task.progress or {}), **(live or {})} if live else task.progress
    return SearchTaskResponse(task_id=task.id, status=task.status,
                               progress=progress, result_count=live.get("candidates", task.result_count or 0) if live else (task.result_count or 0),
                               error_message=task.error_message)


@router.get("/search/{task_id}/results", response_model=List[TalentListItem])
async def api_get_results(task_id: UUID, db: Optional[AsyncSession] = Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)

    task = (await db.execute(select(SearchTask).where(SearchTask.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 从任务progress中读取本次搜到的talent ID列表（运行中优先用 _live_progress）
    live = _live_progress.get(str(task_id))
    live_ids = (live or {}).get("talent_ids", [])
    db_ids = (task.progress or {}).get("talent_ids", [])
    talent_ids = live_ids if live_ids else db_ids
    if talent_ids:
        r = await db.execute(
            select(Talent).where(Talent.id.in_(
                [UUID(tid) for tid in talent_ids]
            )).order_by(Talent.created_at.desc())
        )
    else:
        r = await db.execute(select(Talent).where(False))  # 返回空
    return [TalentListItem(
        id=t.id, name=t.name, current_title=t.current_title,
        current_company=t.current_company, experience_years=t.experience_years,
        education=t.education, school=t.school, skills=t.skills or [],
        source_platform=t.source_platform, source_url=t.source_url,
        quick_score=t.quick_score, status=t.status, job_id=t.job_id,
        created_at=t.created_at,
    ) for t in r.scalars().all()]


@router.post("/candidates")
async def api_create_candidate(
    request: CreateCandidateRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    """手动创建候选人，返回 candidate_id"""
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)

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
        source_url=None,
        raw_data={"raw_text": request.raw_text},
    )
    db.add(candidate)
    await db.flush()
    await db.commit()
    await db.close()

    return {"candidate_id": str(candidate.id)}


@router.post("/resume/analyze", response_model=ResumeAnalysisResponse)
async def api_analyze_resume(
    request: JDParseRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    """AI 深度分析候选人简历"""
    from app.agents.resume_analyzer import ResumeAnalyzerAgent
    from app.schemas.response import (
        ResumeBasicInfo, ResumeJobPreference, ResumeEducation,
        WorkExperienceItem, ResumeSkills, ProjectItem, CareerTrajectory,
    )
    import uuid as _uuid

    agent = ResumeAnalyzerAgent()
    try:
        structured = await agent.run(raw_resume_text=request.raw_jd_text)
    except Exception as e:
        logger.exception(f"简历分析 Agent 调用失败: {e}")
        raise HTTPException(status_code=502, detail=f"LLM 服务调用失败: {e}")

    analysis_id = _uuid.uuid4()

    def _list(v):
        return v if isinstance(v, list) else []

    def _str(v, default=""):
        return v if isinstance(v, str) else default

    def _int(v, default=0):
        return v if isinstance(v, (int, float)) else default

    def _float(v, default=0.0):
        return v if isinstance(v, (int, float)) else default

    def _bool(v):
        return bool(v) if not isinstance(v, str) else v.lower() == "true"

    # basic_info
    bi = structured.get("basic_info", {}) or {}
    basic_info = ResumeBasicInfo(
        name=_str(bi.get("name")),
        email=_str(bi.get("email")),
        phone=_str(bi.get("phone")),
        city=_str(bi.get("city")),
        gender=_str(bi.get("gender")),
        age_range=_str(bi.get("age_range")),
    )

    # job_preference
    jp = structured.get("job_preference", {}) or {}
    job_preference = ResumeJobPreference(
        desired_title=_str(jp.get("desired_title")),
        desired_industry=_list(jp.get("desired_industry")),
        expected_salary=_str(jp.get("expected_salary")),
        location=_list(jp.get("location")),
    )

    # education
    edu = structured.get("education", {}) or {}
    education = ResumeEducation(
        degree=_str(edu.get("degree")),
        school=_str(edu.get("school")),
        major=_str(edu.get("major")),
        graduation_year=_str(edu.get("graduation_year")),
        is_elite_school=_bool(edu.get("is_elite_school", False)),
        elite_note=_str(edu.get("elite_note")),
    )

    # work_experience
    work_experience = []
    for we in _list(structured.get("work_experience")):
        if isinstance(we, dict):
            work_experience.append(WorkExperienceItem(
                company=_str(we.get("company")),
                title=_str(we.get("title")),
                start_date=_str(we.get("start_date")),
                end_date=_str(we.get("end_date")),
                duration=_str(we.get("duration")),
                responsibilities=_list(we.get("responsibilities")),
                achievements=_list(we.get("achievements")),
            ))

    # skills
    sk = structured.get("skills", {}) or {}
    skills = ResumeSkills(
        expert=_list(sk.get("expert")),
        proficient=_list(sk.get("proficient")),
        familiar=_list(sk.get("familiar")),
        categories=_list(sk.get("categories")),
    )

    # projects
    projects = []
    for p in _list(structured.get("projects")):
        if isinstance(p, dict):
            projects.append(ProjectItem(
                name=_str(p.get("name")),
                role=_str(p.get("role")),
                tech_stack=_list(p.get("tech_stack")),
                highlights=_list(p.get("highlights")),
                duration=_str(p.get("duration")),
            ))

    # career_trajectory
    ct = structured.get("career_trajectory", {}) or {}
    career_trajectory = CareerTrajectory(
        total_years=_float(ct.get("total_years")),
        company_count=_int(ct.get("company_count")),
        avg_tenure_months=_float(ct.get("avg_tenure_months")),
        promotion_path=_list(ct.get("promotion_path")),
        industry_span=_list(ct.get("industry_span")),
        stability_score=_float(ct.get("stability_score")),
        stability_assessment=_str(ct.get("stability_assessment")),
    )

    return ResumeAnalysisResponse(
        id=analysis_id,
        basic_info=basic_info,
        job_preference=job_preference,
        education=education,
        work_experience=work_experience,
        skills=skills,
        projects=projects,
        career_trajectory=career_trajectory,
        strengths=_list(structured.get("strengths")),
        weaknesses=_list(structured.get("weaknesses")),
        overall_rating=_str(structured.get("overall_rating")),
        development_advice=_list(structured.get("development_advice")),
        analysis_summary=_str(structured.get("analysis_summary")),
    )
