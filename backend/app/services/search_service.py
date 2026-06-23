"""
搜索编排服务 — 同步 Playwright + AI Browser，结果直接入库 Talent。
"""
from __future__ import annotations
import asyncio
import logging
import sys
from datetime import datetime, timezone
from uuid import UUID
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.talent import Talent
from app.models.task import SearchTask
from app.adapters.base import CandidateRecord
from app.adapters.registry import AdapterRegistry

logger = logging.getLogger(__name__)


def _sync_search(
    platform: str, keywords: list[str], location: str, max_pages: int = 5,
    task_id: UUID | None = None, progress_cb=None,
) -> tuple[list[CandidateRecord], dict]:
    """同步 Playwright 搜索（线程内强制 ProactorEventLoop）"""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        asyncio.set_event_loop(asyncio.new_event_loop())

    from playwright.sync_api import sync_playwright

    adapter = AdapterRegistry.get(platform)
    if not adapter:
        return [], {"error": f"不支持的平台: {platform}"}

    stats = {"pages": 0, "candidates": 0}
    all_records: list[CandidateRecord] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,  # 可视化浏览器，用户可以看到并手动登录
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
            locale="zh-CN",
        )

        try:
            for page_records in adapter.search(
                context=context, keywords=keywords, location=location, max_pages=max_pages,
                progress_cb=progress_cb,
            ):
                stats["pages"] += 1
                all_records.extend(page_records)
                stats["candidates"] = len(all_records)
                if progress_cb:
                    progress_cb(stats["pages"], stats["candidates"],
                        f"搜索第{stats['pages']}页, 已发现{stats['candidates']}人")
                logger.info(f"搜索: 第{stats['pages']}页, 累计{stats['candidates']}人")
        except Exception as e:
            logger.error(f"搜索异常: {e}")
            stats["error"] = str(e)
        finally:
            context.close()
            browser.close()

    return all_records, stats


async def save_talent(db: AsyncSession, record: CandidateRecord, job_id: UUID | None = None) -> Talent:
    """保存人才。按姓名+公司去重（URL来自AI提取不可靠）"""
    from sqlalchemy import select, and_

    if record.name and record.current_company:
        existing = await db.execute(
            select(Talent).where(
                and_(Talent.source_platform == record.source_platform,
                     Talent.name == record.name,
                     Talent.current_company == record.current_company)
            )
        )
        dup = existing.scalar_one_or_none()
        if dup:
            dup.skills = record.skills or dup.skills
            dup.resume_json = record.raw_data or dup.resume_json
            await db.flush()
            return dup

    t = Talent(
        name=record.name, current_title=record.current_title,
        current_company=record.current_company, experience_years=record.experience_years,
        education=record.education, school=record.school,
        skills=record.skills, industry_tags=record.industry_tags,
        source_platform=record.source_platform, source_url=record.source_url,
        resume_json=record.raw_data, status="new", job_id=job_id,
    )
    db.add(t)
    await db.flush()
    return t


async def execute_search(
    db: AsyncSession, platform: str, keywords: list[str],
    location: str, max_pages: int = 5, job_id: UUID | None = None,
    task_id: UUID | None = None,
) -> tuple[list[Talent], dict]:
    """执行同步搜索（在线程中运行），结果写入 Talent"""
    import asyncio
    loop = asyncio.get_running_loop()

    # 在线程池中运行同步 Playwright
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        records, meta = await loop.run_in_executor(
            pool, _sync_search, platform, keywords, location, max_pages, task_id,
        )

    talents = []
    talent_ids = set()
    for rec in records:
        try:
            t = await save_talent(db, rec, job_id)
            talents.append(t)
            talent_ids.add(str(t.id))
        except Exception as e:
            logger.error(f"保存人才失败: {e}")

    meta["talent_count"] = len(talents)
    meta["talent_ids"] = list(talent_ids)
    return talents, meta


async def create_search_task(
    db: AsyncSession, job_id: UUID | None, platform: str,
    keywords: list[str], location: str,
) -> SearchTask:
    task = SearchTask(
        job_id=job_id, platform=platform, status="pending",
        progress={"keywords": keywords, "location": location, "current_page": 0, "total_candidates": 0},
    )
    db.add(task)
    await db.flush()
    return task


async def complete_task(db: AsyncSession, task_id: UUID, total: int, meta: dict):
    task = await db.get(SearchTask, task_id)
    if task:
        task.status = "completed"
        task.result_count = total
        task.completed_at = datetime.now(timezone.utc)
        task.progress = {**(task.progress or {}), "total_candidates": total, **meta}
        await db.flush()
