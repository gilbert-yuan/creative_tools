#!/bin/bash

echo "停止前后端服务..."

# 停止后端（端口3001）
echo "停止后端服务（端口3001）..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "后端未运行"

# 停止前端（端口3000）
echo "停止前端服务（端口3000）..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "前端未运行"

sleep 1

echo ""
echo "检查数据库服务..."

# 设置 PostgreSQL 路径
PG_BIN="/usr/local/opt/postgresql@15/bin"
export PATH="$PG_BIN:$PATH"

# 检查 PostgreSQL 是否运行
if ! $PG_BIN/pg_isready > /dev/null 2>&1; then
    echo "数据库未运行，正在启动 PostgreSQL@15..."
    
    # 检查服务是否已经在 brew services 中启动
    if brew services list | grep "postgresql@15" | grep -q "started"; then
        echo "服务已标记为启动，正在重启..."
        brew services restart postgresql@15
    else
        brew services start postgresql@15
    fi
    
    # 等待数据库启动
    echo "等待数据库启动..."
    for i in {1..15}; do
        if $PG_BIN/pg_isready > /dev/null 2>&1; then
            echo "✅ 数据库已启动"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    
    if ! $PG_BIN/pg_isready > /dev/null 2>&1; then
        echo "❌ 数据库启动失败"
        echo "尝试查看日志: tail -20 /usr/local/var/log/postgresql@15.log"
        exit 1
    fi
else
    echo "✅ 数据库已运行"
fi

echo ""
echo "启动后端服务..."
cd backend

# 先编译后端（等待编译完成）
echo "正在编译后端..."
cargo build --release

# 编译完成后再启动服务
cargo run --release &
BACKEND_PID=$!
echo "后端服务已启动，PID: $BACKEND_PID"

# 等待后端启动
sleep 3

echo ""
echo "启动前端服务..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!
echo "前端服务已启动，PID: $FRONTEND_PID"

echo ""
echo "======================================"
echo "✅ 服务重启完成！"
echo "后端: http://localhost:3001 (PID: $BACKEND_PID)"
echo "前端: http://localhost:3000 (PID: $FRONTEND_PID)"
echo "======================================"
echo ""
echo "查看日志:"
echo "  后端: tail -f backend日志（在终端查看）"
echo "  前端: tail -f frontend日志（在终端查看）"
echo ""
echo "停止服务:"
echo "  ./stop.sh"
