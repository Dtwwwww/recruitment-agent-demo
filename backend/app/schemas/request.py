"""API 请求 Schema"""
from typing import Optional, List, Tuple
from uuid import UUID

from pydantic import BaseModel, Field


class JDParseRequest(BaseModel):
    """JD 解析请求"""
    raw_jd_text: str = Field(..., description="原始JD文本", min_length=10)


class SearchExecuteRequest(BaseModel):
    """执行搜索请求"""
    platform: str = Field(..., description="平台: liepin / bosszhipin", pattern="^(liepin|bosszhipin)$")
    keywords: List[str] = Field(..., description="搜索关键词组合", min_length=1)
    location: str = Field(..., description="目标城市/区域")
    job_id: Optional[UUID] = Field(None, description="关联的职位ID")
    industry: Optional[List[str]] = Field(None, description="目标行业标签")
    experience_years: Optional[Tuple[int, int]] = Field(None, description="经验年限范围 [min, max]")
    education: Optional[str] = Field(None, description="最低学历要求")
    max_pages: int = Field(10, description="最大翻页数", ge=1, le=50)


class MatchAnalyzeRequest(BaseModel):
    """批量匹配分析请求"""
    job_id: UUID = Field(..., description="职位ID")
    candidate_ids: List[UUID] = Field(..., description="候选人ID列表", min_length=1, max_length=100)


class DecisionRecommendRequest(BaseModel):
    """面试决策请求"""
    job_id: UUID = Field(..., description="职位ID")
    candidate_ids: List[UUID] = Field(..., description="候选人ID列表", min_length=1)


class CreateCandidateRequest(BaseModel):
    """手动创建候选人"""
    name: str = Field(..., min_length=1)
    current_title: str = ""
    current_company: str = ""
    experience_years: Optional[int] = None
    education: str = ""
    school: str = ""
    skills: List[str] = []
    industry_tags: List[str] = []
    source_platform: str = "手动录入"
    raw_text: str = ""
