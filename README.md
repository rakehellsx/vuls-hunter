# Vuls-Hunter

Vuls-Hunter 是一套基于大语言模型（LLM）的智能漏洞挖掘系统。系统集成了 Strix 引擎的底层分析能力，并提供现代化 Web 界面，能够自动完成代码扫描、漏洞识别、修复建议生成以及安全审计报告导出。智能对话模块由 **Vuls-Hunter AI 引擎**（基于 OpenCode）驱动，支持对话式漏洞挖掘。

## 核心功能

- **对话式漏洞挖掘**：通过自然语言交互进行深度安全审计，上传代码包或输入 GitHub URL 即可触发 AI 全面分析，支持多轮追问和上下文保持。
- **AI 驱动漏洞扫描**：利用 DeepSeek 等大语言模型进行深度语义推理，识别传统静态分析工具难以发现的逻辑漏洞。
- **自动化 PoC 生成**：支持针对发现的漏洞，一键生成可执行的 Python PoC（Proof of Concept）攻击脚本及详细利用原理说明。
- **多数据源支持**：
  - **Git 仓库分析**：直接关联 GitHub/GitLab 仓库，自动克隆并分析。
  - **压缩包上传**：支持上传 `.zip`、`.tar.gz`、`.tgz` 格式的代码压缩包进行分析。
  - **快速检测**：在 Web 界面直接粘贴代码片段进行实时秒级扫描，通过 WebSocket 实时推送扫描日志流。
- **双引擎独立配置**：
  - **智能对话引擎**：固定使用 Vuls-Hunter AI（OpenCode Server），独立配置，不受扫描引擎影响。
  - **扫描引擎 LLM**：支持配置和切换 OpenAI、DeepSeek、Groq、Ollama 等提供商，独立存储。
- **实时审计与监控**：提供实时引擎状态监控（CPU/内存使用率）、全链路操作审计日志以及可视化数据仪表盘。
- **自动化报告生成**：扫描完成后自动生成标准化 Markdown 安全审计报告，支持在线预览和下载。

## 技术架构

| 层次 | 技术栈 |
|------|--------|
| **前端** | React 18 + TypeScript + Vite + Tailwind CSS v4 + Lucide React |
| **后端** | Python 3.11 + FastAPI + SQLAlchemy + aiosqlite |
| **智能对话引擎** | OpenCode v1.15.13（`opencode serve` 模式，HTTP API） |
| **扫描 AI 引擎** | Strix 架构，结合 AST 解析（Tree-sitter）与 LLM 语义分析 |
| **通信协议** | RESTful API + WebSocket（实时日志流） |
| **配置存储** | `data/opencode_settings.json`（对话引擎）+ `data/llm_settings.json`（扫描引擎） |

---

## 快速开始

### 环境要求

| 依赖 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Python | 3.10 | 3.11+ |
| Node.js | 18.0 | 20+ |
| pnpm | 8.0 | 9+ |
| Git | 2.30 | 最新版 |

### 1. 克隆代码

```bash
git clone https://github.com/rakehellsx/vuls-hunter.git
cd vuls-hunter
git checkout dev4
```

### 2. 安装依赖

```bash
# 后端依赖
sudo pip3 install -r requirements.txt

# 前端依赖
pnpm install
```

### 3. 安装 OpenCode（智能对话引擎）

```bash
curl -fsSL https://opencode.ai/install | bash
export PATH="$HOME/.opencode/bin:$PATH"
opencode --version
```

### 4. 启动服务

**一键启动（推荐）：**

```bash
chmod +x start.sh
./start.sh
```

**手动分别启动：**

```bash
# 启动后端（端口 8000）
mkdir -p data
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 启动前端（端口 3000）
pnpm dev

# 启动 OpenCode Server（端口 4096，智能对话引擎）
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://your-llm-api/v1"
opencode serve --port 4096
```

### 5. 访问系统

| 服务 | 地址 |
|------|------|
| **Web 界面** | `http://localhost:3000` |
| **后端 API 文档** | `http://localhost:8000/docs` |
| **OpenCode Server** | `http://localhost:4096` |

---

## 使用指南

### 智能对话漏洞挖掘

1. 进入左侧导航栏 **智能对话** 菜单。
2. 选择分析模式：
   - **对话**：直接输入安全问题，AI 专业解答。
   - **上传代码包**：拖拽或点击上传 `.zip`/`.tar.gz` 代码压缩包，点击"加载代码并开始 AI 漏洞挖掘"。
   - **URL / GitHub**：输入 GitHub 仓库地址，点击"克隆并分析"，AI 自动克隆后进行全面审计。
3. 分析完成后，根据 AI 回复下方的**上下文追问按钮**深入挖掘漏洞细节。

### 项目扫描

1. **配置扫描引擎 LLM**：进入 **模型设置** → **扫描引擎 LLM 配置** 区域，填写 API Key，点击"测试连接"后设为默认。
2. **创建项目**：进入 **项目管理**，点击"关联代码仓库"，输入 Git URL 或上传代码压缩包。
3. **启动扫描**：点击项目卡片上的"启动 AI 漏洞挖掘"按钮。
4. **生成 PoC**：在漏洞列表中点击"生成 PoC"，AI 自动编写可执行攻击脚本。
5. **查看报告**：在 **报告管理** 中预览或下载完整 Markdown 安全审计报告。

### 模型设置说明

模型设置页面分为两个**完全独立**的配置区域：

| 区域 | 用途 | 存储文件 |
|------|------|---------|
| **智能对话引擎配置**（紫色） | 配置 OpenCode Server 地址、Provider、Model | `data/opencode_settings.json` |
| **扫描引擎 LLM 配置**（蓝色） | 配置漏洞扫描使用的 LLM 提供商 | `data/llm_settings.json` |

两套配置独立保存，互不影响。

---

## 目录结构

```
vuls-hunter/
├── backend/                    # Python 后端
│   ├── api/
│   │   ├── overview.py         # 仪表盘统计 + 智能对话（chat）端点
│   │   ├── settings.py         # LLM 配置 + OpenCode 独立配置管理
│   │   ├── upload.py           # 文件上传（含 /archive-for-chat 专用接口）
│   │   ├── projects.py         # 项目管理
│   │   ├── scans.py            # 扫描任务 + WebSocket 日志流
│   │   ├── rules.py            # 安全规则管理
│   │   ├── reports.py          # 报告管理
│   │   ├── engine.py           # 引擎状态监控
│   │   └── audit.py            # 操作审计日志
│   ├── core/                   # 核心配置
│   ├── db/                     # 数据库模型与 SQLite 会话
│   ├── engine/                 # Strix AI 引擎封装
│   └── main.py                 # 后端应用入口
├── client/                     # React 前端
│   └── src/
│       ├── components/         # 共享 UI 组件（DashboardLayout 等）
│       ├── contexts/           # 全局状态管理（AppContext）
│       ├── lib/                # API 客户端封装（api.ts）
│       └── pages/
│           ├── ChatAgent.tsx   # 智能对话漏洞挖掘页面（重构版）
│           ├── Settings.tsx    # 模型设置（双引擎独立配置）
│           ├── Projects.tsx    # 项目管理
│           ├── Overview.tsx    # 仪表盘
│           └── ...
├── data/                       # 运行时数据目录（自动创建）
│   ├── opencode_settings.json  # 智能对话引擎配置
│   └── llm_settings.json       # 扫描引擎 LLM 配置
├── start.sh                    # 一键启动脚本
├── requirements.txt            # Python 依赖清单
├── DEPLOY.md                   # 详细部署文档
└── README.md                   # 本文件
```

---

## 版本历史

| 版本 | 分支 | 主要变更 |
|------|------|---------|
| v1.0 | `main` | 纯前端原型，数据全部为模拟数据 |
| v2.0 | `dev` | 全栈实现，集成 Strix 引擎，真实 AI 漏洞挖掘 |
| v2.1 | `dev2` | 新增 PoC 自动生成，修复 WebSocket 快速检测时序 Bug |
| v3.0 | `dev3` | 智能对话模块修复（接入 settings 配置、多轮上下文），弹框居中修复 |
| **v4.0（当前）** | `dev4` | 智能对话全面重构：接入 OpenCode Server、支持代码包上传/GitHub URL 分析、双引擎配置分离、提示词重写 |

## 许可证

MIT License
