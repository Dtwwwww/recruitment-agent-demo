"""API 依赖注入 — 数据库会话、Redis 连接等"""
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.database import async_session
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

# 缓存DB连接检测结果，避免每次请求都超时等待
_db_available = None


async def get_db() -> Optional[AsyncSession]:
    """获取数据库会话（检测连接，无DB时返回None）"""
    global _db_available

    # 已验证过DB不可用，直接返回None
    if _db_available is False:
        return None

    try:
        session = async_session()
        # 立即测试连接
        async with session.begin():
            await session.execute(text("SELECT 1"))
        _db_available = True
        return session
    except Exception as e:
        _db_available = False
        logger.warning(f"数据库不可用，API将以只读模式运行: {e}")
        return None


async def get_redis() -> Optional[Redis]:
    """获取 Redis 连接（无Redis时返回None）"""
    try:
        await redis_client.ping()
        return redis_client
    except Exception:
        return None
