# 🤖 Recruitment AI Agent

AI 驱动的智能招聘平台 — 自动抓取候选人简历、JD 解析、智能匹配分析与评分。

## 功能

- **🔍 多平台简历搜索** — 支持猎聘(lpt.liepin.com)和 BOSS 直聘，Playwright 可视化浏览器操作
- **📋 AI 简历提取** — 千问 VL 视觉模型 + 文本模型双重提取，从列表页截图和详情页 DOM 文本中结构化候选人数据
- **📝 JD 智能解析** — 自动解析岗位描述，提取技能要求、经验要求、学历等关键信息
- **🎯 候选人匹配** — SABC 评级体系，硬技能 + 软素质 + 加分项三维评分
- **📊 工作台** — 实时搜索进度、候选人列表、匹配分析一站式操作
- **🗄️ 人才库** — 搜索历史持久化，支持筛选、编辑、批量匹配、面试管理

## 技术栈

| 层 | 技术 |
|---|------|
| **前端** | Next.js 14 + React 18 + TypeScript + Tailwind CSS |
| **后端** | FastAPI (Python 3.8+) + SQLAlchemy Async + Celery |
| **AI** | 阿里云千问 (qwen-vl-max / qwen-plus) via DashScope API |
| **浏览器** | Playwright (Chromium, headless=False) |
| **数据库** | PostgreSQL 16 + pgvector + Redis 7 |
| **部署** | Docker Compose |

## 项目结构

```
recruitment-agent/
├── backend/
│   ├── app/
│   │   ├── adapters/         # 平台适配器 (Liepin, BossZhipin)
│   │   │   ├── liepin.py     # 猎聘 — Playwright + AI 提取
│   │   │   ├── bosszhipin.py # BOSS直聘适配器
│   │   │   ├── ai_browser.py # AI 浏览器核心 (千问 VL)
│   │   │   └── base.py       # 适配器基类 + CandidateRecord
│   │   ├── agents/           # AI Agent (JD解析/简历分析/匹配/面试题)
│   │   ├── api/v1/           # REST API 路由
│   │   ├── models/           # SQLAlchemy 模型 (Talent/Task/Job/Match)
│   │   ├── schemas/          # Pydantic 数据模型
│   │   ├── services/         # 业务逻辑层
│   │   └── core/             # 配置 / 数据库连接
│   └── run_backend.py
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router 页面
│   │   └── lib/              # API 客户端 + 工具函数
│   └── package.json
├── docker-compose.yml        # PostgreSQL + Redis + Backend + Celery
├── start.bat                 # Windows 一键启动脚本
└── .env                      # 环境变量配置
```

## 快速开始

### 环境要求

- **Python 3.8+** (推荐虚拟环境 `venv`)
- **Node.js 18+**
- **Docker Desktop** (运行 PostgreSQL 和 Redis)
- **Windows 10/11** (Playwright 可视化操作需要桌面环境)
- **Microsoft Edge** 浏览器 (已安装)

### 1. 克隆项目

```bash
git clone https://github.com/Dtwwwww/recruitment-agent-demo.git
cd recruitment-agent
```

### 2. 配置环境变量

编辑 `.env` 文件，填入你的 DashScope API Key：

```env
DASHSCOPE_API_KEY=sk-your-key-here
```

### 3. 启动数据库

```bash
docker compose up -d postgres redis
```

### 4. 安装依赖

**后端：**

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
playwright install chromium
```

**前端：**

```bash
cd frontend
npm install
```

### 5. 启动项目

**Windows (一键启动)：**

双击 `start.bat`，或在终端运行：

```bash
start.bat
```

**手动启动：**

```bash
# 终端1 — 后端
cd backend
python run_backend.py        # 默认 8002 端口

# 终端2 — 前端
cd frontend
npm run dev                  # 默认 3000 端口
```

### 6. 打开浏览器

访问 `http://localhost:3000`

## 使用流程

1. **创建岗位** — 粘贴或输入 JD，AI 自动解析出技能、经验等要求
2. **开始搜索** — 选择平台(猎聘/BOSS直聘)，浏览器自动打开对应搜索页
3. **手动筛选** — 在浏览器中设置筛选条件并搜索 (25秒操作窗口)
4. **自动抓取** — AI 自动逐条提取候选人详细简历，实时返回工作台
5. **匹配分析** — 勾选候选人，点击匹配分析，AI 生成 SABC 评分
6. **人才库管理** — 所有候选人自动入库，支持筛选、编辑、导出

## 匹配评分体系

| 等级 | 分数 | 含义 |
|------|------|------|
| **S** | ≥ 90 | 高度匹配，优先面试 |
| **A** | ≥ 75 | 较好匹配，建议面试 |
| **B** | ≥ 60 | 部分匹配，可考虑 |
| **C** | < 60 | 不推荐 |

评分维度：硬技能匹配 (60%) + 软素质匹配 (30%) + 加分项 (10%)

## 配置说明

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `DASHSCOPE_API_KEY` | 千问 API Key | 必填 |
| `DASHSCOPE_MODEL` | 文本模型 | `qwen-plus` |
| `DATABASE_URL` | PostgreSQL 连接 | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis 连接 | `redis://localhost:6379/0` |
| `BROWSER_CHANNEL` | 浏览器类型 | `msedge` |