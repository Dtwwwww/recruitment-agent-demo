from __future__ import annotations
"""Celery 异步任务 — 搜索、匹配、批量分析"""
import asyncio
import logging
from celery import Celery

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Celery 应用实例
celery_app = Celery(
    "recruitment_agent",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 单任务最多30分钟
    task_soft_time_limit=25 * 60,  # 软超时25分钟
    worker_prefetch_multiplier=1,  # 公平调度
)


@celery_app.task(bind=True, name="search_task")
def execute_search_task(
    self,
    task_id: str,
    platform: str,
    keywords: list[str],
    location: str,
    max_pages: int = 10,
    job_id: str | None = None,
):
    """
    异步执行搜索任务。

    通过 WebSocket 实时推送进度到前端。
    """
    from app.core.database import async_session
    from app.services.search_service import (
        create_search_task,
        update_task_progress,
        complete_task,
        fail_task,
        save_candidate,
    )
    from app.adapters.registry import AdapterRegistry

    async def _run():
        async with async_session() as db:
            from uuid import UUID

            try:
                # 更新任务状态
                task_uuid = UUID(task_id)
                await update_task_progress(
                    db, task_uuid,
                    {"status": "running", "keywords": keywords, "location": location},
                    "running",
                )

                # 获取适配器
                adapter = AdapterRegistry.get(platform)

                # 启动浏览器
                from playwright.async_api import async_playwright

                total_candidates = 0
                pages_completed = 0

                async with async_playwright() as pw:
                    browser = await pw.chromium.launch(
                        headless=True,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                        ],
                    )
                    context = await browser.new_context(
                        viewport={"width": 1920, "height": 1080},
                        user_agent=(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/125.0.0.0 Safari/537.36"
                        ),
                    )

                    try:
                        async for page_candidates in adapter.search(
                            context=context,
                            keywords=keywords,
                            location=location,
                            max_pages=max_pages,
                        ):
                            pages_completed += 1
                            page_count = len(page_candidates)

                            # 保存候选人
                            for record in page_candidates:
                                try:
                                    await save_candidate(db, record)
                                    total_candidates += 1
                                except Exception as exc:
                                    logger.error(f"保存候选人异常: {exc}")

                            # 更新进度（Celery 状态 + WebSocket 广播）
                            progress = {
                                "pages_completed": pages_completed,
                                "current_page_count": page_count,
                                "total_candidates": total_candidates,
                                "status": "running",
                            }
                            await update_task_progress(
                                db, task_uuid, progress, "running",
                            )

                            # 更新 Celery 任务 meta（前端轮询可见）
                            self.update_state(
                                state="PROGRESS",
                                meta=progress,
                            )

                    finally:
                        await context.close()
                        await browser.close()

                # 标记完成
                await complete_task(db, task_uuid, total_candidates, "completed")

                return {
                    "task_id": task_id,
                    "status": "completed",
                    "total_candidates": total_candidates,
                    "pages_completed": pages_completed,
                }

            except Exception as e:
                logger.exception(f"搜索任务失败: {e}")
                await fail_task(db, UUID(task_id), str(e))
                raise

    return asyncio.run(_run())


@celery_app.task(bind=True, name="batch_match_task")
def execute_batch_match_task(
    self,
    job_id: str,
    candidate_ids: list[str],
):
    """
    异步执行批量匹配分析任务。
    """
    from app.core.database import async_session
    from app.services.match_service import batch_match_analyze

    async def _run():
        from uuid import UUID

        async with async_session() as db:
            try:
                job_uuid = UUID(job_id)
                cids = [UUID(cid) for cid in candidate_ids]

                self.update_state(state="PROGRESS", meta={"status": "matching"})

                results = await batch_match_analyze(db, job_uuid, cids)

                stats = {
                    "total": len(results),
                    "s_count": sum(1 for r in results if r.get("rating") == "S"),
                    "a_count": sum(1 for r in results if r.get("rating") == "A"),
                    "b_count": sum(1 for r in results if r.get("rating") == "B"),
                    "c_count": sum(1 for r in results if r.get("rating") == "C"),
                }

                return {
                    "status": "completed",
                    "stats": stats,
                    "results": [
                        {
                            "candidate_id": r.get("candidate_id"),
                            "overall_score": r.get("overall_score"),
                            "rating": r.get("rating"),
                            "decision": r.get("decision"),
                        }
                        for r in results
                    ],
                }

            except Exception as e:
                logger.exception(f"批量匹配任务失败: {e}")
                raise

    return asyncio.run(_run())
