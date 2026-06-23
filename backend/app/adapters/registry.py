from __future__ import annotations
"""适配器注册表 — 管理与获取平台适配器实例"""
from typing import Type
from app.adapters.base import BaseAdapter


class AdapterRegistry:
    """平台适配器注册表，支持按名称获取适配器"""

    _adapters: dict[str, BaseAdapter] = {}

    @classmethod
    def register(cls, adapter: BaseAdapter) -> None:
        """注册一个适配器实例"""
        cls._adapters[adapter.platform] = adapter

    @classmethod
    def get(cls, platform: str) -> BaseAdapter:
        """获取指定平台的适配器"""
        if platform not in cls._adapters:
            raise ValueError(f"不支持的平台: {platform}，已注册: {list(cls._adapters.keys())}")
        return cls._adapters[platform]

    @classmethod
    def list_platforms(cls) -> list[str]:
        """列出所有已注册平台"""
        return list(cls._adapters.keys())

    @classmethod
    def is_supported(cls, platform: str) -> bool:
        return platform in cls._adapters


# 启动时自动注册所有适配器
def init_adapters():
    """在应用启动时调用，注册所有可用适配器"""
    from app.adapters.liepin import LiepinAdapter  # noqa: F401
