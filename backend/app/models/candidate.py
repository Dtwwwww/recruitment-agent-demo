"""候选人模型 (CandidateRecord)"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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
    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
