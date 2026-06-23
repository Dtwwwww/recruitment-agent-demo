"""数据模型单元测试"""
import pytest
import uuid
from app.models.job import Job
from app.models.candidate import Candidate
from app.models.match import MatchResult
from app.models.task import SearchTask


class TestJob:
    def test_job_creation(self):
        job = Job(
            title="高级Java工程师",
            raw_jd_text="岗位描述...",
            structured_requirements={"skills": ["Java", "Spring"]},
        )
        assert job.title == "高级Java工程师"
        assert job.status == "active"
        assert job.structured_requirements["skills"] == ["Java", "Spring"]

    def test_job_defaults(self):
        job = Job(
            title="测试",
            raw_jd_text="测试JD",
            structured_requirements={},
        )
        assert job.status == "active"
        assert isinstance(job.structured_requirements, dict)


class TestCandidate:
    def test_candidate_creation(self):
        candidate = Candidate(
            name="张三",
            current_title="高级工程师",
            current_company="某科技公司",
            experience_years=8,
            education="硕士",
            school="清华大学",
            skills=["Python", "Go", "微服务"],
            industry_tags=["互联网", "金融"],
            source_platform="liepin",
            source_url="https://liepin.com/xxx",
        )
        assert candidate.name == "张三"
        assert len(candidate.skills) == 3
        assert candidate.experience_years == 8


class TestMatchResult:
    def test_match_result_creation(self):
        cid = uuid.uuid4()
        jid = uuid.uuid4()
        match = MatchResult(
            candidate_id=cid,
            job_id=jid,
            overall_score=82.5,
            hard_score=85.0,
            soft_score=78.0,
            bonus_score=75.0,
            rating="A",
            matched_points=["技能匹配度高", "行业经验匹配"],
            gap_points=["管理经验不足"],
            interview_questions=["请描述管理最大团队的规模"],
            decision="interview",
        )
        assert match.rating == "A"
        assert match.overall_score == 82.5
        assert match.decision == "interview"


class TestSearchTask:
    def test_search_task_creation(self):
        task = SearchTask(
            platform="liepin",
            status="pending",
            progress={"keywords": ["Java"], "location": "上海"},
        )
        assert task.status == "pending"
        assert task.result_count == 0

    def test_search_task_failure(self):
        task = SearchTask(
            platform="liepin",
            status="failed",
            error_message="Rate limit exceeded",
        )
        assert task.status == "failed"
        assert "Rate limit" in task.error_message
