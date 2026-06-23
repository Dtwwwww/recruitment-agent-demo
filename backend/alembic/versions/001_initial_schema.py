"""Initial schema — 四张核心表

Revision ID: 001
Revises: None
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 启用 pgcrypto 扩展（用于 gen_random_uuid）
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # ── jobs 表 ──
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("raw_jd_text", sa.Text, nullable=False),
        sa.Column("structured_requirements", postgresql.JSONB, nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # ── candidates 表 ──
    op.create_table(
        "candidates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100)),
        sa.Column("current_title", sa.String(300)),
        sa.Column("current_company", sa.String(300)),
        sa.Column("experience_years", sa.Integer),
        sa.Column("education", sa.String(100)),
        sa.Column("school", sa.String(200)),
        sa.Column("skills", postgresql.ARRAY(sa.String)),
        sa.Column("industry_tags", postgresql.ARRAY(sa.String)),
        sa.Column("source_platform", sa.String(20)),
        sa.Column("source_url", sa.Text),
        sa.Column("raw_data", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # ── match_results 表 ──
    op.create_table(
        "match_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("candidates.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("overall_score", sa.Numeric(5, 2)),
        sa.Column("hard_score", sa.Numeric(5, 2)),
        sa.Column("soft_score", sa.Numeric(5, 2)),
        sa.Column("bonus_score", sa.Numeric(5, 2)),
        sa.Column("rating", sa.String(1)),
        sa.Column("matched_points", postgresql.ARRAY(sa.Text)),
        sa.Column("gap_points", postgresql.ARRAY(sa.Text)),
        sa.Column("interview_questions", postgresql.ARRAY(sa.Text)),
        sa.Column("decision", sa.String(20)),
        sa.Column("analysis_summary", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("candidate_id", "job_id", name="uq_candidate_job"),
    )

    # ── search_tasks 表 ──
    op.create_table(
        "search_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="SET NULL")),
        sa.Column("platform", sa.String(20)),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("progress", postgresql.JSONB),
        sa.Column("result_count", sa.Integer, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # ── 索引 ──
    op.create_index("ix_candidates_skills", "candidates", ["skills"], postgresql_using="gin")
    op.create_index("ix_candidates_industry", "candidates", ["industry_tags"], postgresql_using="gin")
    op.create_index("ix_match_rating", "match_results", ["rating"])
    op.create_index("ix_tasks_status", "search_tasks", ["status"])


def downgrade() -> None:
    op.drop_table("search_tasks")
    op.drop_table("match_results")
    op.drop_table("candidates")
    op.drop_table("jobs")
