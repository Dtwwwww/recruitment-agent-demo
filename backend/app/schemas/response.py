"""API 响应 Schema"""
from datetime import datetime
from typing import Optional, List, Union, Dict
from uuid import UUID

from pydantic import BaseModel, Field


# ── JD 解析响应 ──
class RequirementItem(BaseModel):
    category: str
    description: str
    priority: str = "core"  # core / important / bonus
    weight: float = 1.0
    is_must_have: bool = True
    match_type: str = "fuzzy"  # exact / range / fuzzy


class IcebergAbove(BaseModel):
    knowledge: List[RequirementItem] = []
    skills: List[RequirementItem] = []
    experience: List[RequirementItem] = []


class IcebergBelow(BaseModel):
    traits: List[RequirementItem] = []
    competencies: List[RequirementItem] = []
    motivations: List[RequirementItem] = []


class JobRequirementResponse(BaseModel):
    id: UUID
    title: str
    iceberg_above: IcebergAbove
    iceberg_below: IcebergBelow
    core_requirements: List[RequirementItem] = []
    important_requirements: List[RequirementItem] = []
    bonus_requirements: List[RequirementItem] = []


class JobListItemResponse(BaseModel):
    id: UUID
    title: str
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    core_count: int = 0
    important_count: int = 0
    bonus_count: int = 0


# ── 候选人响应 ──
class CandidateResponse(BaseModel):
    id: UUID
    name: Optional[str] = None
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: Optional[int] = None
    education: Optional[str] = None
    school: Optional[str] = None
    skills: List[str] = []
    industry_tags: List[str] = []
    source_platform: Optional[str] = None
    source_url: Optional[str] = None
    created_at: Optional[datetime] = None


# ── 匹配结果响应 ──
class MatchResultResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    overall_score: Optional[float] = None
    hard_score: Optional[float] = None
    soft_score: Optional[float] = None
    bonus_score: Optional[float] = None
    rating: Optional[str] = None  # S / A / B / C
    matched_points: List[str] = []
    gap_points: List[str] = []
    interview_questions: List[str] = []
    decision: Optional[str] = None  # interview / backup / reject
    analysis_summary: Optional[str] = None


# ── 搜索任务响应 ──
class SearchTaskResponse(BaseModel):
    task_id: UUID
    status: str
    progress: Optional[dict] = None
    result_count: int = 0
    error_message: Optional[str] = None


# ── 简历分析响应 ──

class ResumeBasicInfo(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    city: str = ""
    gender: str = ""
    age_range: str = ""


class ResumeJobPreference(BaseModel):
    desired_title: str = ""
    desired_industry: List[str] = []
    expected_salary: str = ""
    location: List[str] = []


class ResumeEducation(BaseModel):
    degree: str = ""
    school: str = ""
    major: str = ""
    graduation_year: str = ""
    is_elite_school: bool = False
    elite_note: str = ""


class WorkExperienceItem(BaseModel):
    company: str = ""
    title: str = ""
    start_date: str = ""
    end_date: str = ""
    duration: str = ""
    responsibilities: List[str] = []
    achievements: List[str] = []


class ResumeSkills(BaseModel):
    expert: List[str] = []
    proficient: List[str] = []
    familiar: List[str] = []
    categories: List[str] = []


class ProjectItem(BaseModel):
    name: str = ""
    role: str = ""
    tech_stack: List[str] = []
    highlights: List[str] = []
    duration: str = ""


class CareerTrajectory(BaseModel):
    total_years: float = 0
    company_count: int = 0
    avg_tenure_months: float = 0
    promotion_path: List[str] = []
    industry_span: List[str] = []
    stability_score: float = 0
    stability_assessment: str = ""


class ResumeAnalysisResponse(BaseModel):
    id: UUID
    basic_info: ResumeBasicInfo = ResumeBasicInfo()
    job_preference: ResumeJobPreference = ResumeJobPreference()
    education: ResumeEducation = ResumeEducation()
    work_experience: List[WorkExperienceItem] = []
    skills: ResumeSkills = ResumeSkills()
    projects: List[ProjectItem] = []
    career_trajectory: CareerTrajectory = CareerTrajectory()
    strengths: List[str] = []
    weaknesses: List[str] = []
    overall_rating: str = ""
    development_advice: List[str] = []
    analysis_summary: str = ""


# ── 通用响应 ──
class APIResponse(BaseModel):
    success: bool = True
    message: str = "ok"
    data: Optional[Union[Dict, List]] = None
