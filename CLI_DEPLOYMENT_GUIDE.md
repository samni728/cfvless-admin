# 🚀 命令行部署完整指南

## 📋 概述

通过命令行进行 Cloudflare Pages 部署，无需 Web UI 登录，支持数据库初始化。

## 🛠️ 准备工作

### 1. 获取 Cloudflare 凭据

1. **获取 Account ID**：
   - 登录 Cloudflare Dashboard
   - 右侧边栏可以看到 Account ID

2. **创建 API Token**：
   - 进入 **My Profile** → **API Tokens**
   - 点击 **Create Token**
   - 选择 **Custom token**
   - 权限设置：
     ```
     Account - Cloudflare Pages:Edit
     Account - Workers Scripts:Edit
     Account - Workers KV Storage:Edit
     Account - D1:Edit
     Zone Resources - Include All zones
     ```

### 2. 设置环境变量

```bash
# 设置 Cloudflare 凭据
export CLOUDFLARE_ACCOUNT_ID=你的账号ID
export CLOUDFLARE_API_TOKEN=你的APIToken

# 可选：保存到 .env 文件（记得加入 .gitignore）
echo "CLOUDFLARE_ACCOUNT_ID=你的账号ID" > .env
echo "CLOUDFLARE_API_TOKEN=你的APIToken" >> .env
source .env
```

## 🚀 部署方式

### 方式一：智能菜单部署（推荐）

```bash
# 给脚本执行权限
chmod +x deploy-menu.sh

# 运行智能菜单
./deploy-menu.sh
```

菜单选项说明：
- **选项 1**：初始化资源（创建 D1 和 KV）
- **选项 2**：部署代码（仅 3 个核心文件）
- **选项 3**：重新部署（绑定资源后使用）
- **选项 4**：检查状态（查看资源信息）
- **选项 5**：完整流程（初始化 + 提醒绑定 + 部署）

### 方式二：传统一键部署

```bash
# 给脚本执行权限
chmod +x deploy-cli.sh

# 运行部署脚本
./deploy-cli.sh
```

脚本会询问是否需要初始化数据库，首次部署选择 `y`。

### 方式三：分步执行

#### 步骤 1：仅初始化数据库

```bash
# 给脚本执行权限
chmod +x setup-database.sh

# 运行数据库初始化
./setup-database.sh
```

#### 步骤 2：仅部署代码

```bash
# 设置环境变量后直接部署
./deploy-cli.sh
# 选择 N（不初始化数据库）
```

## 🎯 推荐的首次部署流程

### 完整的首次部署步骤：

1. **设置环境变量**：
   ```bash
   export CLOUDFLARE_ACCOUNT_ID=你的账号ID
   export CLOUDFLARE_API_TOKEN=你的APIToken
   ```

2. **运行智能菜单**：
   ```bash
   chmod +x deploy-menu.sh
   ./deploy-menu.sh
   ```

3. **选择选项 5（完整流程）**：
   - 自动创建 D1 数据库和 KV 命名空间
   - 初始化数据库表结构
   - 显示绑定提醒

4. **手动绑定资源**（重要！）：
   - 前往 [Cloudflare Dashboard](https://dash.cloudflare.com)
   - 进入 **Workers 和 Pages** → **Pages** → **cfvless-admin**
   - 点击 **设置** → **函数**
   - 添加 D1 绑定：变量名 `DB`，数据库 `subscription-db`
   - 添加 KV 绑定：变量名 `subscription`，命名空间 `subscription`
   - 点击 **保存**

5. **重新部署**：
   - 回到菜单，选择 **选项 3（重新部署）**
   - 或者直接按回车继续（如果使用完整流程）

6. **验证部署**：
   - 访问 https://cfvless-admin.pages.dev
   - 测试应用功能

### 后续更新部署：

```bash
# 代码更新后，只需要重新部署
./deploy-menu.sh
# 选择选项 2 或 3
```

### 方式三：手动命令

```bash
# 1. 安装 Wrangler
npm install -g wrangler@3.114.14

# 2. 验证身份
wrangler whoami

# 3. 创建数据库（首次）
wrangler d1 create subscription-db

# 4. 创建 KV 命名空间（首次）
wrangler kv namespace create subscription

# 5. 初始化数据库表结构（首次）
wrangler d1 execute subscription-db --remote --file=d1_init.sql

# 6. 准备部署产物
mkdir -p public
cp _worker.js index.html data.js public/

# 7. 部署
wrangler pages deploy ./public --project-name=cfvless-admin

# 8. 清理
rm -rf public/
```

## 📊 命令行操作示例

### 查看资源状态

```bash
# 查看 D1 数据库列表
wrangler d1 list

# 查看 KV 命名空间列表
wrangler kv namespace list

# 查看 Pages 项目列表
wrangler pages project list

# 查看部署历史
wrangler pages deployment list --project-name=cfvless-admin
```

### 数据库操作

```bash
# 执行 SQL 查询
wrangler d1 execute subscription-db --remote --command="SELECT * FROM users LIMIT 5;"

# 导入 SQL 文件
wrangler d1 execute subscription-db --remote --file=d1_init.sql

# 查看数据库信息
wrangler d1 info subscription-db
```

### KV 操作

```bash
# 查看 KV 中的键
wrangler kv key list --namespace-id=你的KV命名空间ID

# 设置 KV 值
wrangler kv key put "test-key" "test-value" --namespace-id=你的KV命名空间ID

# 获取 KV 值
wrangler kv key get "test-key" --namespace-id=你的KV命名空间ID
```

## ⚠️ 重要提醒

### 首次部署后必须手动绑定资源

即使通过命令行创建了数据库和 KV，仍需要在 Cloudflare Dashboard 中手动绑定：

1. **进入 Pages 项目**：
   - Cloudflare Dashboard → Workers 和 Pages → Pages → cfvless-admin

2. **绑定 D1 数据库**：
   - 设置 → 函数 → D1 数据库绑定
   - 变量名：`DB`
   - 数据库：`subscription-db`

3. **绑定 KV 命名空间**：
   - 设置 → 函数 → KV 命名空间绑定
   - 变量名：`subscription`
   - 命名空间：`subscription`

4. **保存设置**：
   - Pages 会自动重新部署

## 🔧 故障排除

### 常见问题

1. **身份验证失败**：
   ```bash
   # 检查环境变量
   echo $CLOUDFLARE_ACCOUNT_ID
   echo $CLOUDFLARE_API_TOKEN
   
   # 重新设置
   export CLOUDFLARE_API_TOKEN=新的Token
   ```

2. **项目不存在**：
   ```bash
   # 创建新项目
   wrangler pages project create cfvless-admin
   ```

3. **数据库已存在错误**：
   ```bash
   # 查看现有数据库
   wrangler d1 list
   
   # 直接使用现有数据库
   wrangler d1 execute subscription-db --remote --file=d1_init.sql
   ```

4. **权限不足**：
   - 检查 API Token 权限设置
   - 确保包含所有必需的权限

## 🎯 最佳实践

1. **环境变量管理**：
   ```bash
   # 使用 .env 文件
   echo "CLOUDFLARE_ACCOUNT_ID=xxx" > .env
   echo "CLOUDFLARE_API_TOKEN=xxx" >> .env
   echo ".env" >> .gitignore
   ```

2. **版本固定**：
   ```bash
   # 使用固定版本避免兼容性问题
   npm install -g wrangler@3.114.14
   ```

3. **自动化脚本**：
   ```bash
   # 创建部署别名
   alias deploy-cf="./deploy-cli.sh"
   alias setup-cf-db="./setup-database.sh"
   ```

## 🎉 总结

通过命令行部署的优势：

- ✅ **无需 Web 登录**：完全通过 API Token 认证
- ✅ **自动化友好**：适合 CI/CD 集成
- ✅ **完整功能**：支持数据库初始化和代码部署
- ✅ **版本控制**：可以固定 Wrangler 版本
- ✅ **灵活配置**：支持环境变量和脚本化

现在您可以完全通过命令行管理 Cloudflare Pages 部署了！🚀