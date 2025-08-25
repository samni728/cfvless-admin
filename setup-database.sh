#!/bin/bash

# Cloudflare D1 数据库初始化脚本
# 通过命令行创建数据库并执行初始化 SQL

echo "🗄️ Cloudflare D1 数据库初始化"
echo "================================"

# 检查环境变量
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ 请先设置 CLOUDFLARE_ACCOUNT_ID 环境变量"
    echo "   export CLOUDFLARE_ACCOUNT_ID=你的账号ID"
    exit 1
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ 请先设置 CLOUDFLARE_API_TOKEN 环境变量"
    echo "   export CLOUDFLARE_API_TOKEN=你的APIToken"
    exit 1
fi

# 数据库配置
DB_NAME="subscription-db"
KV_NAME="subscription"

echo "📋 数据库配置:"
echo "   D1 数据库名: $DB_NAME"
echo "   KV 命名空间: $KV_NAME"

# 检查 Wrangler 是否安装
if ! command -v wrangler &> /dev/null; then
    echo "📦 安装 Wrangler..."
    npm install -g wrangler@3.114.14
else
    echo "✅ Wrangler 已安装: $(wrangler --version)"
fi

# 验证身份
echo "🔐 验证 Cloudflare 身份..."
if ! wrangler whoami; then
    echo "❌ 身份验证失败，请检查 API Token"
    exit 1
fi

# 创建 D1 数据库
echo "🗄️ 创建 D1 数据库..."
DB_OUTPUT=$(wrangler d1 create $DB_NAME 2>&1)
if echo "$DB_OUTPUT" | grep -q "already exists"; then
    echo "ℹ️ 数据库 '$DB_NAME' 已存在"
elif echo "$DB_OUTPUT" | grep -q "Created"; then
    echo "✅ 数据库 '$DB_NAME' 创建成功"
    echo "$DB_OUTPUT"
else
    echo "⚠️ 数据库创建状态未知，继续执行..."
    echo "$DB_OUTPUT"
fi

# 创建 KV 命名空间
echo "📦 创建 KV 命名空间..."
KV_OUTPUT=$(wrangler kv namespace create $KV_NAME 2>&1)
if echo "$KV_OUTPUT" | grep -q "already exists"; then
    echo "ℹ️ KV 命名空间 '$KV_NAME' 已存在"
elif echo "$KV_OUTPUT" | grep -q "Success"; then
    echo "✅ KV 命名空间 '$KV_NAME' 创建成功"
    echo "$KV_OUTPUT"
else
    echo "⚠️ KV 命名空间创建状态未知，继续执行..."
    echo "$KV_OUTPUT"
fi

# 初始化数据库表结构
if [ -f "d1_init.sql" ]; then
    echo "🗃️ 初始化数据库表结构..."
    echo "📡 使用远程数据库执行 SQL..."
    
    if wrangler d1 execute $DB_NAME --remote --file=d1_init.sql; then
        echo "✅ 数据库初始化成功！"
    else
        echo "⚠️ 数据库初始化可能失败，请检查 SQL 文件"
    fi
else
    echo "❌ 未找到 d1_init.sql 文件"
    echo "请确保 d1_init.sql 文件存在于当前目录"
    exit 1
fi

# 显示数据库信息
echo ""
echo "📊 数据库信息:"
echo "正在获取数据库列表..."
wrangler d1 list

echo ""
echo "📦 KV 命名空间信息:"
echo "正在获取 KV 命名空间列表..."
wrangler kv namespace list

echo ""
echo "🎉 数据库初始化完成！"
echo ""
echo "📋 下一步:"
echo "1. 在 Cloudflare Dashboard 中将数据库绑定到 Pages 项目"
echo "2. 或者运行 ./deploy-cli.sh 进行部署"