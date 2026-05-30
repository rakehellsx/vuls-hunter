# Vuls-Hunter

Vuls-Hunter 是一套基于大语言模型（LLM）的智能漏洞挖掘原型系统。该系统集成了 Strix 引擎的底层分析能力，并提供了一个具有"智感雅致美学"设计的现代化 Web 界面，能够自动完成代码扫描、漏洞识别、修复建议生成以及安全审计报告导出。

## 核心功能

- **AI 驱动漏洞挖掘**：利用 DeepSeek 等大语言模型进行深度语义推理，识别传统静态分析工具难以发现的逻辑漏洞。
- **自动化 PoC 生成**：支持针对发现的漏洞，一键生成可执行的 Python PoC（Proof of Concept）攻击脚本及详细利用原理说明。
- **多数据源支持**：
  - **Git 仓库分析**：直接关联 GitHub/GitLab 仓库，自动 Clone 并分析。
  - **压缩包上传**：支持直接上传 `.zip`, `.tar.gz`, `.tgz` 格式的代码压缩包进行分析。
  - **快速检测**：支持在 Web 界面直接粘贴代码片段进行实时秒级扫描，通过 WebSocket 实时推送扫描日志流。
- **智能对话 Agent**：内置 AI 安全专家，支持针对漏洞细节、防御方案进行交互式追问，扫描过程日志实时显示在对话流中。
- **动态模型配置**：支持配置和切换不同的 LLM 提供商（OpenAI, DeepSeek, Groq, Ollama 等），支持 API 连通性测试。
- **实时审计与监控**：提供实时的引擎状态监控（CPU/内存使用率）、全链路操作审计日志以及可视化数据仪表盘。
- **自动化报告生成**：扫描完成后自动生成标准化的 Markdown 安全审计报告，支持在线预览和下载。

## 技术架构

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS v4 + Lucide React
- **后端**：Python 3.11 + FastAPI + SQLAlchemy + aiosqlite
- **AI 引擎层**：基于 Strix 架构，结合 AST 解析（Tree-sitter）与 LLM 语义分析
- **通信协议**：RESTful API + WebSocket（实时日志流）

---

## 部署指南

### 环境要求

- 操作系统：Linux (推荐 Ubuntu 22.04+) 或 macOS
- Node.js：v20+
- Python：3.11+
- 包管理工具：`pnpm` 和 `pip`

### 1. 克隆代码

```bash
git clone https://github.com/rakehellsx/vuls-hunter.git
cd vuls-hunter
git checkout dev2
```

### 2. 依赖安装

#### 后端依赖

```bash
sudo pip3 install -r requirements.txt
```

#### 前端依赖

```bash
pnpm install
```

### 3. 启动服务

项目提供了一键启动脚本，可同时启动前端和后端服务：

```bash
chmod +x start.sh
./start.sh
```

**或者分别手动启动：**

启动后端（默认端口 8000）：
```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

启动前端（默认端口 3000）：
```bash
pnpm dev
```

### 4. 访问系统

服务启动后，在浏览器中访问：
- **Web 界面**: `http://localhost:3000` (或启动日志中显示的其他端口，如 3001)
- **API 文档**: `http://localhost:8000/docs`

---

## 快速使用指南

1. **配置模型**：首次使用，请进入左侧导航栏的 **模型设置** 菜单，配置您的 LLM API Key（推荐使用 DeepSeek），并点击"测试连接"确保配置有效，最后点击"设为默认"。
2. **创建项目**：进入 **项目管理** 菜单，点击"关联代码仓库"，您可以选择输入 Git URL 或直接上传代码压缩包。
3. **启动扫描**：项目创建完成后，点击项目卡片上的"启动 AI 漏洞挖掘"按钮。
4. **生成 PoC**：在项目漏洞列表中，点击任意漏洞卡片上的"生成 PoC"按钮，AI 将自动编写针对该漏洞的可执行 Python 攻击脚本。
5. **快速检测**：进入 **快速检测** 菜单，直接粘贴代码片段，点击"开始 AI 审计"即可进行秒级漏洞挖掘。
6. **查看报告**：扫描完成后，系统会自动生成漏洞列表，您可以在 **报告管理** 菜单中预览或下载完整的 Markdown 安全审计报告。
7. **智能分析**：在 **智能对话** 菜单中，您可以直接上传压缩包或输入 GitHub URL 让 AI 进行漏洞挖掘，并在对话中追问漏洞修复方案。

## 目录结构说明

```
vuls-hunter/
├── backend/                  # Python 后端目录
│   ├── api/                  # FastAPI 路由端点 (scans, projects, upload 等)
│   ├── core/                 # 核心配置
│   ├── db/                   # 数据库模型与 SQLite 会话管理
│   ├── engine/               # Strix AI 引擎封装层
│   └── main.py               # 后端应用入口
├── client/                   # React 前端目录
│   ├── src/
│   │   ├── components/       # 共享 UI 组件 (如 DashboardLayout)
│   │   ├── contexts/         # 全局状态管理 (AppContext)
│   │   ├── lib/              # API 客户端封装 (api.ts)
│   │   ├── pages/            # 核心业务页面 (Overview, Projects, ChatAgent 等)
│   │   ├── App.tsx           # 前端路由配置
│   │   └── index.css         # 全局样式与 Tailwind 导入
├── start.sh                  # 一键启动脚本
└── requirements.txt          # Python 依赖清单
```

## 许可证

MIT License
