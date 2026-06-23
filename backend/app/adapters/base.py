"""平台适配器基类 — 同步版本（Python 3.8 Windows 兼容）"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator, Optional


@dataclass
class CandidateRecord:
    """标准化候选人记录"""
    name: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: Optional[int] = None
    education: Optional[str] = None
    school: Optional[str] = None
    skills: list[str] = field(default_factory=list)
    industry_tags: list[str] = field(default_factory=list)
    source_platform: str = ""
    source_url: Optional[str] = None
    raw_data: dict = field(default_factory=dict)
    expected_salary: Optional[str] = None
    job_status: Optional[str] = None
    last_active: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None


class BaseAdapter(ABC):
    """所有平台适配器必须实现的接口（同步版本）"""

    platform: str = "unknown"
    base_url: str = ""

    @abstractmethod
    def search(
        self,
        context,  # sync BrowserContext
        keywords: list[str],
        location: str,
        industry: list[str] | None = None,
        experience_years: tuple[int, int] | None = None,
        education: str | None = None,
        max_pages: int = 5,
        progress_cb=None,
    ) -> Iterator[list[CandidateRecord]]:
        """执行搜索，逐页 yield 解析后的候选人列表。progress_cb(page_num, candidate_count, status_text) 用于实时进度报告"""

    @abstractmethod
    def parse_detail(self, context, candidate_url: str) -> CandidateRecord:
        """解析候选人详情页"""
        ...

    @abstractmethod
    def normalize(self, raw: dict) -> CandidateRecord:
        """将平台原始数据标准化为 CandidateRecord"""
        ...


class AdapterError(Exception):
    pass


class LoginExpiredError(AdapterError):
    pass


class RateLimitError(AdapterError):
    pass


class CaptchaError(AdapterError):
    pass
