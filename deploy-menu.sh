#!/bin/bash

# Cloudflare Pages 智能部署菜单
# 支持分步操作和重新部署

echo "🚀 Cloudflare Pages 智能部署菜单"
echo "=================================="

# 检查环境变量
check_env() {
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
}

# 检查 Wrangler
check_wrangler() {
    if ! command -v wrangler &> /dev/null; then
        echo "📦 安装 Wrangler..."
        npm install -g wrangler@3.114.14
    fi
    
    echo "🔐 验证身份..."
    if ! wrangler whoami > /dev/null 2>&1; then
        echo "❌ 身份验证失败，请检查 API Token"
        exit 1
    fi
}

# 检查核心文件
check_files() {
    local missing_files=()
    
    if [ ! -f "_worker.js" ]; then
        missing_files+=("_worker.js")
    fi
    
    if [ ! -f "index.html" ]; then
        missing_files+=("index.html")
    fi
    
    if [ ! -f "data.js" ]; then
        missing_files+=("data.js")
    fi
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        echo "❌ 缺少必要文件:"
        for file in "${missing_files[@]}"; do
            echo "   - $file"
        done
        exit 1
    fi
    
    echo "✅ 核心文件检查通过"
}

# 初始化数据库和 KV
init_resources() {
    echo "🗄️ 初始化 Cloudflare 资源..."
    
    DB_NAME="subscription-db"
    KV_NAME="subscription"
    
    # 创建 D1 数据库
    echo "📊 创建 D1 数据库 '$DB_NAME'..."
    DB_OUTPUT=$(wrangler d1 create $DB_NAME 2>&1)
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "ℹ️ 数据库 '$DB_NAME' 已存在"
    else
        echo "✅ 数据库 '$DB_NAME' 创建成功"
    fi
    
    # 创建 KV 命名空间
    echo "📦 创建 KV 命名空间 '$KV_NAME'..."
    KV_OUTPUT=$(wrangler kv namespace create $KV_NAME 2>&1)
    if echo "$KV_OUTPUT" | grep -q "already exists"; then
        echo "ℹ️ KV 命名空间 '$KV_NAME' 已存在"
    else
        echo "✅ KV 命名空间 '$KV_NAME' 创建成功"
    fi
    
    # 初始化数据库表结构
    if [ -f "d1_init.sql" ]; then
        echo "🗃️ 执行数据库初始化..."
        if wrangler d1 execute $DB_NAME --remote --file=d1_init.sql; then
            echo "✅ 数据库表结构初始化成功"
        else
            echo "⚠️ 数据库初始化失败，请检查 SQL 文件"
        fi
    else
        echo "⚠️ 未找到 d1_init.sql 文件"
    fi
    
    echo ""
    echo "🔗 重要提醒："
    echo "1. 请前往 Cloudflare Dashboard: https://dash.cloudflare.com"
    echo "2. 进入 Workers 和 Pages → Pages → cfvless-admin"
    echo "3. 点击 设置 → 函数"
    echo "4. 添加以下绑定："
    echo "   📊 D1 数据库绑定: 变量名=DB, 数据库=subscription-db"
    echo "   📦 KV 命名空间绑定: 变量名=subscription, 命名空间=subscription"
    echo "5. 保存后选择菜单选项 3 重新部署代码"
    echo ""
}

# 部署代码（只部署3个核心文件）
deploy_code() {
    echo "🚀 部署代码到 Cloudflare Pages..."
    
    # 准备部署产物（只包含3个核心文件）
    echo "📦 准备部署产物..."
    rm -rf public
    mkdir -p public
    
    # 只复制3个核心文件
    cp _worker.js public/
    cp index.html public/
    cp data.js public/
    
    echo "✅ 部署产物准备完成（仅包含核心文件）:"
    echo "   - _worker.js (Cloudflare Functions)"
    echo "   - index.html (静态页面)"
    echo "   - data.js (数据文件)"
    
    # 显示文件大小
    echo ""
    echo "📋 文件详情:"
    ls -lh public/
    
    # 部署到 Cloudflare Pages
    echo ""
    echo "🚀 开始部署..."
    if wrangler pages deploy ./public \
        --project-name=cfvless-admin \
        --commit-dirty=true; then
        
        echo ""
        echo "✅ 部署成功！"
        echo "🔗 访问地址: https://cfvless-admin.pages.dev"
        
        # 清理临时文件
        rm -rf public/
        
        echo ""
        echo "🎉 代码部署完成！"
        echo "如果这是首次部署，请确保已在 Dashboard 中绑定 D1 和 KV 资源"
        
    else
        echo "❌ 部署失败"
        rm -rf public/
        return 1
    fi
}

# 检查项目状态
check_status() {
    echo "📊 检查项目状态..."
    
    echo ""
    echo "📋 D1 数据库列表:"
    wrangler d1 list
    
    echo ""
    echo "📦 KV 命名空间列表:"
    wrangler kv namespace list
    
    echo ""
    echo "🌐 Pages 项目列表:"
    wrangler pages project list
    
    echo ""
    echo "📈 最近部署记录:"
    wrangler pages deployment list --project-name=cfvless-admin 2>/dev/null || echo "项目可能不存在"
}

# 显示菜单
show_menu() {
    echo ""
    echo "📋 请选择操作:"
    echo "1. 🗄️  初始化资源 (创建 D1 数据库和 KV 命名空间)"
    echo "2. 🚀 部署代码 (仅部署 3 个核心文件)"
    echo "3. 🔄 重新部署 (绑定资源后使用此选项)"
    echo "4. 📊 检查状态 (查看资源和部署状态)"
    echo "5. 🎯 完整流程 (初始化 + 部署)"
    echo "6. ❌ 退出"
    echo ""
}

# 主程序
main() {
    check_env
    check_wrangler
    check_files
    
    while true; do
        show_menu
        read -p "请输入选项 (1-6): " choice
        
        case $choice in
            1)
                echo ""
                init_resources
                ;;
            2)
                echo ""
                deploy_code
                ;;
            3)
                echo ""
                echo "🔄 重新部署代码..."
                echo "这将使用最新的资源绑定配置"
                deploy_code
                ;;
            4)
                echo ""
                check_status
                ;;
            5)
                echo ""
                echo "🎯 执行完整流程..."
                init_resources
                echo ""
                echo "⏸️  请先在 Dashboard 中绑定资源，然后按回车继续部署..."
                read -p "绑定完成后按回车继续: "
                deploy_code
                ;;
            6)
                echo "👋 再见！"
                exit 0
                ;;
            *)
                echo "❌ 无效选项，请输入 1-6"
                ;;
        esac
        
        echo ""
        read -p "按回车继续..."
    done
}

# 运行主程序
main