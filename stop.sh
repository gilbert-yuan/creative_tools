#!/bin/bash

echo "停止所有服务..."

# 确保安装了必要的工具
if ! command -v lsof &> /dev/null; then
    echo "安装 lsof 工具..."
    sudo apt update && sudo apt install -y lsof
fi

# 停止后端（端口3001）
echo "停止后端服务（端口3001）..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "后端未运行"

# 停止前端（端口3000）
echo "停止前端服务（端口3000）..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "前端未运行"

echo ""
echo "======================================"
echo "✅ 服务已停止！"
echo "======================================"
