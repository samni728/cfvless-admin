#!/bin/bash

# Cloudflare VLESS 聚合管理平台 - 一键部署脚本
echo "🚀 Cloudflare VLESS 聚合管理平台 - 一键部署"
echo "=========================================="

# 检查是否安装了 Wrangler
if ! command -v wrangler &> /dev/null; then
    echo "❌ 未检测到 Wrangler CLI"
    echo "请先安装 Wrangler: npm install -g wrangler"
    echo "然后登录: wrangler login"
    exit 1
fi

# 检查是否已登录
if ! wrangler whoami &> /dev/null; then
    echo "❌ 请先登录 Cloudflare"
    echo "运行: wrangler login"
    exit 1
fi

echo "✅ Wrangler 已安装并登录"

# 部署到 Cloudflare Pages
echo "📦 正在部署到 Cloudflare Pages..."
wrangler pages deploy . --project-name cfvless-admin

if [ $? -eq 0 ]; then
    echo "✅ 部署成功！"
    echo ""
    echo "📋 接下来需要手动配置："
    echo "1. 创建 D1 数据库并执行 d1_init.sql"
    echo "2. 创建 KV 命名空间"
    echo "3. 在 Pages 设置中绑定数据库和 KV"
    echo ""
    echo "🔗 查看详细配置步骤：https://github.com/samni728/cfvless-admin"
else
    echo "❌ 部署失败，请检查错误信息"
    exit 1
fi
