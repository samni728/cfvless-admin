#!/bin/bash

# D1 数据库批量导入脚本
# 支持多种导入方式

echo "🗄️ D1 数据库批量导入工具"
echo "========================="

# 检查环境变量
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ 请先设置环境变量:"
    echo "   export CLOUDFLARE_ACCOUNT_ID=你的账号ID"
    echo "   export CLOUDFLARE_API_TOKEN=你的APIToken"
    exit 1
fi

DB_NAME="subscription-db"
SQL_FILE="d1_init.sql"

# 检查 SQL 文件
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ 未找到 SQL 文件: $SQL_FILE"
    exit 1
fi

echo "📋 数据库信息:"
echo "   数据库名: $DB_NAME"
echo "   SQL 文件: $SQL_FILE"
echo "   文件大小: $(wc -l < $SQL_FILE) 行"

# 显示菜单
echo ""
echo "📋 选择导入方式:"
echo "1. 🚀 直接导入 (推荐)"
echo "2. 📊 预览 SQL 内容"
echo "3. 🔍 验证数据库连接"
echo "4. 🗑️  清空数据库 (危险操作)"
echo "5. ❌ 退出"
echo ""

read -p "请选择 (1-5): " choice

case $choice in
    1)
        echo ""
        echo "🚀 开始批量导入数据库..."
        echo "📡 执行 SQL 文件: $SQL_FILE"
        
        if wrangler d1 execute $DB_NAME --remote --file=$SQL_FILE; then
            echo ""
            echo "✅ 数据库导入成功！"
            echo ""
            echo "📊 验证导入结果:"
            echo "正在查询表列表..."
            wrangler d1 execute $DB_NAME --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
            
            echo ""
            echo "📈 表统计信息:"
            tables=("users" "subscription_sources" "node_pool" "subscriptions" "tags" "node_tag_map" "source_node_configs")
            for table in "${tables[@]}"; do
                echo "正在统计 $table 表..."
                wrangler d1 execute $DB_NAME --remote --command="SELECT COUNT(*) as count FROM $table;" 2>/dev/null || echo "  $table: 表可能不存在"
            done
            
        else
            echo "❌ 数据库导入失败"
            exit 1
        fi
        ;;
        
    2)
        echo ""
        echo "📊 SQL 文件内容预览:"
        echo "===================="
        head -20 $SQL_FILE
        echo ""
        echo "... (显示前 20 行，总共 $(wc -l < $SQL_FILE) 行)"
        echo ""
        echo "📋 包含的表:"
        grep "CREATE TABLE" $SQL_FILE | sed 's/CREATE TABLE IF NOT EXISTS /- /' | sed 's/ (.*$//'
        ;;
        
    3)
        echo ""
        echo "🔍 验证数据库连接..."
        if wrangler d1 execute $DB_NAME --remote --command="SELECT 1 as test;"; then
            echo "✅ 数据库连接正常"
            
            echo ""
            echo "📊 当前数据库状态:"
            wrangler d1 execute $DB_NAME --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
        else
            echo "❌ 数据库连接失败"
        fi
        ;;
        
    4)
        echo ""
        echo "⚠️  危险操作：清空数据库"
        echo "这将删除所有表和数据！"
        read -p "确认清空数据库？输入 'YES' 确认: " confirm
        
        if [ "$confirm" = "YES" ]; then
            echo "🗑️  正在清空数据库..."
            
            # 获取所有表名并删除
            tables=$(wrangler d1 execute $DB_NAME --remote --command="SELECT name FROM sqlite_master WHERE type='table';" 2>/dev/null | grep -v "name\|---" | tr -d ' ')
            
            for table in $tables; do
                if [ ! -z "$table" ]; then
                    echo "删除表: $table"
                    wrangler d1 execute $DB_NAME --remote --command="DROP TABLE IF EXISTS $table;" 2>/dev/null
                fi
            done
            
            echo "✅ 数据库已清空"
        else
            echo "❌ 操作已取消"
        fi
        ;;
        
    5)
        echo "👋 退出"
        exit 0
        ;;
        
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "🎉 操作完成！"