from __future__ import annotations
"""LLM Agent 基类 — DashScope (通义千问) OpenAI 兼容模式"""
import json
from typing import TypeVar, Generic
from openai import AsyncOpenAI
from app.core.config import get_settings

T = TypeVar("T")
settings = get_settings()


class BaseAgent(Generic[T]):
    """
    封装通义千问 API 调用与结构化 JSON 输出。
    子类只需定义 system_prompt 和 build_user_prompt()。
    """

    def __init__(self, model: str | None = None):
        from httpx import AsyncClient, Limits
        http_client = AsyncClient(
            timeout=300.0,  # 5 分钟超时，长文本分析需要时间
            limits=Limits(max_keepalive_connections=5),
        )
        self.client = AsyncOpenAI(
            api_key=settings.dashscope_api_key,
            base_url=settings.dashscope_base_url,
            http_client=http_client,
        )
        self.model = model or settings.dashscope_model

    @property
    def system_prompt(self) -> str:
        """子类覆盖：系统指令"""
        raise NotImplementedError

    def build_user_prompt(self, **kwargs) -> str:
        """子类覆盖：构建用户消息"""
        raise NotImplementedError

    async def run(self, **kwargs) -> T:
        """调用千问并解析为结构化 JSON"""
        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=0.1,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": self.build_user_prompt(**kwargs)},
            ],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return json.loads(content)
