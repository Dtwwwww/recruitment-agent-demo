"""人才库请求/响应 Schema"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


# ── 请求 ──

class ScreenRequest(BaseModel):
    """AI 筛选简历并入库"""
    job_id: UUID
    platform: str = Field(default="liepin", pattern="^(liepin|bosszhipin)$")
    keywords: List[str] = Field(..., min_length=1)
    location: str = Field(default="上海")
    max_pages: int = Field(default=5, ge=1, le=20)


class TalentMatchRequest(BaseModel):
    """批量匹配分析"""
    job_id: UUID
    talent_ids: List[UUID] = Field(..., min_length=1, max_length=100)


class InterviewRequest(BaseModel):
    """确认邀约面试"""
    job_id: UUID
    candidate_data: Optional[dict] = None  # 候选人基础数据（名/职位/技能等）


# ── 响应 ──

class TalentListItem(BaseModel):
    id: UUID
    name: Optional[str]
    current_title: Optional[str]
    current_company: Optional[str]
    experience_years: Optional[int]
    education: Optional[str]
    school: Optional[str]
    skills: List[str] = []
    source_platform: Optional[str]
    source_url: Optional[str] = None
    quick_score: Optional[float]
    status: str
    job_id: Optional[UUID]
    created_at: Optional[datetime]


class TalentDetail(BaseModel):
    id: UUID
    name: Optional[str]
    current_title: Optional[str]
    current_company: Optional[str]
    experience_years: Optional[int]
    education: Optional[str]
    school: Optional[str]
    skills: List[str] = []
    industry_tags: List[str] = []
    source_platform: Optional[str]
    source_url: Optional[str]
    resume_json: Optional[dict]
    quick_score: Optional[float]
    match_json: Optional[dict]
    interview_json: Optional[dict]
    screenshot_url: Optional[str]
    status: str
    job_id: Optional[UUID]
    created_at: Optional[datetime]


class ScreenProgress(BaseModel):
    task_id: str
    status: str  # running / completed / failed
    platform: str
    total_screened: int
    total_added: int
    current_page: int
    message: str


class MatchSummary(BaseModel):
    talent_id: UUID
    name: Optional[str]
    current_title: Optional[str]
    current_company: Optional[str]
    rating: Optional[str]
    overall_score: Optional[float]
    hard_score: Optional[float]
    soft_score: Optional[float]
    bonus_score: Optional[float]
    matched_points: List[str] = []
    gap_points: List[str] = []
    interview_questions: List[str] = []
    decision: Optional[str]
    analysis_summary: Optional[str]
