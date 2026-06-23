"""匹配结果模型 (MatchResult)"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Numeric, DateTime, func, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MatchResult(Base):
    __tablename__ = "match_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    overall_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    hard_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    soft_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    bonus_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    rating: Mapped[Optional[str]] = mapped_column(String(1))
    matched_points: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    gap_points: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    interview_questions: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    decision: Mapped[Optional[str]] = mapped_column(String(20))
    analysis_summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("candidate_id", "job_id", name="uq_candidate_job"),
    )
