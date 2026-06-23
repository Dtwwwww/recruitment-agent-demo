# 招聘全链路AI智能体 — 落地项目计划

## Context

基于《招聘全链路AI智能体·产品场景与功能描述文档》(v1.0, 2026/06)，本文档从资深 Agent 开发工程师的角度，给出一个**可落地、分阶段、有明确交付物**的工程实施计划。目标是将文档中描述的四大功能模块：渠道搜索、简历与JD交叉分析、SABC评级、面试决策建议——转化为一个真正可运行的生产级系统。

---

## 一、技术选型与架构总览

### 1.1 总体架构

```
┌─────────────────────────────────────────────────┐
│                  Frontend (Next.js)               │
│           HR管理面板 · 数据看板 · 结果审查          │
└─────────────────────┬───────────────────────────┘
                      │ REST + WebSocket
┌─────────────────────▼───────────────────────────┐
│               API Gateway (FastAPI)               │
│     /jd/parse · /search/execute · /match/analyze  │
│          /decision/recommend · /ws/progress        │
└───────┬─────────────────┬───────────────────────┘
        │                 │
┌───────▼───────┐  ┌──────▼───────────────────────┐
│  Task Queue   │  │    LLM Orchestration Layer    │
│  (Celery +    │  │  - JD Parser Agent            │
│   Redis)      │  │  - Resume Matcher Agent       │
│               │  │  - Interview Q Generator      │
│               │  │  (通义千问 API (DashScope))       │
└───────┬───────┘  └──────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────┐
│           Platform Adapter Layer                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ LiepinAdapter│  │BOSSZhipin    │              │
│  │ (Playwright) │  │Adapter(PW)   │              │
│  └──────────────┘  └──────────────┘              │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│            Data Layer                             │
│  PostgreSQL (业务数据) + pgvector (语义匹配)       │
│  Redis (缓存/任务队列/进度状态)                    │
│  MinIO (简历文件/附件存储)                         │
└─────────────────────────────────────────────────┘
```

### 1.2 技术栈选择

| 层次 | 技术选型 | 选型理由 |
|------|---------|---------|
| **前端** | Next.js 14 + shadcn/ui + Tailwind CSS | 快速构建管理面板，shadcn/ui组件丰富 |
| **API层** | Python FastAPI + Pydantic v2 | 异步支持好、类型安全、生态成熟 |
| **LLM编排** | 阿里云百炼 DashScope（通义千问 qwen-max） | 国内可购、OpenAI兼容接口、结构化输出能力强、中文场景优化 |
| **任务队列** | Celery + Redis Broker | Python生态标准方案，支持异步搜索任务 |
| **浏览器自动化** | Playwright + playwright-stealth | 反检测能力强，支持多平台适配 |
| **数据库** | PostgreSQL 16 + pgvector | 关系型+向量检索一体化 |
| **缓存** | Redis 7 | 任务状态、搜索进度、Session管理 |
| **部署** | Docker Compose (dev) / K8s (prod) | 可渐进式部署 |

### 1.3 关键架构决策

1. **Adapter Pattern（适配器模式）**：每个招聘平台一个独立Adapter，统一输出 `CandidateRecord`，新增平台只需新增Adapter
2. **Pipeline Pattern（管道模式）**：搜索→解析→匹配→评级→决策，每阶段可独立横向扩展
3. **Async-First**：搜索任务异步执行（WebSocket推送进度），LLM调用支持批量并发
4. **Human-in-the-Loop**：评级结果是建议而非最终决策，HR始终在决策闭环中

---

## 二、项目结构

```
recruitment-agent/
├── frontend/                    # Next.js 管理面板
│   ├── src/
│   │   ├── app/                # App Router 页面
│   │   │   ├── dashboard/      # 数据看板
│   │   │   ├── jobs/           # 职位管理
│   │   │   ├── candidates/     # 候选人管理
│   │   │   └── search/         # 搜索任务管理
│   │   ├── components/         # 通用组件
│   │   └── lib/                # API客户端
│   └── package.json
│
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── jd.py               # POST /jd/parse
│   │   │   │   ├── search.py           # POST /search/execute
│   │   │   │   ├── match.py            # POST /match/analyze
│   │   │   │   ├── decision.py         # POST /decision/recommend
│   │   │   │   └── ws.py               # WS /ws/search/progress
│   │   │   └── deps.py                 # 依赖注入
│   │   ├── core/
│   │   │   ├── config.py               # 配置管理（Pydantic Settings）
│   │   │   ├── database.py             # PostgreSQL + pgvector
│   │   │   └── redis.py                # Redis连接
│   │   ├── models/
│   │   │   ├── candidate.py            # CandidateRecord ORM
│   │   │   ├── job.py                  # JobRequirement ORM
│   │   │   ├── match.py                # MatchResult ORM
│   │   │   └── task.py                 # SearchTask ORM
│   │   ├── adapters/
│   │   │   ├── base.py                 # BaseAdapter 抽象类
│   │   │   ├── liepin.py               # 猎聘适配器
│   │   │   ├── bosszhipin.py           # BOSS直聘适配器
│   │   │   └── registry.py             # 适配器注册表
│   │   ├── agents/                     # LLM Agent 层
│   │   │   ├── base.py                 # BaseAgent（DashScope SDK封装）
│   │   │   ├── jd_parser.py            # JD结构化解析Agent
│   │   │   ├── resume_matcher.py       # 简历匹配分析Agent
│   │   │   ├── rating.py               # SABC评级Agent
│   │   │   └── interview_questions.py  # 面试关注点生成Agent
│   │   ├── services/
│   │   │   ├── search_service.py       # 搜索编排服务
│   │   │   ├── match_service.py        # 匹配分析服务
│   │   │   ├── dedup_service.py        # 去重服务
│   │   │   └── decision_service.py     # 决策服务
│   │   ├── tasks/
│   │   │   └── celery_tasks.py         # Celery异步任务
│   │   └── schemas/
│   │       ├── request.py              # 请求Schema
│   │       └── response.py             # 响应Schema
│   ├── alembic/                        # 数据库迁移
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 三、核心模块详细设计

### 3.1 Platform Adapter Layer（平台适配层）

这是整个系统**技术难度最高**的模块。猎聘和BOSS直聘的反爬机制非常严格，需要精心设计。

```python
# adapters/base.py — 适配器基类设计

from abc import ABC, abstractmethod
from typing import AsyncIterator
from playwright.async_api import BrowserContext

class BaseAdapter(ABC):
    """所有平台适配器必须实现的接口"""
    
    platform: str  # "liepin" | "bosszhipin"
    base_url: str
    
    @abstractmethod
    async def search(
        self,
        context: BrowserContext,
        keywords: list[str],
        location: str,
        industry: list[str] | None = None,
        experience_years: tuple[int, int] | None = None,
        education: str | None = None,
        max_pages: int = 10,
    ) -> AsyncIterator[list[dict]]:  # 逐页yield结果
        """执行搜索，逐页返回解析后的候选人列表"""
        ...
    
    @abstractmethod
    async def parse_detail(
        self,
        context: BrowserContext,
        candidate_url: str,
    ) -> dict:
        """解析候选人详情页"""
        ...
    
    @abstractmethod
    def normalize(self, raw: dict) -> CandidateRecord:
        """将平台原始数据标准化为CandidateRecord"""
        ...
```

**关键实现策略：**

1. **反检测方案**：
   - 使用 `playwright-stealth` 掩盖自动化特征
   - 注入反检测脚本（屏蔽 `navigator.webdriver` 等）
   - 随机化操作间隔（模拟人类浏览行为）
   - 登录态持久化（Cookie/Session复用）
   - IP代理池（如遇IP封禁则轮换）

2. **猎聘适配器** (Day 1-4)：
   - 搜索页URL: `https://www.liepin.com/zhaopin/?key={keyword}&dqs={location_code}`
   - 列表页DOM解析：候选人卡片 → 姓名/职位/公司/年限/学历
   - 详情页解析：需进入每个候选人的详情页获取完整简历
   - 分页：URL query参数 `?currentPage=N`

3. **BOSS直聘适配器** (Day 5-9)：
   - 搜索页URL: `https://www.zhipin.com/web/geek/job?query={keyword}&city={city_code}`
   - 列表页DOM解析：候选人卡片
   - 在线简历：BOSS直聘的简历格式较简洁，部分字段（期望薪资、在线状态）为平台特有
   - 反爬更强：需处理行为验证、设备指纹检测

### 3.2 LLM Agent Layer（智能体推理层）

```python
# agents/base.py — DashScope SDK 封装（OpenAI 兼容模式）

from openai import AsyncOpenAI
from typing import TypeVar, Generic

T = TypeVar('T')

class BaseAgent(Generic[T]):
    """LLM Agent基类，封装通义千问 API 调用与结构化输出"""
    
    def __init__(self, model: str = "qwen-max"):
        self.client = AsyncOpenAI(
            api_key="sk-xxx",  # DashScope API Key
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        self.model = model
    
    async def run(self, prompt: str, output_schema: type[T]) -> T:
        """调用千问并强制结构化输出"""
        # 使用 response_format + JSON Schema 约束输出
        ...
```

**DashScope接入说明：**
- 阿里云百炼平台支持 **OpenAI兼容接口**，可直接使用 `openai` Python SDK 调用千问系列模型
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`（国内）/ `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`（国际）
- 结构化输出：千问 `qwen-max/qwen-plus` 均支持 `response_format: {"type": "json_object"}` 和 Function Calling，可在Prompt中定义 JSON Schema 约束
- API Key 获取：阿里云百炼控制台 → 模型服务 → API-KEY 管理

**三个核心Agent的Prompt设计（按文档Section 07增强）：**

#### Agent 1: JD解析器 (`jd_parser.py`)
- **输入**：原始JD文本（自由文本/HTML/PDF）
- **输出**：`JobRequirement` 结构化对象
- **Prompt关键约束**：
  - 角色：15年经验的猎头顾问
  - 冰山模型分层：冰山上（知识/技能/经验）← 冰山下（特质/素养/动机）
  - 三级优先级分类：核心必要 / 重要优先 / 优先加分
  - 禁止推测：JD未提及的能力不得自行添加
  - 输出：严格JSON Schema，不做自由文本
- **预估Token消耗**：input ~2K, output ~1K

#### Agent 2: 简历匹配分析器 (`resume_matcher.py`)
- **输入**：`JobRequirement` + `CandidateRecord`
- **输出**：`MatchResult`（含三项得分 + SABC定级 + 匹配点和差距点）
- **Prompt关键约束**：
  - 逐项比对，不做模糊推断
  - 硬性条件精确匹配（60%权重）
  - 软性素质基于职业轨迹推断（25%权重）
  - 加分项匹配（15%权重）
  - 匹配点与差距点各≥3条
  - 综合得分必须有明确计算依据
- **预估Token消耗**：input ~3K, output ~1.5K

#### Agent 3: 面试关注点生成器 (`interview_questions.py`)
- **输入**：`MatchResult` + `CandidateRecord` + `JobRequirement`
- **输出**：3-5条个性化面试关注点
- **Prompt关键约束**：
  - 聚焦简历信息缺口，不是复述简历内容
  - 每条必须具体、可验证
  - 按重要性排序
  - 数量严格控制在3-5条
- **预估Token消耗**：input ~2K, output ~0.5K

### 3.3 Dedup Engine（去重引擎）

```python
# services/dedup_service.py

class DedupService:
    """跨平台候选人去重"""
    
    def find_duplicates(
        self,
        candidates: list[CandidateRecord],
    ) -> dict[str, list[str]]:
        """返回 {保留ID: [重复ID列表]}"""
        # 策略：
        # 1. 强匹配：手机号/邮箱完全一致 → 直接合并
        # 2. 中等匹配：姓名 + 当前公司 + 职位 → 高置信度合并
        # 3. 弱匹配：姓名 + 学校 + 专业 → 人工确认
        # 使用 PostgreSQL 的 pg_trgm 扩展做模糊匹配
        ...
```

### 3.4 数据库Schema（核心表）

```sql
-- jobs 表：存储结构化JD
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    raw_jd_text TEXT NOT NULL,
    structured_requirements JSONB NOT NULL,  -- JobRequirement
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- candidates 表：存储标准化候选人
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    current_title VARCHAR(300),
    current_company VARCHAR(300),
    experience_years INTEGER,
    education VARCHAR(100),
    school VARCHAR(200),
    skills TEXT[],
    industry_tags TEXT[],
    source_platform VARCHAR(20),  -- liepin | bosszhipin
    source_url TEXT,
    raw_data JSONB,               -- 原始抓取数据
    embedding VECTOR(1536),       -- 语义向量（可选）
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- match_results 表：存储匹配分析结果
CREATE TABLE match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id),
    job_id UUID REFERENCES jobs(id),
    overall_score DECIMAL(5,2),
    hard_score DECIMAL(5,2),
    soft_score DECIMAL(5,2),
    bonus_score DECIMAL(5,2),
    rating VARCHAR(1),            -- S, A, B, C
    matched_points TEXT[],
    gap_points TEXT[],
    interview_questions TEXT[],
    decision VARCHAR(20),         -- interview, backup, reject
    analysis_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(candidate_id, job_id)
);

-- search_tasks 表：异步搜索任务追踪
CREATE TABLE search_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id),
    platform VARCHAR(20),
    status VARCHAR(20),           -- pending/running/completed/failed
    progress JSONB,               -- {current_page, total_pages, fetched_count}
    result_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);
```

---

## 四、API详细设计

按照文档Section 05定义的5个接口，补充HTTP语义和错误处理：

| 端点 | 方法 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| `/api/v1/jd/parse` | POST | `{raw_jd_text: str}` | `JobRequirement` | 同步返回，~5s |
| `/api/v1/search/execute` | POST | `SearchConfig` | `{task_id: UUID}` | 异步启动，返回task_id |
| `/api/v1/search/{task_id}/status` | GET | — | `SearchTask` 状态 | 轮询进度 |
| `/api/v1/search/{task_id}/results` | GET | — | `CandidateRecord[]` | 获取搜索结果 |
| `/api/v1/match/analyze` | POST | `{job_id, candidate_ids[]}` | `MatchResult[]` | 批量分析，支持最多100份 |
| `/api/v1/decision/recommend` | POST | `{job_id, candidate_ids[]}` | `DecisionList` | 含排序和面试关注点 |
| `/ws/v1/search/{task_id}/progress` | WS | — | 实时进度推送 | `{page, total, count}` |

---

## 五、分阶段实施计划

### Phase 1: 核心链路打通（Day 1-4，目标：端到端可用）

**交付物：猎聘渠道可搜索 → 简历入库 → JD解析 → 匹配打分 → SABC评级 → 简单Web界面可查看结果**

| 任务 | 负责 | 预估人天 | 关键产出 |
|------|------|---------|---------|
| 1.1 项目脚手架搭建 | 后端 | 0.5 | FastAPI + DB + Docker Compose |
| 1.2 PostgreSQL Schema & Alembic迁移 | 后端 | 0.5 | 四张核心表创建 |
| 1.3 猎聘Adapter实现 | 后端 | 1.5 | `adapters/liepin.py` 完成搜索+详情解析 |
| 1.4 JD解析Agent (Prompt + DashScope SDK) | 后端+LLM | 1.0 | `agents/jd_parser.py` + Prompt模板 |
| 1.5 简历匹配Agent (含SABC评级) | 后端+LLM | 1.0 | `agents/resume_matcher.py` + `agents/rating.py` |
| 1.6 搜索编排服务 | 后端 | 1.0 | `search_service.py` + Celery任务 |
| 1.7 基础管理面板 (Next.js) | 前端 | 1.5 | 职位创建 + 搜索结果列表 + 评级查看 |
| 1.8 端到端集成测试 | 全体 | 0.5 | 一个真实JD的完整流程验证 |

**Phase 1 风险控制：**
- 优先只做猎聘适配，降低复杂度
- LLM Prompt先做单份简历匹配验证效果，再批量
- Web界面只需基本CRUD，不做高级交互

### Phase 2: 双渠增强与智能深化（Day 5-9）

**交付物：BOSS直聘接入、去重引擎、面试关注点、批量分析、关键词推荐**

| 任务 | 负责 | 预估人天 | 关键产出 |
|------|------|---------|---------|
| 2.1 BOSS直聘Adapter | 后端 | 1.5 | `adapters/bosszhipin.py` |
| 2.2 跨平台去重引擎 | 后端 | 1.0 | `dedup_service.py` + pg_trgm索引 |
| 2.3 面试关注点Agent | 后端+LLM | 0.5 | `agents/interview_questions.py` |
| 2.4 批量分析优化 | 后端 | 1.0 | 100份简历并发匹配（并发控制+限流） |
| 2.5 横向对比排序 | 后端 | 0.5 | 同JD下候选人对比 | 
| 2.6 搜索关键词智能推荐 | LLM | 0.5 | 基于JD自动生成搜索关键词 |
| 2.7 前端功能完善 | 前端 | 1.5 | 搜索配置、对比视图、面试关注点展示 |
| 2.8 集成测试 + 效果评估 | 全体 | 0.5 | 多JD/多候选人场景测试 |

### Phase 3: 闭环完善与生产就绪（Day 10-14）

**交付物：ATS对接、RLHF反馈、数据看板、CRM轻量版**

| 任务 | 负责 | 预估人天 | 关键产出 |
|------|------|---------|---------|
| 3.1 ATS系统集成（Webhook/API） | 后端 | 1.0 | 面试一键流转 |
| 3.2 评级反馈闭环（RLHF基础版） | 后端+LLM | 1.0 | HR纠正评级 → 存储为示例 → Prompt few-shot |
| 3.3 数据看板 | 前端+后端 | 1.0 | 搜索效果/评级分布/转化漏斗 |
| 3.4 候选人CRM轻量版 | 前端+后端 | 1.0 | 候选人状态管理、备注、跟进 |
| 3.5 安全加固 | 后端 | 0.5 | 数据脱敏、访问控制、合规审计 |
| 3.6 性能优化 | 后端 | 0.5 | LLM缓存、DB索引优化、连接池 |
| 3.7 文档 + 部署脚本 | DevOps | 0.5 | README、部署指南、监控配置 |

---

## 六、关键风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **猎聘/BOSS反爬升级** | 搜索功能完全不可用 | 高 | (1) 优先寻找官方API; (2) 准备备用渠道(Boss直聘企业版); (3) 设计Adapter接口，方便快速切换方案 |
| **LLM评级不一致** | 同一简历不同时间的评级波动 | 中 | (1) Prompt中固化评分规则; (2) 降低temperature到0.1; (3) 加入HR反馈微调; (4) 对每份评级强制输出匹配点/差距点 |
| **批量分析Token成本过高** | 运营成本不可控 | 中 | (1) 单份简历分析控制在3K input以内; (2) 对明显不匹配的简历做规则过滤，不送LLM; (3) 使用prompt caching减少重复输入; (4) 估算：100份简历×3K input ≈ 300K input tokens ≈ ¥15-30/批次 |
| **平台合规风险** | 法律风险 | 中 | (1) 优先使用官方API; (2) 数据仅用于内部评估，不做他用; (3) 候选人数据实现可删除机制（配合个保法）; (4) 法务审查数据使用协议 |
| **1-2周交付周期紧张** | 质量风险 | 高 | (1) Phase 1必须保证质量，宁可延期Phase 2/3; (2) 每天站会同步进度; (3) 提前识别阻塞项 |

---

## 七、LLM成本估算

使用通义千问 qwen-plus（性价比最优）按文档指标"单职位搜索500份简历"估算：

| 环节 | 单次Tokens | 500份总量 | 单价(qwen-plus) | 小计 | 
|------|-----------|-----------|---------------------|------|
| JD解析 | 3K (1次) | 3K | ¥0.004/K input + ¥0.012/K output | ~¥0.02 |
| 简历匹配 | 4.5K × 500 | 2.25M | 同上 | ~¥15 |
| 面试关注点 | 2.5K × 150 (S/A级) | 375K | 同上 | ~¥2 |
| **合计** | | | | **~¥17/职位 (≈$2.4)** |

> 💡 **成本极低**：单个职位的全链路AI分析成本不到¥20，对中高端岗位招聘（猎头费用通常是年薪的20-30%）来说几乎可忽略不计。
>
> **模型选择建议**：
> - **qwen-plus**（默认）：性价比最高，胜任85%+的简历匹配和评级场景
> - **qwen-max**：用于关键高管岗位的深度分析，成本约¥170/职位（贵10倍但推理深度更强）

---

## 八、验证与测试策略

### 8.1 功能验证
1. **端到端流程测试**：选3个不同类型的JD（技术岗、管理岗、销售岗），完整走通搜索→分析→评级→决策全流程
2. **评级一致性测试**：同一份简历+JD，重复分析5次，评级波动不超过1个等级
3. **去重准确性测试**：手动创建5组跨平台重复简历，验证去重引擎识别准确率≥95%

### 8.2 效果验证（按文档Section 09指标）
1. SABC评级准确率：请3位资深HR对50份评级结果进行盲审打分
2. 搜索召回率：与HR手动在平台上搜索的结果做覆盖对比
3. 时间效率：A/B测试，同一职位人工筛选 vs Agent辅助筛选的耗时对比

### 8.3 性能验证
1. 单份简历分析≤30s（P95）
2. 500份批量搜索≤5min
3. 100份批量匹配分析≤2min

---

## 九、环境依赖

```
# .env.example
# ── 通义千问 API (DashScope / 阿里云百炼) ──
DASHSCOPE_API_KEY=sk-xxx
DASHSCOPE_MODEL=qwen-plus      # 默认模型，可切换为 qwen-max
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# ── Database ──
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/recruitment
REDIS_URL=redis://localhost:6379/0

# ── Platform Credentials ──
LIEPIN_COOKIE_FILE=/data/cookies/liepin.json
BOSSZHIPIN_COOKIE_FILE=/data/cookies/bosszhipin.json

# ── Proxy (可选) ──
PROXY_URL=http://proxy:8080
```

---

## 十、总结

这个项目的工程挑战不在于"让AI理解简历"（这是千问等大模型的强项），而在于：

1. **平台适配层的稳定性**：猎聘/BOSS的反爬是对抗性的，需要一个健壮的、可监控的、可快速修复的Adapter层
2. **LLM输出的可解释性**：每个SABC评级必须有可追溯的匹配点和差距点，这是HR信任系统的基础
3. **异步任务编排**：搜索→解析→匹配→评级的流水线需要优雅地处理失败、重试和部分完成
4. **Human-in-the-Loop设计**：系统始终是辅助者而非替代者，HR的反馈应该能回流优化模型

**建议先从Phase 1开始，用1个真实JD + 猎聘单渠道跑通全流程，验证核心假设后，再决定Phase 2/3的推进节奏。**
