#!/bin/bash

# Cloudflare Pages 部署脚本
# 使用方法: ./deploy.sh

echo "🚀 开始部署订阅聚合管理平台到 Cloudflare Pages..."

# 检查 wrangler 是否已安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler 未安装，请先安装: npm install -g wrangler"
    exit 1
fi

# 检查是否已登录
echo "🔐 检查登录状态..."
if ! wrangler whoami &> /dev/null; then
    echo "🔑 请先登录 Cloudflare..."
    wrangler auth login
fi

# 项目配置
PROJECT_NAME="subscription-manager"
DB_NAME="subscription-db"
KV_NAME="subscription"

echo "📋 项目配置:"
echo "  项目名称: $PROJECT_NAME"
echo "  数据库名称: $DB_NAME"
echo "  KV存储名称: $KV_NAME"

# 创建 D1 数据库（如果不存在）
echo "🗄️ 创建 D1 数据库..."
DB_RESULT=$(wrangler d1 create $DB_NAME 2>/dev/null || echo "数据库可能已存在")
echo "$DB_RESULT"

# 创建 KV 命名空间（如果不存在）
echo "📦 创建 KV 命名空间..."
KV_RESULT=$(wrangler kv namespace create $KV_NAME 2>/dev/null || echo "KV命名空间可能已存在")
echo "$KV_RESULT"

# 初始化数据库
if [ -f "d1_init.sql" ]; then
    echo "🗃️ 初始化数据库表结构..."
    echo "📡 使用远程数据库执行..."
    wrangler d1 execute $DB_NAME --remote --file=d1_init.sql
else
    echo "⚠️ 未找到 d1_init.sql 文件，跳过数据库初始化"
fi

# 部署 Pages
echo "🚀 部署到 Cloudflare Pages..."
wrangler pages deploy ./ --project-name=$PROJECT_NAME

echo "✅ 部署完成！"
echo ""
echo "📋 后续步骤:"
echo "1. 在 Cloudflare Dashboard 中配置 D1 和 KV 绑定"
echo "2. 更新 wrangler.toml 中的实际 database_id 和 kv_namespace_id"
echo "3. 部署好后请务必重新在部署一遍，然后在访问您的 Pages URL 测试功能"
echo ""
echo "🔗 有用的命令:"
echo "  查看部署状态: wrangler pages deployment list --project-name=$PROJECT_NAME"
echo "  查看日志: wrangler pages deployment tail --project-name=$PROJECT_NAME"