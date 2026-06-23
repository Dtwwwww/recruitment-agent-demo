"""JD 解析接口 — POST /api/v1/jd/parse"""
import logging
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.api.v1.deps import get_db
from app.schemas.request import JDParseRequest
from app.schemas.response import (
    JobRequirementResponse, RequirementItem, IcebergAbove, IcebergBelow,
    JobListItemResponse,
)
from app.agents.jd_parser import JDParserAgent
from app.models.job import Job

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/jd/parse", response_model=JobRequirementResponse)
async def parse_jd(
    request: JDParseRequest,
    db: Optional[AsyncSession] = Depends(get_db),
):
    """
    解析原始 JD 文本为结构化职位需求。

    使用 JD 解析 Agent（冰山模型），将自由文本 JD 拆解为：
    - 冰山上：知识/技能/经验（core/important/bonus 优先级）
    - 冰山下：特质/素养/动机
    """
    agent = JDParserAgent()

    try:
        structured = await agent.run(raw_jd_text=request.raw_jd_text)
    except Exception as e:
        logger.exception(f"JD 解析 Agent 调用失败: {e}")
        raise HTTPException(status_code=502, detail=f"LLM 服务调用失败: {e}")

    # 提取 JD 标题
    raw_lines = request.raw_jd_text.strip().split("\n")
    title = raw_lines[0][:100] if raw_lines else "未命名职位"

    # 保存到数据库（数据库不可用时生成临时ID）
    job_id = uuid.uuid4()
    if db is not None:
        try:
            job = Job(
                title=title,
                raw_jd_text=request.raw_jd_text,
                structured_requirements=structured,
            )
            db.add(job)
            await db.flush()
            await db.commit()
            job_id = job.id
        except Exception as e:
            logger.warning(f"DB保存失败（结果仍返回）: {e}")
        finally:
            try:
                await db.close()
            except Exception:
                pass
    else:
        logger.info("数据库不可用，跳过JD持久化存储")

    # 辅助：安全转换为 RequirementItem（处理LLM返回string/dict两种情况）
    def _safe_item(item):
        if isinstance(item, str):
            return RequirementItem(category="", description=item, priority="bonus")
        return RequirementItem(**item) if isinstance(item, dict) else RequirementItem(category="", description=str(item))

    iceberg_above = structured.get("iceberg_above", {})
    iceberg_below = structured.get("iceberg_below", {})

    return JobRequirementResponse(
        id=job_id,
        title=title,
        iceberg_above=IcebergAbove(
            knowledge=[_safe_item(k) for k in iceberg_above.get("knowledge", [])],
            skills=[_safe_item(s) for s in iceberg_above.get("skills", [])],
            experience=[_safe_item(e) for e in iceberg_above.get("experience", [])],
        ),
        iceberg_below=IcebergBelow(
            traits=[_safe_item(t) for t in iceberg_below.get("traits", [])],
            competencies=[_safe_item(c) for c in iceberg_below.get("competencies", [])],
            motivations=[_safe_item(m) for m in iceberg_below.get("motivations", [])],
        ),
        core_requirements=[_safe_item(r) for r in structured.get("core_requirements", [])],
        important_requirements=[_safe_item(r) for r in structured.get("important_requirements", [])],
        bonus_requirements=[_safe_item(r) for r in structured.get("bonus_requirements", [])],
    )


@router.get("/jd/jobs", response_model=List[JobListItemResponse])
async def list_jobs(
    db: Optional[AsyncSession] = Depends(get_db),
):
    """列出所有已保存的职位"""
    if db is None:
        raise HTTPException(status_code=503, detail="数据库不可用")

    result = await db.execute(
        select(Job).order_by(desc(Job.created_at))
    )
    jobs = result.scalars().all()

    return [
        JobListItemResponse(
            id=j.id,
            title=j.title,
            status=j.status,
            created_at=j.created_at,
            core_count=len((j.structured_requirements or {}).get("core_requirements", [])),
            important_count=len((j.structured_requirements or {}).get("important_requirements", [])),
            bonus_count=len((j.structured_requirements or {}).get("bonus_requirements", [])),
        )
        for j in jobs
    ]


@router.get("/jd/jobs/{job_id}", response_model=JobRequirementResponse)
async def get_job(
    job_id: uuid.UUID,
    db: Optional[AsyncSession] = Depends(get_db),
):
    """获取单个职位的结构化详情"""
    if db is None:
        raise HTTPException(status_code=503, detail="数据库不可用")

    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="职位不存在")

    structured = job.structured_requirements or {}

    def _safe_item(item):
        if isinstance(item, str):
            return RequirementItem(category="", description=item, priority="bonus")
        return RequirementItem(**item) if isinstance(item, dict) else RequirementItem(category="", description=str(item))

    iceberg_above = structured.get("iceberg_above", {})
    iceberg_below = structured.get("iceberg_below", {})

    return JobRequirementResponse(
        id=job.id,
        title=job.title,
        iceberg_above=IcebergAbove(
            knowledge=[_safe_item(k) for k in iceberg_above.get("knowledge", [])],
            skills=[_safe_item(s) for s in iceberg_above.get("skills", [])],
            experience=[_safe_item(e) for e in iceberg_above.get("experience", [])],
        ),
        iceberg_below=IcebergBelow(
            traits=[_safe_item(t) for t in iceberg_below.get("traits", [])],
            competencies=[_safe_item(c) for c in iceberg_below.get("competencies", [])],
            motivations=[_safe_item(m) for m in iceberg_below.get("motivations", [])],
        ),
        core_requirements=[_safe_item(r) for r in structured.get("core_requirements", [])],
        important_requirements=[_safe_item(r) for r in structured.get("important_requirements", [])],
        bonus_requirements=[_safe_item(r) for r in structured.get("bonus_requirements", [])],
    )
