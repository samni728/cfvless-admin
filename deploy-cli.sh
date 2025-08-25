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

# 验证身份和权限
echo "🔐 验证 Cloudflare 身份和权限..."
if wrangler whoami; then
    echo "✅ 身份验证成功"
    
    # 检查 Pages 权限
    echo "🔍 检查 Pages 权限..."
    if wrangler pages project list > /dev/null 2>&1; then
        echo "✅ Pages 权限正常"
    else
        echo "❌ Pages 权限不足！"
        echo "请确保 API Token 包含以下权限："
        echo "  - Account:Read"
        echo "  - User:Read (重要！)"
        echo "  - Cloudflare Pages:Edit"
        echo "  - Workers Scripts:Edit"
        echo "  - Workers KV Storage:Edit"
        echo "  - D1:Edit"
        echo ""
        echo "前往创建新 Token: https://dash.cloudflare.com/profile/api-tokens"
        exit 1
    fi
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

# 检查项目是否存在，不存在则创建
PROJECT_NAME="cfvless-admin"
echo "🔍 检查项目是否存在..."
if ! wrangler pages project list | grep -q "$PROJECT_NAME"; then
    echo "📋 项目不存在，创建新项目..."
    if wrangler pages project create "$PROJECT_NAME" --production-branch=main; then
        echo "✅ 项目创建成功"
    else
        echo "❌ 项目创建失败"
        exit 1
    fi
else
    echo "✅ 项目已存在"
fi

# 部署代码
echo "🚀 开始部署..."
if wrangler pages deploy ./public \
    --project-name="$PROJECT_NAME" \
    --commit-dirty=true \
    --compatibility-date=2024-01-01; then
    
    echo "✅ 部署成功！"
    echo "🔗 访问地址: https://$PROJECT_NAME.pages.dev"
    echo ""
    echo "📋 重要提醒："
    echo "如果这是首次部署，请在 Cloudflare Dashboard 中绑定 D1 和 KV 资源："
    echo "1. 进入 Workers 和 Pages → Pages → $PROJECT_NAME"
    echo "2. 设置 → 函数"
    echo "3. 添加 D1 绑定：变量名=DB, 数据库=subscription-db"
    echo "4. 添加 KV 绑定：变量名=subscription, 命名空间=subscription"
    echo "5. 保存后会自动重新部署"
else
    echo "❌ 部署失败"
    echo "请检查 API Token 权限或网络连接"
    exit 1
fi

# 清理临时文件
rm -rf public/

echo "🎉 部署完成！"