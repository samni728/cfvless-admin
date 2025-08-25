#!/bin/bash

# 专门用于数据库初始化的脚本
# 避免 wrangler.toml 配置冲突

echo "🗄️ 数据库初始化专用脚本"
echo "========================"

# 检查环境变量
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ 请先设置 CLOUDFLARE_ACCOUNT_ID"
    echo "   export CLOUDFLARE_ACCOUNT_ID=你的账号ID"
    exit 1
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ 请先设置 CLOUDFLARE_API_TOKEN"
    echo "   export CLOUDFLARE_API_TOKEN=你的APIToken"
    exit 1
fi

echo "✅ 环境变量检查通过"

# 检查 Wrangler
if ! command -v wrangler &> /dev/null; then
    echo "📦 安装 Wrangler..."
    npm install -g wrangler@3.114.14
fi

# 验证身份
echo "🔐 验证身份..."
if ! wrangler whoami; then
    echo "❌ 身份验证失败"
    exit 1
fi

DB_NAME="subscription-db"
KV_NAME="subscription"

echo ""
echo "📋 开始创建资源..."

# 创建 D1 数据库
echo "📊 创建 D1 数据库..."
wrangler d1 create $DB_NAME || echo "数据库可能已存在"

# 创建 KV 命名空间
echo "📦 创建 KV 命名空间..."
wrangler kv namespace create $KV_NAME || echo "KV 命名空间可能已存在"

# 初始化数据库（使用直接命令，避免配置文件问题）
echo ""
echo "🗃️ 初始化数据库表结构..."

if [ -f "d1_init.sql" ]; then
    echo "📡 执行 SQL 文件..."
    
    # 直接使用命令行执行，不依赖 wrangler.toml
    if wrangler d1 execute $DB_NAME --remote --file=d1_init.sql; then
        echo "✅ 数据库初始化成功！"
        
        echo ""
        echo "📊 验证表创建结果："
        wrangler d1 execute $DB_NAME --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
        
    else
        echo "❌ 数据库初始化失败"
        echo "尝试手动执行 SQL..."
        
        # 如果文件执行失败，尝试分段执行
        echo "🔄 尝试分段执行 SQL..."
        
        # 读取 SQL 文件并逐个执行 CREATE TABLE 语句
        while IFS= read -r line; do
            if [[ $line == CREATE* ]]; then
                echo "执行: ${line:0:50}..."
                echo "$line" | wrangler d1 execute $DB_NAME --remote --command="$line" || true
            fi
        done < d1_init.sql
    fi
else
    echo "❌ 未找到 d1_init.sql 文件"
    exit 1
fi

echo ""
echo "🎉 资源创建完成！"
echo ""
echo "📋 下一步："
echo "1. 前往 Cloudflare Dashboard"
echo "2. 进入 Workers 和 Pages → Pages → cfvless-admin"
echo "3. 在设置中绑定以下资源："
echo "   - D1 数据库: $DB_NAME (变量名: DB)"
echo "   - KV 命名空间: $KV_NAME (变量名: subscription)"
echo "4. 然后运行部署脚本"