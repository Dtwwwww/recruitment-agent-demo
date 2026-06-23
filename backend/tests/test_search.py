"""搜索接口测试"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_execute_search_missing_keywords(async_client: AsyncClient):
    """测试缺少关键词"""
    response = await async_client.post(
        "/api/v1/search/execute",
        json={"platform": "liepin", "keywords": [], "location": "上海"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_execute_search_invalid_platform(async_client: AsyncClient):
    """测试无效平台"""
    response = await async_client.post(
        "/api/v1/search/execute",
        json={"platform": "unknown", "keywords": ["Java"], "location": "上海"},
    )
    assert response.status_code == 422  # pattern 验证失败


@pytest.mark.asyncio
async def test_get_task_not_found(async_client: AsyncClient):
    """测试查询不存在的任务"""
    response = await async_client.get(
        "/api/v1/search/00000000-0000-0000-0000-000000000001/status"
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_execute_search_valid(async_client: AsyncClient):
    """测试有效的搜索请求"""
    response = await async_client.post(
        "/api/v1/search/execute",
        json={
            "platform": "liepin",
            "keywords": ["Java架构师"],
            "location": "上海",
            "max_pages": 3,
        },
    )
    # 注意：需要 Celery/Redis 可用才能真正启动
    # 在 CI 环境无 Celery 时可能返回 503
    assert response.status_code in (200, 503)
