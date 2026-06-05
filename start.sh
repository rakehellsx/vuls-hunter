#!/bin/bash
# Vuls-Hunter 一键启动脚本
# 同时启动 FastAPI 后端 (port 8000) 和 Vite 前端 (port 3000)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Vuls-Hunter v3.0 - AI 漏洞挖掘平台              ║"
echo "║         Powered by Strix Engine + FastAPI + React        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check dependencies
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] Python3 not found. Please install Python 3.11+"
    exit 1
fi

if ! command -v pnpm &>/dev/null && ! command -v npm &>/dev/null; then
    echo "[ERROR] Node.js package manager not found. Please install pnpm or npm."
    exit 1
fi

# Install Python dependencies
echo "[1/3] 安装 Python 依赖..."
pip3 install fastapi uvicorn aiosqlite sqlalchemy psutil openai python-multipart -q

# Install frontend dependencies
echo "[2/3] 安装前端依赖..."
if command -v pnpm &>/dev/null; then
    pnpm install --silent
else
    npm install --silent
fi

# Create data directory
mkdir -p data strix_runs

echo "[3/3] 启动服务..."
echo ""

# Start backend
echo "  → 启动 FastAPI 后端 (http://localhost:8000)..."
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
echo "  → 启动 Vite 前端 (http://localhost:3000)..."
if command -v pnpm &>/dev/null; then
    pnpm dev &
else
    npm run dev &
fi
FRONTEND_PID=$!

echo ""
echo "✓ Vuls-Hunter 已启动！"
echo ""
echo "  前端界面:  http://localhost:3000"
echo "  后端 API:  http://localhost:8000"
echo "  API 文档:  http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务..."

# Handle shutdown
cleanup() {
    echo ""
    echo "正在停止服务..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "服务已停止。"
    exit 0
}
trap cleanup SIGINT SIGTERM

wait
