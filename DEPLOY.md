# Vuls-Hunter 部署文档

本文档详细说明 Vuls-Hunter 在不同环境下的完整部署流程，包括本地开发环境、生产服务器部署以及常见问题排查。

---

## 一、系统架构概览

Vuls-Hunter 采用前后端分离架构，由以下四个核心服务组成：

| 服务 | 技术栈 | 默认端口 | 说明 |
|------|--------|---------|------|
| 前端 | React 18 + Vite | 3000 | 用户界面，开发模式下自动代理 API 请求 |
| 后端 | FastAPI + Uvicorn | 8000 | REST API + WebSocket 服务 |
| OpenCode Server | OpenCode v1.15.13 | 4096 | 智能对话 AI 引擎（独立服务） |
| 数据库 | SQLite (aiosqlite) | 文件 | 持久化存储，位于 `data/vuls_hunter.db` |

> **重要说明**：OpenCode Server 仅供**智能对话模块**使用，漏洞扫描模块使用独立的 LLM 配置（通过模型设置页面配置）。两套配置完全隔离，互不影响。

---

## 二、本地开发环境部署

### 2.1 环境要求

| 依赖 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Python | 3.10 | 3.11+ |
| Node.js | 18.0 | 20+ |
| pnpm | 8.0 | 9+ |
| Git | 2.30 | 最新版 |

### 2.2 克隆代码

```bash
git clone https://github.com/rakehellsx/vuls-hunter.git
cd vuls-hunter
git checkout dev4
```

### 2.3 安装后端依赖

```bash
sudo pip3 install -r requirements.txt
```

`requirements.txt` 包含以下核心依赖：

```
fastapi
uvicorn[standard]
sqlalchemy
aiosqlite
python-multipart
aiofiles
openai
httpx
gitpython
psutil
requests
```

> **注意**：`httpx` 是 v4.0 新增依赖，用于后端调用 OpenCode Server HTTP API。

### 2.4 安装前端依赖

```bash
pnpm install
```

如遇到构建脚本确认提示，执行：

```bash
echo "a" | pnpm approve-builds
pnpm install
```

### 2.5 安装 OpenCode Server（智能对话引擎）

```bash
# 安装 OpenCode
curl -fsSL https://opencode.ai/install | bash

# 将 opencode 加入 PATH（写入 ~/.bashrc 永久生效）
export PATH="$HOME/.opencode/bin:$PATH"
echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> ~/.bashrc

# 验证安装
opencode --version
```

### 2.6 配置 OpenCode Server

OpenCode Server 需要一个 LLM 提供商来驱动 AI 对话。通过环境变量配置：

```bash
# 使用 OpenAI 兼容 API（推荐 DeepSeek）
export OPENAI_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"  # 或其他兼容 API

# 使用原生 OpenAI
export OPENAI_API_KEY="sk-your-openai-key"
```

### 2.7 一键启动

```bash
chmod +x start.sh
./start.sh
```

该脚本将同时在后台启动后端（端口 8000）、前端（端口 3000）和 OpenCode Server（端口 4096），日志分别输出到 `/tmp/backend.log`、`/tmp/frontend.log` 和 `/tmp/opencode.log`。

### 2.8 手动分别启动（调试模式）

**启动后端（支持热重载）：**

```bash
mkdir -p data
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**启动前端（支持 HMR）：**

```bash
pnpm dev
```

**启动 OpenCode Server：**

```bash
export OPENAI_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
opencode serve --port 4096
```

---

## 三、生产环境部署

### 3.1 前端构建

```bash
pnpm build
```

构建产物位于 `client/dist/` 目录，FastAPI 后端已配置为自动服务该目录下的静态文件，生产环境只需启动后端和 OpenCode Server 即可。

### 3.2 启动后端（生产模式）

```bash
python3 -m uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2
```

### 3.3 使用 systemd 管理服务（推荐）

**后端服务** `/etc/systemd/system/vuls-hunter-backend.service`：

```ini
[Unit]
Description=Vuls-Hunter Backend Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/vuls-hunter
ExecStart=/usr/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**OpenCode Server 服务** `/etc/systemd/system/vuls-hunter-opencode.service`：

```ini
[Unit]
Description=Vuls-Hunter OpenCode Server (Chat Engine)
After=network.target

[Service]
Type=simple
User=ubuntu
Environment="OPENAI_API_KEY=sk-your-api-key"
Environment="OPENAI_BASE_URL=https://api.deepseek.com/v1"
ExecStart=/home/ubuntu/.opencode/bin/opencode serve --port 4096
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable vuls-hunter-backend vuls-hunter-opencode
sudo systemctl start vuls-hunter-backend vuls-hunter-opencode
sudo systemctl status vuls-hunter-backend vuls-hunter-opencode
```

### 3.4 Nginx 反向代理配置（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件（由 FastAPI 服务）
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 支持（实时扫描日志）
    location /api/scans/ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }

    # AI 对话接口（超时设置较长）
    location /api/chat {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

---

## 四、模型配置说明

Vuls-Hunter v4.0 采用**双引擎独立配置**架构，两套配置完全隔离。

### 4.1 智能对话引擎配置（OpenCode Server）

智能对话模块固定使用 OpenCode Server，通过 **模型设置** 页面的**紫色区域**进行配置：

| 字段 | 说明 | 示例 |
|------|------|------|
| **OpenCode Server 地址** | OpenCode HTTP Server 的完整地址 | `http://localhost:4096` |
| **Provider ID** | OpenCode 内部 LLM 提供商标识 | `openai`、`anthropic` |
| **Model ID** | OpenCode 内部模型标识 | `gpt-4.1-mini`、`deepseek-chat` |

配置存储于 `data/opencode_settings.json`，修改后无需重启服务立即生效。

**通过 API 配置：**

```bash
curl -X PUT http://localhost:8000/api/settings/opencode \
  -H "Content-Type: application/json" \
  -d '{
    "server_url": "http://localhost:4096",
    "provider_id": "openai",
    "model_id": "gpt-4.1-mini"
  }'
```

**验证连接：**

```bash
curl -X POST http://localhost:8000/api/settings/opencode/test
```

### 4.2 扫描引擎 LLM 配置

漏洞扫描模块使用独立的 LLM 提供商，通过 **模型设置** 页面的**蓝色区域**进行配置。

**支持的 LLM 提供商：**

| 提供商 | API Base URL | 推荐模型 |
|--------|-------------|---------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| Ollama（本地） | `http://localhost:11434/v1` | `qwen2.5-coder:7b` |

配置存储于 `data/llm_settings.json`。

**通过 API 配置：**

```bash
curl -X PUT http://localhost:8000/api/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "active_provider_id": "deepseek",
    "providers": [{
      "id": "deepseek",
      "name": "DeepSeek",
      "api_base_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-api-key",
      "model_name": "deepseek-chat"
    }]
  }'
```

---

## 五、API 接口说明

后端启动后，可访问 `http://localhost:8000/docs` 查看完整 Swagger API 文档。

### 核心接口一览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/overview/` | GET | 获取仪表盘统计数据 |
| `/api/chat/` | POST | 智能对话（通过 OpenCode Server） |
| `/api/projects/` | GET / POST | 项目列表 / 创建项目 |
| `/api/projects/{id}/scan` | POST | 启动项目扫描 |
| `/api/scans/quick` | POST | 快速代码扫描 |
| `/api/scans/{id}/ws` | WebSocket | 实时扫描日志流 |
| `/api/scans/{scan_id}/vulnerabilities/{vuln_id}/poc` | POST/GET | 生成/获取漏洞利用 PoC |
| `/api/upload/archive` | POST | 上传压缩包创建扫描任务 |
| `/api/upload/archive-for-chat` | POST | 上传压缩包供智能对话分析（不创建扫描任务） |
| `/api/upload/url` | POST | URL/GitHub 仓库分析 |
| `/api/reports/` | GET | 报告列表 |
| `/api/reports/{id}/markdown` | GET | 获取报告 Markdown 内容 |
| `/api/rules/` | GET / POST | 规则列表 / 创建规则 |
| `/api/settings/llm` | GET / PUT | 扫描引擎 LLM 配置读取/更新 |
| `/api/settings/opencode` | GET / PUT | 智能对话引擎配置读取/更新 |
| `/api/settings/opencode/test` | POST | 测试 OpenCode Server 连接 |
| `/api/engine/status` | GET | 引擎状态监控 |
| `/api/audit/logs` | GET | 审计日志 |

### 智能对话接口详情

**POST `/api/chat/`**

```json
{
  "message": "请分析这段代码中的 SQL 注入漏洞",
  "session_id": "unique-session-id",
  "history": [
    {"role": "user", "content": "上一轮问题"},
    {"role": "assistant", "content": "上一轮回答"}
  ],
  "code_context": "<?php $id = $_GET['id']; ...",
  "target_info": "CMS v0.9.0 (PHP, 56 files)"
}
```

响应：

```json
{
  "text": "AI 分析结果...",
  "provider": "opencode-server",
  "session_id": "unique-session-id",
  "suggestions": ["深入分析 SQL 注入点", "生成修复代码"]
}
```

---

## 六、常见问题排查

### Q1：后端启动失败，提示端口 8000 被占用

```bash
fuser -k 8000/tcp
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Q2：OpenCode Server 无法启动

```bash
# 检查 opencode 是否在 PATH 中
which opencode || export PATH="$HOME/.opencode/bin:$PATH"

# 检查端口是否被占用
ss -tlnp | grep 4096

# 查看启动日志
cat /tmp/opencode.log

# 重新安装
curl -fsSL https://opencode.ai/install | bash
```

### Q3：智能对话无响应或超时

1. 确认 OpenCode Server 正在运行：`curl http://localhost:4096/global/health`
2. 确认 OpenCode Server 配置了有效的 LLM API Key（环境变量 `OPENAI_API_KEY`）
3. 在 **模型设置** → **智能对话引擎配置** 中点击"测试连接"
4. 检查后端日志：`cat /tmp/backend.log | tail -50`

### Q4：代码包上传失败（400 错误）

- 确认使用的是 `/api/upload/archive-for-chat` 接口（智能对话专用），而非 `/api/upload/archive`（扫描专用）
- 确认压缩包格式为 `.zip`、`.tar`、`.tar.gz`、`.tgz`，大小不超过 50MB
- 检查后端日志确认具体错误原因

### Q5：AI 扫描无结果或返回错误

1. 确认 **模型设置** → **扫描引擎 LLM 配置** 中的 API Key 已正确配置并通过"测试连接"验证
2. 检查后端日志：`cat /tmp/backend.log | tail -50`
3. 确认网络可以访问 LLM API 地址

### Q6：GitHub 仓库克隆失败

确认目标仓库为公开仓库，或在 URL 中包含 Personal Access Token：

```
https://<TOKEN>@github.com/username/repo.git
```

### Q7：前端页面空白或 API 请求失败

```bash
# 检查后端是否正常运行
curl http://localhost:8000/api/health

# 检查前端是否正常运行
curl http://localhost:3000
```

---

## 七、数据持久化说明

所有数据存储在 `data/` 目录下：

| 文件 | 说明 |
|------|------|
| `data/vuls_hunter.db` | SQLite 数据库（项目、扫描、漏洞、报告、规则、审计日志） |
| `data/llm_settings.json` | 扫描引擎 LLM 配置 |
| `data/opencode_settings.json` | 智能对话引擎（OpenCode Server）配置 |

**备份数据：**

```bash
cp data/vuls_hunter.db backup/vuls_hunter_$(date +%Y%m%d).db
cp data/llm_settings.json backup/
cp data/opencode_settings.json backup/
```

---

## 八、版本历史

| 版本 | 分支 | 主要变更 |
|------|------|---------|
| v1.0 | `main` | 纯前端原型，数据全部为模拟数据 |
| v2.0 | `dev` | 全栈实现，集成 Strix 引擎，真实 AI 漏洞挖掘 |
| v2.1 | `dev2` | 新增 PoC 自动生成，修复 WebSocket 快速检测时序 Bug |
| v3.0 | `dev3` | 智能对话模块修复（接入 settings 配置、多轮上下文），弹框居中修复，OpenCode 初步集成 |
| **v4.0（当前）** | `dev4` | 智能对话全面重构：OpenCode Server 深度集成、支持代码包上传/GitHub URL 分析、双引擎配置分离、提示词重写为专业漏洞挖掘角色、新增 `/archive-for-chat` 专用接口、修复 Python 3.11 tarfile 兼容性 |
