# Vuls-Hunter 部署文档

本文档详细说明 Vuls-Hunter 在不同环境下的完整部署流程，包括本地开发环境、生产服务器部署以及常见问题排查。

---

## 一、系统架构概览

Vuls-Hunter 采用前后端分离架构，由以下三个核心服务组成：

| 服务 | 技术栈 | 默认端口 | 说明 |
|------|--------|---------|------|
| 前端 | React 18 + Vite | 3000 / 3001 | 用户界面，开发模式下自动代理 API 请求 |
| 后端 | FastAPI + Uvicorn | 8000 | REST API + WebSocket 服务 |
| 数据库 | SQLite (aiosqlite) | 文件 | 持久化存储，位于 `backend/data/vuls_hunter.db` |

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
git checkout dev
```

### 2.3 安装后端依赖

```bash
# 推荐使用 sudo 确保全局安装
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
gitpython
psutil
requests
```

### 2.4 安装前端依赖

```bash
pnpm install
```

### 2.5 一键启动

```bash
chmod +x start.sh
./start.sh
```

该脚本将同时在后台启动后端（端口 8000）和前端（端口 3000），并将日志分别输出到 `/tmp/backend.log` 和 `/tmp/frontend.log`。

### 2.6 分别启动（调试模式）

**启动后端（支持热重载）：**

```bash
cd vuls-hunter
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**启动前端（支持 HMR）：**

```bash
cd vuls-hunter
pnpm dev
```

---

## 三、生产环境部署

### 3.1 前端构建

```bash
cd vuls-hunter
pnpm build
```

构建产物位于 `client/dist/` 目录，FastAPI 后端已配置为自动服务该目录下的静态文件，因此生产环境只需启动后端服务即可。

### 3.2 启动后端（生产模式）

```bash
python3 -m uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2
```

### 3.3 使用 systemd 管理服务（推荐）

创建服务文件 `/etc/systemd/system/vuls-hunter.service`：

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

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable vuls-hunter
sudo systemctl start vuls-hunter
sudo systemctl status vuls-hunter
```

### 3.4 Nginx 反向代理配置（可选）

如需通过域名访问，可配置 Nginx 反向代理：

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
}
```

---

## 四、LLM 模型配置

Vuls-Hunter 支持多种 LLM 提供商，可通过 Web 界面的 **模型设置** 页面进行配置，也可以通过 API 直接配置。

### 4.1 通过 Web 界面配置（推荐）

1. 进入左侧导航栏 **模型设置**。
2. 选择或添加 LLM 提供商，填写 API Base URL 和 API Key。
3. 点击"测试连接"验证配置有效性。
4. 点击"设为默认"激活该提供商。

### 4.2 支持的 LLM 提供商

| 提供商 | API Base URL | 推荐模型 |
|--------|-------------|---------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| Ollama (本地) | `http://localhost:11434/v1` | `qwen2.5-coder:7b` |

### 4.3 通过 API 配置

```bash
curl -X PUT http://localhost:8000/api/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "api_base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-your-api-key",
    "model_name": "deepseek-chat"
  }'
```

---

## 五、API 接口说明

后端启动后，可访问 `http://localhost:8000/docs` 查看完整的 Swagger API 文档。

### 核心接口一览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/overview/` | GET | 获取仪表盘统计数据 |
| `/api/projects/` | GET / POST | 项目列表 / 创建项目 |
| `/api/projects/{id}/scan` | POST | 启动项目扫描 |
| `/api/projects/upload-archive` | POST | 上传压缩包创建项目 |
| `/api/scans/quick` | POST | 快速代码扫描 |
| `/api/scans/{id}/ws` | WebSocket | 实时扫描日志流 |
| `/api/upload/url` | POST | URL/GitHub 仓库分析 |
| `/api/upload/archive` | POST | 上传压缩包分析 |
| `/api/reports/` | GET | 报告列表 |
| `/api/reports/{id}/markdown` | GET | 获取报告 Markdown 内容 |
| `/api/rules/` | GET / POST | 规则列表 / 创建规则 |
| `/api/settings/llm` | GET / PUT | LLM 配置读取 / 更新 |
| `/api/engine/status` | GET | 引擎状态监控 |
| `/api/audit/logs` | GET | 审计日志 |
| `/api/chat/` | POST | AI 对话 |

---

## 六、常见问题排查

### Q1：后端启动失败，提示端口 8000 被占用

```bash
# 查找并终止占用 8000 端口的进程
fuser -k 8000/tcp
# 重新启动后端
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Q2：前端页面空白或 API 请求失败

检查 Vite 代理配置是否正确。开发模式下，前端会将 `/api` 请求代理到 `http://localhost:8000`。确认后端已正常启动：

```bash
curl http://localhost:8000/api/health
# 预期返回: {"status":"ok","version":"3.0.0"}
```

### Q3：AI 扫描无结果或返回错误

1. 确认 **模型设置** 中的 API Key 已正确配置并通过"测试连接"验证。
2. 检查后端日志：`cat /tmp/backend.log | tail -50`
3. 确认网络可以访问 LLM API 地址（如 `api.deepseek.com`）。

### Q4：GitHub 仓库克隆失败

确认目标仓库为公开仓库，或在 URL 中包含 Personal Access Token：

```
https://<TOKEN>@github.com/username/repo.git
```

### Q5：压缩包上传后扫描无漏洞

确认压缩包中包含受支持的代码文件（`.py`, `.js`, `.ts`, `.java`, `.go`, `.php`, `.c`, `.cpp` 等）。系统会自动过滤非代码文件（如图片、二进制文件）。

---

## 七、数据持久化说明

所有数据存储在 SQLite 数据库文件中，路径为：

```
backend/data/vuls_hunter.db
```

该文件包含以下数据表：

| 表名 | 说明 |
|------|------|
| `projects` | 项目信息 |
| `scans` | 扫描任务记录 |
| `vulnerabilities` | 漏洞详情 |
| `reports` | 安全审计报告 |
| `rules` | 安全检测规则 |
| `audit_logs` | 操作审计日志 |

**备份数据库：**

```bash
cp backend/data/vuls_hunter.db backup/vuls_hunter_$(date +%Y%m%d).db
```

---

## 八、版本信息

| 版本 | 分支 | 说明 |
|------|------|------|
| v1.0 (原型) | `main` | 纯前端原型，数据全部为模拟数据 |
| v2.0 (当前) | `dev` | 全栈实现，集成 Strix 引擎，真实 AI 漏洞挖掘 |
