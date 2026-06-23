from __future__ import annotations
"""WebSocket 接口 — /ws/v1/search/{task_id}/progress"""
import json
import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import async_session
from app.models.task import SearchTask

logger = logging.getLogger(__name__)

router = APIRouter()

# 活跃连接池: {task_id: [WebSocket, ...]}
active_connections: dict[str, list[WebSocket]] = {}


@router.websocket("/ws/v1/search/{task_id}/progress")
async def search_progress_websocket(websocket: WebSocket, task_id: str):
    """
    WebSocket 实时进度推送。

    连接后持续推送搜索任务的进度更新，直到任务完成。
    推送格式: {"page": N, "total": N, "count": N, "status": "..."}
    """
    await websocket.accept()
    logger.info(f"WebSocket 已连接: task_id={task_id}")

    # 注册连接
    if task_id not in active_connections:
        active_connections[task_id] = []
    active_connections[task_id].append(websocket)

    try:
        # 首次推送当前状态
        async with async_session() as db:
            try:
                uuid_id = UUID(task_id)
                result = await db.execute(
                    select(SearchTask).where(SearchTask.id == uuid_id)
                )
                task = result.scalar_one_or_none()
                if task:
                    await websocket.send_json({
                        "task_id": str(task.id),
                        "status": task.status,
                        "progress": task.progress,
                        "result_count": task.result_count,
                    })
            except ValueError:
                await websocket.send_json({"error": "无效的任务ID"})
                return

        # 保持连接，等待前端关闭
        while True:
            try:
                # 接收心跳消息（无实际数据，仅维持连接）
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")

                # 检查任务状态并推送更新
                async with async_session() as db:
                    try:
                        uuid_id = UUID(task_id)
                        result = await db.execute(
                            select(SearchTask).where(SearchTask.id == uuid_id)
                        )
                        task = result.scalar_one_or_none()
                        if task:
                            await websocket.send_json({
                                "task_id": str(task.id),
                                "status": task.status,
                                "progress": task.progress,
                                "result_count": task.result_count,
                            })
                            # 任务结束则通知并等待客户端关闭
                            if task.status in ("completed", "failed"):
                                await websocket.send_json({
                                    "type": "task_complete",
                                    "status": task.status,
                                })
                    except Exception:
                        pass

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket 异常: {e}")
                break

    finally:
        # 清理连接
        if task_id in active_connections:
            active_connections[task_id].remove(websocket)
            if not active_connections[task_id]:
                del active_connections[task_id]


# ═══════════════════════════════════════════════
#  猎聘企业版 WebSocket
# ═══════════════════════════════════════════════

@router.websocket("/ws/v1/liepin/{task_id}/progress")
async def liepin_progress_websocket(websocket: WebSocket, task_id: str):
    """猎聘企业版 WebSocket 实时进度推送"""
    from app.services.liepin_service import get_task as _get_liepin_task

    await websocket.accept()
    logger.info(f"[Liepin WS] 已连接: {task_id}")

    if task_id not in liepin_ws_connections:
        liepin_ws_connections[task_id] = []
    liepin_ws_connections[task_id].append(websocket)

    try:
        ctrl = _get_liepin_task(task_id)
        if ctrl:
            await websocket.send_json({
                "task_id": task_id,
                "type": "phase_change",
                "phase": ctrl.phase,
                "total_candidates": ctrl.total_candidates,
                "current_index": ctrl.current_index,
                "scraped_count": len(ctrl.scraped),
                "status_text": ctrl.status_text,
                "latest_candidate": ctrl.scraped[-1] if ctrl.scraped else None,
                "error_message": ctrl.error_message,
            })

        while True:
            try:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"[Liepin WS] 异常: {e}")
    finally:
        if task_id in liepin_ws_connections:
            liepin_ws_connections[task_id].remove(websocket)
            if not liepin_ws_connections[task_id]:
                del liepin_ws_connections[task_id]


liepin_ws_connections: dict[str, list[WebSocket]] = {}


def get_liepin_connections(task_id: str) -> list[WebSocket]:
    """供 service 层调用，获取猎聘企业版 WS 连接"""
    return liepin_ws_connections.get(task_id, [])


def broadcast_progress(task_id: str, progress: dict):
    """向所有监听该任务的 WebSocket 客户端广播进度"""
    import asyncio

    connections = active_connections.get(task_id, [])
    for ws in connections:
        try:
            # 需要在事件循环中执行
            asyncio.create_task(ws.send_json({
                "task_id": task_id,
                "status": progress.get("status", "running"),
                "progress": progress,
            }))
        except Exception as e:
            logger.error(f"广播进度失败: {e}")
