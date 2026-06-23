"""基础健康检查测试"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root(async_client: AsyncClient):
    """测试根路径"""
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "招聘全链路AI智能体"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_health(async_client: AsyncClient):
    """测试健康检查"""
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
