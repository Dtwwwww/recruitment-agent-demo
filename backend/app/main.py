"""FastAPI 应用入口"""
import asyncio
import sys
# Windows: Playwright 子进程需要 ProactorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_db_connected = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global _db_connected

    # 启动时 — 初始化适配器注册表
    from app.adapters.registry import init_adapters
    init_adapters()

    # 启动时 — 测试数据库连接（非致命）
    from app.core.database import engine
    try:
        async with engine.begin() as conn:
            await conn.execute(select(1))
        _db_connected = True
        logger.info("数据库连接成功")
    except Exception as e:
        logger.warning(f"数据库连接失败，将以无DB模式运行: {e}")

    yield

    # 关闭时 — 清理资源
    try:
        from app.core.redis import redis_client
        await redis_client.close()
    except Exception:
        pass
    try:
        from app.core.database import engine
        await engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title="招聘全链路AI智能体 API",
    description="Recruitment Full-Chain AI Agent",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from app.api.v1 import jd, search, match, decision, ws, candidates, talent  # noqa: E402

app.include_router(jd.router, prefix=settings.api_v1_prefix, tags=["JD解析"])
app.include_router(search.router, prefix=settings.api_v1_prefix, tags=["渠道搜索"])
app.include_router(match.router, prefix=settings.api_v1_prefix, tags=["匹配分析"])
app.include_router(decision.router, prefix=settings.api_v1_prefix, tags=["面试决策"])
app.include_router(candidates.router, prefix=settings.api_v1_prefix, tags=["候选人"])
app.include_router(talent.router, prefix=settings.api_v1_prefix, tags=["人才库"])
app.include_router(ws.router, prefix="", tags=["WebSocket"])


@app.get("/")
async def root():
    return {
        "service": "招聘全链路AI智能体",
        "version": "1.0.0",
        "status": "running",
        "db_connected": _db_connected,
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "db": "connected" if _db_connected else "unavailable",
    }
