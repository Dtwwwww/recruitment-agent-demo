"""人才库模型 — AI 筛选入库的简历"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Text, DateTime, Float, func
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Talent(Base):
    __tablename__ = "talents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[Optional[str]] = mapped_column(String(100))
    current_title: Mapped[Optional[str]] = mapped_column(String(300))
    current_company: Mapped[Optional[str]] = mapped_column(String(300))
    experience_years: Mapped[Optional[int]] = mapped_column(Integer)
    education: Mapped[Optional[str]] = mapped_column(String(100))
    school: Mapped[Optional[str]] = mapped_column(String(200))
    skills: Mapped[Optional[list]] = mapped_column(ARRAY(String))
    industry_tags: Mapped[Optional[list]] = mapped_column(ARRAY(String))
    source_platform: Mapped[Optional[str]] = mapped_column(String(20))
    source_url: Mapped[Optional[str]] = mapped_column(Text)

    # AI 分析
    resume_json: Mapped[Optional[dict]] = mapped_column(JSONB)     # AI 提取的完整简历
    quick_score: Mapped[Optional[float]] = mapped_column(Float)    # 快速匹配分
    match_json: Mapped[Optional[dict]] = mapped_column(JSONB)      # 匹配分析结果
    interview_json: Mapped[Optional[dict]] = mapped_column(JSONB)  # 面试题

    # 原图
    screenshot_path: Mapped[Optional[str]] = mapped_column(Text)

    # 状态
    status: Mapped[str] = mapped_column(String(20), default="new")
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
