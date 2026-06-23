"""JD 解析接口测试（需要 DashScope API Key）"""
import pytest
from httpx import AsyncClient

SAMPLE_JD = """高级后端工程师

岗位职责：
1. 负责公司核心业务系统的架构设计和开发
2. 带领5-10人技术团队完成项目交付
3. 参与技术选型和方案评审

任职要求：
1. 本科及以上学历，计算机相关专业
2. 5年以上Java/Go开发经验，精通微服务架构
3. 有金融行业系统开发经验优先
4. 具备良好的沟通能力和团队管理能力
5. 熟悉分布式系统、消息队列、缓存技术
"""


@pytest.mark.asyncio
async def test_parse_jd_missing_text(async_client: AsyncClient):
    """测试空 JD 文本"""
    response = await async_client.post("/api/v1/jd/parse", json={"raw_jd_text": ""})
    assert response.status_code == 422  # Pydantic 验证失败


@pytest.mark.asyncio
async def test_parse_jd_too_short(async_client: AsyncClient):
    """测试过短 JD 文本"""
    response = await async_client.post("/api/v1/jd/parse", json={"raw_jd_text": "招人"})
    assert response.status_code == 422  # min_length=10


@pytest.mark.asyncio
@pytest.mark.skip(reason="需要有效的 DashScope API Key")
async def test_parse_jd_success(async_client: AsyncClient):
    """测试完整 JD 解析流程（需要 API Key）"""
    response = await async_client.post("/api/v1/jd/parse", json={"raw_jd_text": SAMPLE_JD})
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["iceberg_above"] is not None
    assert data["iceberg_below"] is not None
    assert len(data["core_requirements"]) > 0


@pytest.mark.asyncio
async def test_parse_jd_schema_validation(async_client: AsyncClient):
    """测试 JD 文本过短时的 schema 验证"""
    response = await async_client.post(
        "/api/v1/jd/parse",
        json={"raw_jd_text": "too short"}
    )
    assert response.status_code == 422
