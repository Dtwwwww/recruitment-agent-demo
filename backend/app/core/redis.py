"""Redis 连接管理"""
import redis.asyncio as aioredis
from app.core.config import get_settings

settings = get_settings()

redis_client = aioredis.from_url(
    settings.redis_url,
    encoding="utf-8",
    decode_responses=True,
)


async def get_redis():
    """FastAPI 依赖注入 — 获取 Redis 连接"""
    return redis_client
