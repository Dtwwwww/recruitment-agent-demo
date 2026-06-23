"""人才库 API — 筛选、入库、匹配、面试"""
import json
import logging
import uuid
import os
from typing import Optional, List, Dict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.api.v1.deps import get_db
from app.schemas.talent import (
    ScreenRequest, TalentMatchRequest, InterviewRequest,
    TalentListItem, TalentDetail, ScreenProgress, MatchSummary,
)
from app.models.talent import Talent
from app.models.job import Job
from app.adapters.base import CandidateRecord

logger = logging.getLogger(__name__)
router = APIRouter()
DB_MSG = "数据库不可用"


# ── 进度存储（内存） ──
_screen_tasks: Dict[str, dict] = {}


@router.post("/talent/screen", response_model=ScreenProgress)
async def start_screen(request: ScreenRequest, db: Optional[AsyncSession] = Depends(get_db)):
    """启动 AI 筛选任务（异步）"""
    if db is None:
        raise HTTPException(status_code=503, detail=DB_MSG)

    task_id = str(uuid.uuid4())
    _screen_tasks[task_id] = {
        "status": "running", "platform": request.platform,
        "total_screened": 0, "total_added": 0,
        "current_page": 0, "message": "启动中...",
    }

    # 异步执行（简化版：直接在后台跑）
    import asyncio
    asyncio.create_task(_run_screen(task_id, request, db))

    return ScreenProgress(task_id=task_id, status="running", platform=request.platform,
                          total_screened=0, total_added=0, current_page=0, message="已启动")


async def _run_screen(task_id: str, req: ScreenRequest, db: AsyncSession):
    """后台执行 AI 筛选"""
    try:
        from app.adapters.registry import AdapterRegistry
        from playwright.async_api import async_playwright
        import asyncio

        adapter = AdapterRegistry.get(req.platform)
        if not adapter:
            _screen_tasks[task_id]["status"] = "failed"
            _screen_tasks[task_id]["message"] = f"不支持的平台: {req.platform}"
            return

        saved = 0
        screened = 0

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
            context = await browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")

            try:
                async for candidates in adapter.search(
                    context=context, keywords=req.keywords,
                    location=req.location, max_pages=req.max_pages,
                ):
                    for c in candidates:
                        screened += 1
                        # 入库
                        talent = Talent(
                            name=c.name, current_title=c.current_title,
                            current_company=c.current_company, experience_years=c.experience_years,
                            education=c.education, school=c.school,
                            skills=c.skills, industry_tags=c.industry_tags,
                            source_platform=req.platform, source_url=c.source_url,
                            resume_json=c.raw_data, status="new", job_id=req.job_id,
                        )
                        db.add(talent)
                        saved += 1

                    await db.flush()
                    await db.commit()

                    _screen_tasks[task_id].update(
                        total_screened=screened, total_added=saved,
                        message=f"已筛选 {screened} 人，入库 {saved} 人",
                    )
            finally:
                await context.close()
                await browser.close()

        _screen_tasks[task_id].update(status="completed", current_page=req.max_pages,
                                       total_screened=screened, total_added=saved,
                                       message=f"完成：筛选 {screened} 人，入库 {saved} 人")
        await db.close()
    except Exception as e:
        logger.exception(f"AI 筛选异常: {e}")
        _screen_tasks[task_id].update(status="failed", message=str(e))


@router.get("/talent/screen/{task_id}/status", response_model=ScreenProgress)
async def screen_status(task_id: str):
    """查询筛选进度"""
    if task_id not in _screen_tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    t = _screen_tasks[task_id]
    return ScreenProgress(task_id=task_id, **t)


@router.get("/talent", response_model=List[TalentListItem])
async def list_talent(job_id: Optional[uuid.UUID] = None, db: Optional[AsyncSession] = Depends(get_db)):
    """人才库列表"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    q = select(Talent).order_by(desc(Talent.created_at))
    if job_id:
        q = q.where(Talent.job_id == job_id)
    result = await db.execute(q)
    talents = result.scalars().all()
    return [TalentListItem(id=t.id, name=t.name, current_title=t.current_title,
            current_company=t.current_company, experience_years=t.experience_years,
            education=t.education, school=t.school, skills=t.skills or [],
            source_platform=t.source_platform, source_url=t.source_url,
            quick_score=t.quick_score,
            status=t.status, job_id=t.job_id, created_at=t.created_at) for t in talents]


@router.get("/talent/{talent_id}", response_model=TalentDetail)
async def get_talent(talent_id: uuid.UUID, db: Optional[AsyncSession] = Depends(get_db)):
    """单个人才详情"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    r = await db.execute(select(Talent).where(Talent.id == talent_id))
    t = r.scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="不存在")
    return TalentDetail(
        id=t.id, name=t.name, current_title=t.current_title,
        current_company=t.current_company, experience_years=t.experience_years,
        education=t.education, school=t.school, skills=t.skills or [],
        industry_tags=t.industry_tags or [], source_platform=t.source_platform,
        source_url=t.source_url, resume_json=t.resume_json,
        quick_score=t.quick_score, match_json=t.match_json,
        interview_json=t.interview_json,
        screenshot_url=f"/api/v1/talent/{t.id}/screenshot" if t.screenshot_path else None,
        status=t.status, job_id=t.job_id, created_at=t.created_at,
    )


@router.get("/talent/{talent_id}/screenshot")
async def get_screenshot(talent_id: uuid.UUID, db: Optional[AsyncSession] = Depends(get_db)):
    """返回简历原图"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    r = await db.execute(select(Talent).where(Talent.id == talent_id))
    t = r.scalar_one_or_none()
    if not t or not t.screenshot_path: raise HTTPException(status_code=404, detail="无原图")
    if not os.path.exists(t.screenshot_path): raise HTTPException(status_code=404, detail="原图文件丢失")
    return FileResponse(t.screenshot_path, media_type="image/png")


@router.post("/talent/match", response_model=List[MatchSummary])
async def batch_match(request: TalentMatchRequest, db: Optional[AsyncSession] = Depends(get_db)):
    """批量匹配分析"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)

    # 获取 JD
    jr = await db.execute(select(Job).where(Job.id == request.job_id))
    job = jr.scalar_one_or_none()
    if not job: raise HTTPException(status_code=404, detail="职位不存在")

    results = []
    for tid in request.talent_ids:
        tr = await db.execute(select(Talent).where(Talent.id == tid))
        talent = tr.scalar_one_or_none()
        if not talent: continue

        try:
            from app.agents.resume_matcher import ResumeMatcherAgent
            agent = ResumeMatcherAgent()
            jd_text = json.dumps(job.structured_requirements, ensure_ascii=False)
            cv_text = json.dumps(talent.resume_json or {}, ensure_ascii=False)
            match = await agent.run(job_requirements=jd_text, candidate_record=cv_text)

            # 保存匹配结果
            talent.match_json = match
            talent.quick_score = match.get("overall_score")
            await db.flush()

            results.append(MatchSummary(
                talent_id=talent.id, name=talent.name,
                current_title=talent.current_title, current_company=talent.current_company,
                rating=match.get("rating"), overall_score=match.get("overall_score"),
                hard_score=match.get("hard_score"), soft_score=match.get("soft_score"),
                bonus_score=match.get("bonus_score"),
                matched_points=match.get("matched_points", []),
                gap_points=match.get("gap_points", []),
                decision=match.get("decision"),
                analysis_summary=match.get("analysis_summary"),
            ))
        except Exception as e:
            logger.error(f"匹配分析失败 talent={tid}: {e}")
            results.append(MatchSummary(talent_id=tid, name=talent.name,
                current_title=talent.current_title, current_company=talent.current_company,
                analysis_summary=f"分析失败: {e}"))

    await db.commit()
    return results


@router.post("/talent/{talent_id}/interview", response_model=TalentDetail)
async def confirm_interview(talent_id: str, request: InterviewRequest,
                            db: Optional[AsyncSession] = Depends(get_db)):
    """确认邀约面试 + 生成面试题（Talent不存在时自动创建，兼容非UUID的ID）"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)

    # 兼容非UUID格式的ID（localStorage候选人ID）：转成确定性的UUID
    import hashlib
    try:
        tid = uuid.UUID(str(talent_id))
    except ValueError:
        tid = uuid.UUID(hashlib.md5(str(talent_id).encode()).hexdigest())

    tr = await db.execute(select(Talent).where(Talent.id == tid))
    talent = tr.scalar_one_or_none()
    if not talent:
        cd = request.candidate_data or {}
        talent = Talent(id=tid, name=cd.get("name","候选人"),
            current_title=cd.get("current_title",""), current_company=cd.get("current_company",""),
            experience_years=cd.get("experience_years"), education=cd.get("education",""),
            school=cd.get("school",""), skills=cd.get("skills",[]),
            industry_tags=cd.get("industry_tags",[]), source_platform=cd.get("source_platform",""),
            resume_json=cd, status="new")
        db.add(talent)
        await db.flush()

    jr = await db.execute(select(Job).where(Job.id == request.job_id))
    job = jr.scalar_one_or_none()

    # 生成面试题
    try:
        from app.agents.interview_questions import InterviewQuestionsAgent
        agent = InterviewQuestionsAgent()
        jd_text = json.dumps(job.structured_requirements, ensure_ascii=False) if job else "{}"
        cv_text = json.dumps(talent.resume_json or {}, ensure_ascii=False)
        match = talent.match_json or {}
        questions = await agent.run(
            job_summary=jd_text,
            candidate_summary=cv_text,
            match_result_summary=json.dumps(match, ensure_ascii=False),
        )
        talent.interview_json = questions
    except Exception as e:
        logger.warning(f"面试题生成失败: {e}")
        talent.interview_json = {"error": str(e)}

    talent.status = "interviewed"
    await db.commit()

    return TalentDetail(
        id=talent.id, name=talent.name, current_title=talent.current_title,
        current_company=talent.current_company, experience_years=talent.experience_years,
        education=talent.education, school=talent.school, skills=talent.skills or [],
        industry_tags=talent.industry_tags or [], source_platform=talent.source_platform,
        source_url=talent.source_url, resume_json=talent.resume_json,
        quick_score=talent.quick_score, match_json=talent.match_json,
        interview_json=talent.interview_json,
        screenshot_url=f"/api/v1/talent/{talent.id}/screenshot" if talent.screenshot_path else None,
        status=talent.status, job_id=talent.job_id, created_at=talent.created_at,
    )


@router.post("/talent/bind")
async def bind_talent_to_job(talent_ids: List[uuid.UUID], job_id: uuid.UUID, db: Optional[AsyncSession] = Depends(get_db)):
    """将候选人绑定到岗位"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    for tid in talent_ids:
        t = (await db.execute(select(Talent).where(Talent.id == tid))).scalar_one_or_none()
        if t:
            t.job_id = job_id
            t.status = "screened"
    await db.commit()
    return {"bound": len(talent_ids)}


@router.delete("/talent/{talent_id}")
async def delete_talent(talent_id: uuid.UUID, db: Optional[AsyncSession] = Depends(get_db)):
    """硬删除人才"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    t = (await db.execute(select(Talent).where(Talent.id == talent_id))).scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="不存在")
    await db.delete(t)
    await db.commit()
    return {"deleted": str(talent_id)}


@router.put("/talent/{talent_id}")
async def update_talent(talent_id: uuid.UUID, data: dict, db: Optional[AsyncSession] = Depends(get_db)):
    """编辑人才信息"""
    if db is None: raise HTTPException(status_code=503, detail=DB_MSG)
    t = (await db.execute(select(Talent).where(Talent.id == talent_id))).scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="不存在")
    for field in ["name","current_title","current_company","experience_years","education","school","skills","industry_tags","source_platform"]:
        if field in data:
            setattr(t, field, data[field])
    if "notes" in data:
        t.status = data["notes"]  # 复用 status 存备注
    await db.commit()
    return {"updated": str(talent_id)}
