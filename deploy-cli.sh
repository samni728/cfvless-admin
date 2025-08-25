#!/bin/bash

# Cloudflare Pages 命令行部署脚本
# 使用环境变量进行身份验证，无需 Web UI 登录

echo "🚀 Cloudflare Pages 命令行部署"
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

echo "✅ 环境变量配置正确"
echo "   Account ID: ${CLOUDFLARE_ACCOUNT_ID:0:8}..."
echo "   API Token: ${CLOUDFLARE_API_TOKEN:0:8}..."

# 检查 Wrangler 是否安装
if ! command -v wrangler &> /dev/null; then
    echo "📦 安装 Wrangler..."
    npm install -g wrangler@3.114.14
else
    echo "✅ Wrangler 已安装: $(wrangler --version)"
fi

# 验证身份（不需要 wrangler login）
echo "🔐 验证 Cloudflare 身份..."
if wrangler whoami; then
    echo "✅ 身份验证成功"
else
    echo "❌ 身份验证失败，请检查 API Token"
    exit 1
fi

# 可选：初始化数据库和 KV（首次部署时）
read -p "🤔 是否需要初始化数据库和 KV 命名空间？(y/N): " init_db
if [[ $init_db =~ ^[Yy]$ ]]; then
    echo "🗄️ 初始化数据库和 KV..."
    
    DB_NAME="subscription-db"
    KV_NAME="subscription"
    
    # 创建 D1 数据库
    echo "📊 创建 D1 数据库 '$DB_NAME'..."
    DB_OUTPUT=$(wrangler d1 create $DB_NAME 2>&1)
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "ℹ️ 数据库已存在"
    else
        echo "✅ 数据库创建完成"
    fi
    
    # 创建 KV 命名空间
    echo "📦 创建 KV 命名空间 '$KV_NAME'..."
    KV_OUTPUT=$(wrangler kv namespace create $KV_NAME 2>&1)
    if echo "$KV_OUTPUT" | grep -q "already exists"; then
        echo "ℹ️ KV 命名空间已存在"
    else
        echo "✅ KV 命名空间创建完成"
    fi
    
    # 初始化数据库表结构
    if [ -f "d1_init.sql" ]; then
        echo "🗃️ 执行数据库初始化 SQL..."
        if wrangler d1 execute $DB_NAME --remote --file=d1_init.sql; then
            echo "✅ 数据库表结构初始化成功"
        else
            echo "⚠️ 数据库初始化可能失败"
        fi
    else
        echo "⚠️ 未找到 d1_init.sql 文件，跳过数据库初始化"
    fi
    
    echo "📋 提醒：请在 Cloudflare Dashboard 中手动绑定资源到 Pages 项目"
fi

# 准备部署产物
echo "📦 准备部署产物..."
mkdir -p public
cp _worker.js public/
cp index.html public/
cp data.js public/

echo "✅ 部署产物准备完成"
ls -la public/

# 部署到 Cloudflare Pages
echo "🚀 部署到 Cloudflare Pages..."
wrangler pages deploy ./public \
    --project-name=cfvless-admin \
    --commit-dirty=true

if [ $? -eq 0 ]; then
    echo "✅ 部署成功！"
    echo "🔗 访问地址: https://cfvless-admin.pages.dev"
else
    echo "❌ 部署失败"
    exit 1
fi

# 清理临时文件
rm -rf public/

echo "🎉 部署完成！"