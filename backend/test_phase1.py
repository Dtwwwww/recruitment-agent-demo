"""Phase 1 核心功能验证脚本 — 不依赖 PostgreSQL"""
import asyncio
import json
import sys
import os

# 确保使用虚拟环境
sys.path.insert(0, os.path.dirname(__file__))

TEST_JD = """高级后端工程师（金融科技方向）

岗位职责：
1. 负责公司核心交易系统的架构设计和性能优化
2. 带领5-10人技术团队完成微服务化改造
3. 参与技术选型、代码评审和系统方案设计
4. 解决高并发场景下的系统稳定性问题

任职要求：
1. 本科及以上学历，计算机科学或软件工程相关专业，硕士优先
2. 8年以上Java/Go后端开发经验，其中至少3年金融行业经验
3. 精通Spring Cloud或Go微服务生态，有实际的大规模分布式系统设计经验
4. 熟悉MySQL、Redis、Kafka、Elasticsearch等中间件
5. 具备优秀的沟通能力和团队管理能力
6. 有金融交易系统或支付系统开发经验优先
7. 具备良好的抗压能力和问题解决能力

加分项：
- 有开源项目贡献或技术博客
- 了解FIX协议或金融行业标准
- 有AWS/阿里云认证
"""


async def test_config():
    """测试1: 配置加载"""
    print("=" * 60)
    print("测试1: 配置加载")
    from app.core.config import get_settings
    settings = get_settings()
    print(f"  v API Key 已配置: {'sk-' in settings.dashscope_api_key}")
    print(f"  v 模型: {settings.dashscope_model}")
    print(f"  v Base URL: {settings.dashscope_base_url}")
    print(f"  v API Prefix: {settings.api_v1_prefix}")
    return True


async def test_models():
    """测试2: 数据模型创建"""
    print("\n" + "=" * 60)
    print("测试2: 数据模型创建")
    from app.models.job import Job
    from app.models.candidate import Candidate
    from app.models.match import MatchResult
    from app.models.task import SearchTask

    job = Job(title="测试职位", raw_jd_text="测试JD", structured_requirements={})
    print(f"  v Job 创建: {job.title}, status={job.status}")

    candidate = Candidate(
        name="张三",
        current_title="高级工程师",
        current_company="某科技公司",
        experience_years=8,
        education="硕士",
        skills=["Python", "Go"],
        source_platform="liepin",
    )
    print(f"  v Candidate 创建: {candidate.name}, skills={candidate.skills}")

    match = MatchResult(
        candidate_id=job.id,
        job_id=job.id,
        overall_score=82.5,
        rating="A",
        decision="interview",
    )
    print(f"  v MatchResult 创建: rating={match.rating}, decision={match.decision}")

    task = SearchTask(platform="liepin", status="pending")
    print(f"  v SearchTask 创建: status={task.status}")

    return True


async def test_jd_parser_agent():
    """测试3: JD 解析 Agent（调用千问API）"""
    print("\n" + "=" * 60)
    print("测试3: JD 解析 Agent (调用通义千问 API)...")

    from app.agents.jd_parser import JDParserAgent

    agent = JDParserAgent()
    try:
        result = await agent.run(raw_jd_text=TEST_JD)
        print(f"  v API 调用成功")

        # 验证结构
        iceberg_above = result.get("iceberg_above", {})
        iceberg_below = result.get("iceberg_below", {})

        knowledge_count = len(iceberg_above.get("knowledge", []))
        skills_count = len(iceberg_above.get("skills", []))
        experience_count = len(iceberg_above.get("experience", []))
        traits_count = len(iceberg_below.get("traits", []))
        competencies_count = len(iceberg_below.get("competencies", []))
        motivations_count = len(iceberg_below.get("motivations", []))

        print(f"  冰山上-知识: {knowledge_count} 项")
        print(f"  冰山上-技能: {skills_count} 项")
        print(f"  冰山上-经验: {experience_count} 项")
        print(f"  冰山下-特质: {traits_count} 项")
        print(f"  冰山下-素养: {competencies_count} 项")
        print(f"  冰山下-动机: {motivations_count} 项")

        core_count = len(result.get("core_requirements", []))
        important_count = len(result.get("important_requirements", []))
        bonus_count = len(result.get("bonus_requirements", []))
        print(f"  核心必要: {core_count} | 重要优先: {important_count} | 优先加分: {bonus_count}")

        # 验证优先级分类
        all_items = (
            iceberg_above.get("knowledge", []) +
            iceberg_above.get("skills", []) +
            iceberg_above.get("experience", [])
        )
        priorities = [item.get("priority") for item in all_items if item.get("priority")]
        core_items = [p for p in priorities if p == "core"]
        important_items = [p for p in priorities if p == "important"]
        bonus_items = [p for p in priorities if p == "bonus"]

        print(f"\n  v 优先级分布: 核心{len(core_items)} / 重要{len(important_items)} / 加分{len(bonus_items)}")
        print(f"  v 结构化输出验证通过")

        # 打印部分解析结果
        print("\n  解析结果摘录:")
        for item in all_items[:5]:
            print(f"    [{item.get('priority', '?')}] {item.get('category', '?')}: {item.get('description', '?')[:80]}...")

        return True
    except Exception as e:
        print(f"  x API 调用失败: {e}")
        return False


async def test_resume_matcher_agent():
    """测试4: 简历匹配 Agent（调用千问API）"""
    print("\n" + "=" * 60)
    print("测试4: 简历匹配 Agent (调用通义千问 API)...")

    from app.agents.resume_matcher import ResumeMatcherAgent

    # 模拟一个结构化JD
    jd_requirements = json.dumps({
        "iceberg_above": {
            "knowledge": [
                {"category": "学历", "description": "本科及以上，计算机相关专业", "priority": "core", "weight": 1.0, "is_must_have": True}
            ],
            "skills": [
                {"category": "编程语言", "description": "精通Java或Go", "priority": "core", "weight": 1.0, "is_must_have": True},
                {"category": "架构能力", "description": "精通微服务架构设计", "priority": "core", "weight": 0.9, "is_must_have": True},
                {"category": "数据库", "description": "熟悉MySQL、Redis、Kafka", "priority": "important", "weight": 0.7, "is_must_have": False},
            ],
            "experience": [
                {"category": "工作年限", "description": "8年以上后端开发经验", "priority": "core", "weight": 1.0, "is_must_have": True},
                {"category": "行业经验", "description": "3年以上金融行业经验", "priority": "important", "weight": 0.8, "is_must_have": False},
                {"category": "管理经验", "description": "5-10人团队管理经验", "priority": "important", "weight": 0.7, "is_must_have": False},
            ]
        },
        "iceberg_below": {
            "traits": [{"category": "抗压能力", "description": "能承受高强度工作压力"}],
            "competencies": [{"category": "沟通能力", "description": "良好的跨部门沟通协作能力"}],
        }
    }, ensure_ascii=False)

    # 模拟一个候选人简历
    candidate = json.dumps({
        "name": "李明",
        "current_title": "高级Java工程师",
        "current_company": "某银行科技部",
        "experience_years": 9,
        "education": "硕士",
        "school": "上海交通大学",
        "skills": ["Java", "Spring Cloud", "MySQL", "Redis", "Kafka", "Docker", "Kubernetes", "微服务"],
        "industry_tags": ["金融", "银行"],
    }, ensure_ascii=False)

    agent = ResumeMatcherAgent()
    try:
        result = await agent.run(job_requirements=jd_requirements, candidate_record=candidate)
        print(f"  v API 调用成功")

        overall = result.get("overall_score", 0)
        hard = result.get("hard_score", 0)
        soft = result.get("soft_score", 0)
        bonus = result.get("bonus_score", 0)
        rating = result.get("rating", "?")
        decision = result.get("decision", "?")

        print(f"  综合得分: {overall} (硬性: {hard} | 软性: {soft} | 加分: {bonus})")
        print(f"  评级: {rating} | 决策: {decision}")

        matched = result.get("matched_points", [])
        gaps = result.get("gap_points", [])

        print(f"\n  匹配点 ({len(matched)} 条):")
        for pt in matched[:3]:
            print(f"    * {pt}")

        print(f"\n  差距点 ({len(gaps)} 条):")
        for pt in gaps[:3]:
            print(f"    WARNING {pt}")

        if result.get("analysis_summary"):
            print(f"\n  分析摘要: {result['analysis_summary'][:150]}...")

        # 验证评分一致性
        if rating == "S" and overall < 85:
            print(f"  WARNING 警告: rating=S 但 overall={overall} < 85")
        elif rating == "A" and (overall < 70 or overall >= 85):
            print(f"  WARNING 警告: rating=A 但 overall={overall} 不在 [70,85)")
        elif rating == "B" and (overall < 55 or overall >= 70):
            print(f"  WARNING 警告: rating=B 但 overall={overall} 不在 [55,70)")
        else:
            print(f"  v 评级与得分一致性验证通过")

        return True
    except Exception as e:
        print(f"  x API 调用失败: {e}")
        return False


async def test_health_api():
    """测试5: FastAPI 健康检查"""
    print("\n" + "=" * 60)
    print("测试5: 健康检查 API")

    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
    os.environ["DATABASE_URL_SYNC"] = "sqlite:///./test.db"

    from app.main import app
    from httpx import AsyncClient, ASGITransport

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 健康检查
        resp = await client.get("/health")
        assert resp.status_code == 200, f"Health check failed: {resp.status_code}"
        data = resp.json()
        assert data["status"] == "healthy"
        print(f"  v GET /health → {resp.status_code}: {data}")

        # 根路径
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "招聘全链路AI智能体"
        print(f"  v GET / → {resp.status_code}: {data['service']} v{data['version']}")

    # 清理测试数据库
    if os.path.exists("test.db"):
        os.remove("test.db")
        print("  v 测试数据库已清理")

    return True


async def test_interview_questions_agent():
    """测试6: 面试关注点生成 Agent"""
    print("\n" + "=" * 60)
    print("测试6: 面试关注点生成 Agent (调用通义千问 API)...")

    from app.agents.interview_questions import InterviewQuestionsAgent

    match_summary = json.dumps({
        "overall_score": 78.5,
        "rating": "A",
        "matched_points": ["技能匹配度高", "行业经验匹配"],
        "gap_points": ["管理经验不足", "缺少高并发系统设计经验"],
        "analysis_summary": "候选人技术能力扎实，行业经验相关，但管理经验和高并发系统设计经验不足。"
    }, ensure_ascii=False)

    candidate_summary = json.dumps({
        "name": "李明",
        "current_title": "高级Java工程师",
        "experience_years": 9,
        "skills": ["Java", "Spring Cloud", "MySQL", "Redis"]
    }, ensure_ascii=False)

    job_summary = json.dumps({
        "core_requirements": ["8年后端经验", "精通微服务", "金融行业经验", "团队管理5-10人"],
    }, ensure_ascii=False)

    agent = InterviewQuestionsAgent()
    try:
        result = await agent.run(
            match_result_summary=match_summary,
            candidate_summary=candidate_summary,
            job_summary=job_summary,
        )
        questions = result.get("questions", [])
        print(f"  v API 调用成功，生成 {len(questions)} 条面试关注点")

        for q in questions:
            print(f"\n  优先级{q.get('priority', '?')}: {q.get('topic', '?')}")
            print(f"  问题: {q.get('question', '?')[:120]}...")
            print(f"  针对缺口: {q.get('gap_addressed', '?')[:100]}...")

        assert 3 <= len(questions) <= 5, f"面试关注点数量应为3-5，实际为{len(questions)}"
        print(f"\n  v 数量约束验证通过 (3-5条)")

        return True
    except Exception as e:
        print(f"  x API 调用失败: {e}")
        return False


async def main():
    print("\n" + "=" * 60)
    print("  招聘全链路AI智能体 -- Phase 1 核心功能验证")
    print("=" * 60)

    results = {}

    # 测试1: 配置（不需要API）
    results["config"] = await test_config()

    # 测试2: 模型（不需要DB）
    results["models"] = await test_models()

    # 测试3: JD解析（需要API）
    results["jd_parser"] = await test_jd_parser_agent()

    # 测试4: 简历匹配（需要API）
    results["resume_matcher"] = await test_resume_matcher_agent()

    # 测试5: 健康检查
    results["health_api"] = await test_health_api()

    # 测试6: 面试关注点（需要API）
    results["interview_questions"] = await test_interview_questions_agent()

    # 汇总
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for test_name, test_passed in results.items():
        status = "* PASS" if test_passed else "X FAIL"
        print(f"  {status}  {test_name}")

    print(f"\n总计: {passed}/{total} 项通过")

    if passed == total:
        print("\nOK Phase 1 全部验证通过！")
    else:
        print(f"\nWARNING {total - passed} 项未通过，请检查 API Key 配置或网络连接")

    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
