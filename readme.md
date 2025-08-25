# 🌐 Cloudflare VLESS/VMess 聚合管理平台

这是一个基于 Cloudflare Workers 的高性能 NAT64 VLESS 代理项目，专门设计用于在 IPv6 环境下通过 NAT64 技术访问 IPv4 资源。项目集成了用户管理系统、源节点生成功能和多种订阅格式支持。

## ✨ 项目特色

- **🌐 NAT64 技术**: 自动 IPv4 到 IPv6 地址转换，完美解决 IPv6 环境下的 IPv4 访问问题
- **🔐 用户管理系统**: 完整的注册/登录/会话管理，支持多用户隔离
- **🔧 源节点管理**: 支持 NAT64 和 ProxyIP 两种类型的源节点生成和管理
- **📡 多格式订阅**: 支持通用 Base64、Clash YAML、Sing-box JSON 等多种订阅格式
- **⚡ 高性能**: 基于 Cloudflare Workers 边缘计算，全球 CDN 加速
- **🛡️ 安全可靠**: 采用安全的密码哈希和会话管理机制

## 📁 项目文件结构

```
cfvless-admin/
├── _worker.js                    # 核心 Worker 脚本 (2901 行)
├── index.html                    # 前端管理界面 (3010 行)
├── data.js                       # IP 地址池和域名配置
├── wrangler.toml                 # Cloudflare Workers 配置
├── d1_init.sql                   # 数据库初始化脚本
├── deploy.sh                     # 部署脚本
├── 开发摘要.md                   # 详细技术文档
├── readme.md                     # 项目说明文档
├── AGENTS.md                     # 代理协议说明
├── _workernat64.js              # NAT64 参考版本
└── _workernat64_basee_fixed.js  # 修复后的基础版本
```

## 🚀 部署到 Cloudflare Pages

本项目提供多种部署方式，适合不同技术水平的用户：

### 📋 部署方式对比

| 部署方式 | 适合人群 | 优势 | 难度 |
|---------|---------|------|------|
| 🌐 **手动部署** | 小白用户 | 可视化、安全、易理解 | ⭐ |
| 🎯 **命令行部署** | 开发者 | 快速、灵活、可控 | ⭐⭐ |
| 🤖 **GitHub Actions** | 团队协作 | 自动化、版本控制 | ⭐⭐⭐ |

---

## 🌐 方式一：手动部署（推荐新手）

### 📋 准备工作

在开始之前，您需要：
- ✅ 一个 Cloudflare 账户（免费即可）
- ✅ 下载本项目代码到本地

### 步骤 1：创建 Cloudflare Pages 项目

#### 1.1 登录 Cloudflare Dashboard

1. **访问 Cloudflare**：
   - 打开浏览器，访问：https://dash.cloudflare.com
   - 使用您的账户登录

2. **进入 Pages 服务**：
   - 在左侧菜单中找到 **Workers 和 Pages**
   - 点击进入 **Pages** 页面

#### 1.2 创建新项目

1. **开始创建**：
   - 点击 **创建应用程序** 按钮
   - 选择 **上传资产** 选项

2. **项目配置**：
   - **项目名称**：输入 `cfvless-admin`（或您喜欢的名称）
   - 点击 **创建项目**

3. **上传文件**：
   - 将以下 3 个文件拖拽到上传区域：
     - `index.html`（主页面）
     - `_worker.js`（后端逻辑）
     - `data.js`（数据文件）
   - 点击 **部署站点**

4. **等待部署**：
   - 系统会自动部署您的文件
   - 完成后会显示访问地址，如：`https://cfvless-admin.pages.dev`

### 步骤 2：创建 D1 数据库

#### 2.1 进入 D1 服务

1. **返回主菜单**：
   - 在 Cloudflare Dashboard 左侧菜单
   - 点击 **Workers 和 Pages** → **D1**

2. **创建数据库**：
   - 点击 **创建数据库** 按钮
   - **数据库名称**：输入 `subscription-db`
   - 点击 **创建**

#### 2.2 初始化数据库表

1. **进入数据库控制台**：
   - 点击刚创建的 `subscription-db` 数据库
   - 选择 **控制台** 标签

2. **执行初始化 SQL**：
   - 打开项目文件夹中的 `d1_init.sql` 文件
   - 复制全部内容
   - 粘贴到控制台的 SQL 输入框中
   - 点击 **执行** 按钮

3. **验证创建结果**：
   - 执行成功后，可以运行以下命令查看表：
   ```sql
   SELECT name FROM sqlite_master WHERE type='table';
   ```
   - 应该看到 7 个表被创建

### 步骤 3：创建 KV 命名空间

#### 3.1 进入 KV 服务

1. **访问 KV 页面**：
   - 在 Cloudflare Dashboard 左侧菜单
   - 点击 **Workers 和 Pages** → **KV**

2. **创建命名空间**：
   - 点击 **创建命名空间** 按钮
   - **命名空间名称**：输入 `subscription`
   - 点击 **添加**

### 步骤 4：绑定资源到 Pages 项目

#### 4.1 进入 Pages 项目设置

1. **返回 Pages**：
   - 在 Cloudflare Dashboard 中
   - 进入 **Workers 和 Pages** → **Pages**
   - 点击您的 `cfvless-admin` 项目

2. **进入设置页面**：
   - 点击 **设置** 标签
   - 选择 **函数** 子标签

#### 4.2 绑定 D1 数据库

1. **添加 D1 绑定**：
   - 在 **D1 数据库绑定** 部分
   - 点击 **添加绑定** 按钮

2. **配置绑定**：
   - **变量名**：输入 `DB`（必须大写）
   - **D1 数据库**：选择 `subscription-db`
   - 点击 **保存**

#### 4.3 绑定 KV 命名空间

1. **添加 KV 绑定**：
   - 在 **KV 命名空间绑定** 部分
   - 点击 **添加绑定** 按钮

2. **配置绑定**：
   - **变量名**：输入 `subscription`
   - **KV 命名空间**：选择 `subscription`
   - 点击 **保存**

#### 4.4 完成绑定

1. **保存所有设置**：
   - 确认两个绑定都已添加
   - 点击页面底部的 **保存** 按钮

2. **等待重新部署**：
   - 保存后，Pages 会自动重新部署
   - 等待部署完成（通常 1-2 分钟）

### 步骤 5：验证部署

#### 5.1 访问网站

1. **打开网站**：
   - 访问您的 Pages 地址：`https://cfvless-admin.pages.dev`
   - 应该能看到登录页面

2. **测试功能**：
   - 尝试注册一个新账户
   - 登录并测试基本功能

#### 5.2 故障排除

如果网站无法正常工作：

1. **检查绑定**：
   - 确认 D1 和 KV 绑定的变量名正确
   - `DB`（D1 数据库）和 `subscription`（KV 命名空间）

2. **查看日志**：
   - 在 Pages 项目中点击 **函数** 标签
   - 查看实时日志了解错误信息

3. **重新部署**：
   - 在 Pages 项目中点击 **部署** 标签
   - 点击最新部署右侧的 **重试** 按钮

---

## 🎯 方式二：命令行部署（推荐开发者）

### 📋 准备工作

#### 安装必需工具

```bash
# 安装 Node.js（如果未安装）
# 访问 https://nodejs.org 下载安装

# 安装 Wrangler CLI
npm install -g wrangler@latest

# 验证安装
wrangler --version
```

#### 获取 Cloudflare 凭据

1. **获取 Account ID**：
   - 登录 Cloudflare Dashboard
   - 右侧边栏可以看到 Account ID

2. **创建 API Token**：
   - 访问：https://dash.cloudflare.com/profile/api-tokens
   - 点击 **Create Token** → **Custom token**
   - 设置权限：
     ```
     ✅ Account:Read
     ✅ User:Read
     ✅ Cloudflare Pages:Edit
     ✅ Workers Scripts:Edit
     ✅ Workers KV Storage:Edit
     ✅ D1:Edit
     ```
   - 创建并复制 Token

### 🚀 使用智能菜单部署

#### 设置环境变量

```bash
# 设置 Cloudflare 凭据
export CLOUDFLARE_ACCOUNT_ID=你的账号ID
export CLOUDFLARE_API_TOKEN=你的API_Token

# 验证设置
wrangler whoami
```

#### 运行部署脚本

```bash
# 给脚本执行权限
chmod +x deploy-menu.sh

# 运行智能菜单
./deploy-menu.sh
```

#### 菜单选项说明

- **选项 1**：🗄️ 初始化资源（创建 D1 数据库和 KV 命名空间）
- **选项 2**：🚀 部署代码（仅部署 3 个核心文件）
- **选项 3**：🔄 重新部署（绑定资源后使用此选项）
- **选项 4**：📊 检查状态（查看资源和部署状态）
- **选项 5**：🎯 完整流程（初始化 + 部署，新手推荐）
- **选项 6**：❌ 退出

#### 推荐的首次部署流程

1. **选择选项 5（完整流程）**：
   - 自动创建 D1 数据库和 KV 命名空间
   - 初始化数据库表结构
   - 创建 Pages 项目并部署

2. **手动绑定资源**：
   - 前往 Cloudflare Dashboard
   - 进入 Pages 项目设置
   - 绑定 D1 和 KV 资源（参考手动部署步骤 4）

3. **重新部署**：
   - 回到菜单，选择 **选项 3（重新部署）**
   - 确保绑定生效

### 🔧 使用传统脚本部署

如果您喜欢问答式的部署：

```bash
# 给脚本执行权限
chmod +x deploy-cli.sh

# 运行部署脚本
./deploy-cli.sh
```

脚本会询问是否需要初始化数据库，首次部署选择 `y`。

### 📊 仅初始化数据库

如果只需要创建和初始化数据库：

```bash
# 给脚本执行权限
chmod +x init-db-only.sh

# 运行数据库初始化
./init-db-only.sh
```

---

## 🤖 方式三：GitHub Actions 自动部署

### 📋 适用场景

- 团队协作开发
- 需要版本控制
- 希望代码更新时自动部署

### 🚀 设置步骤

#### 1. Fork 本仓库

1. **Fork 项目**：
   - 点击 GitHub 页面右上角的 **Fork** 按钮
   - 选择您的账户

#### 2. 设置 GitHub Secrets

1. **进入仓库设置**：
   - 在您 Fork 的仓库中
   - 点击 **Settings** 标签

2. **添加密钥**：
   - 左侧菜单选择 **Secrets and variables** → **Actions**
   - 添加以下密钥：
     - `CLOUDFLARE_API_TOKEN`：您的 API Token
     - `CLOUDFLARE_ACCOUNT_ID`：您的 Account ID

#### 3. 触发部署

**手动触发**：
- 进入 **Actions** 标签
- 选择 **Deploy to Cloudflare Pages (Optimized)**
- 点击 **Run workflow**

**注意**：当前配置为手动触发，避免意外部署。如需自动触发，请修改 `.github/workflows/deploy-pages.yml` 文件。

---

## 🔧 故障排除

### API Token 权限问题

如果遇到 `Authentication error [code: 10000]` 错误：

1. **检查权限**：确保 API Token 包含所有必需权限
2. **重新创建 Token**：前往 Cloudflare Dashboard 重新创建
3. **验证 Account ID**：确保使用正确的 Account ID

### 部署失败问题

1. **检查文件**：确保 `_worker.js`、`index.html`、`data.js` 存在
2. **查看日志**：检查 Cloudflare Pages 部署日志
3. **重新绑定**：确认 D1 和 KV 资源正确绑定

### 功能异常问题

1. **检查绑定**：
   - D1 绑定变量名必须是 `DB`
   - KV 绑定变量名必须是 `subscription`

2. **数据库初始化**：
   - 确认数据库表已正确创建
   - 检查 SQL 执行是否成功

3. **重新部署**：
   - 绑定资源后需要重新部署才能生效

### 详细文档

- 📖 **完整部署指南**：`CLI_DEPLOYMENT_GUIDE.md`
- 🔧 **故障排除**：`DEPLOYMENT_FIX_GUIDE.md`

---

### 🚀 一键部署（传统方式）

如果您熟悉命令行操作：

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 一键部署
chmod +x deploy-simple.sh
./deploy-simple.sh
```

### GitHub Actions 自动部署（高级用户）

如果您需要更高级的自动化部署，可以设置 GitHub Actions：

#### 设置步骤：

##### 步骤 1：获取 Cloudflare API Token

1. **登录 Cloudflare Dashboard**

   - 访问：https://dash.cloudflare.com/
   - 使用您的 Cloudflare 账户登录

2. **创建 API Token**

   - 点击右上角头像 → **My Profile**
   - 左侧菜单选择 **API Tokens**
   - 点击 **Create Token**

3. **配置 Token 权限**

   - 选择 **Custom token** 模板
   - 设置 Token 名称：`GitHub Actions Deploy`
   - 权限配置：
     - **Account** → **Cloudflare Pages** → **Edit**
     - 选择您的账户
   - 点击 **Continue to summary**

4. **创建 Token**
   - 确认权限设置
   - 点击 **Create Token**
   - **重要**：复制生成的 Token（只显示一次！）

##### 步骤 2：在 GitHub 仓库中添加密钥

1. **进入 GitHub 仓库设置**

   - 访问您的 GitHub 仓库
   - 点击 **Settings** 标签

2. **添加仓库密钥**

   - 左侧菜单选择 **Secrets and variables** → **Actions**
   - 点击 **New repository secret**

3. **设置 API Token 密钥**

   - **Name**: `CLOUDFLARE_API_TOKEN`
   - **Value**: 粘贴刚才复制的 Cloudflare API Token
   - 点击 **Add secret**

4. **添加 Account ID 密钥**
   - 再次点击 **New repository secret**
   - **Name**: `CLOUDFLARE_ACCOUNT_ID`
   - **Value**: 粘贴您的 Account ID（从 Cloudflare Dashboard 右侧边栏获取）
   - 点击 **Add secret**

##### 步骤 3：验证设置

1. **检查密钥是否添加成功**

   - 在 Secrets 列表中应该看到 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`
   - 密钥值会显示为 `***`（隐藏保护）

2. **触发部署**
   - 推送任何代码更改到 `main` 分支
   - 或者手动触发 GitHub Actions

**⚠️ 重要提醒**：

- API Token 只显示一次，请妥善保存
- 密钥名称必须完全一致：`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`
- 如果 Token 泄露，请立即在 Cloudflare 中删除并重新创建

##### 步骤 4：部署方式

**方式一：自动部署（推荐）**
- 推送代码到 `main` 分支即可自动部署
- GitHub Actions 会自动创建 D1 数据库、KV 命名空间并部署

**方式二：手动部署**
- 进入 GitHub 仓库的 **Actions** 标签
- 选择 **Deploy to Cloudflare Pages (Fixed)** 工作流
- 点击 **Run workflow** 按钮
- 可以自定义项目名称等参数

#### 故障排除：

如果部署失败，请检查：

1. **密钥配置**：
   - `CLOUDFLARE_API_TOKEN` 是否正确设置
   - `CLOUDFLARE_ACCOUNT_ID` 是否正确设置
   - API Token 权限是否包含：Workers Scripts:Edit, Workers KV Storage:Edit, D1:Edit, Cloudflare Pages:Edit

2. **项目配置**：
   - 项目名称是否已存在（如果存在，请使用不同名称或删除现有项目）
   - GitHub Actions 是否已启用

3. **查看详细日志**：
   - 进入 GitHub Actions 查看具体错误信息
   - 检查 Cloudflare Dashboard 中的资源创建情况

4. **项目不存在错误**：
   - 如果遇到 "Project not found" 错误
   - 请参考 `DEPLOYMENT_FIX_GUIDE.md` 获取详细解决方案
   - 推荐先在 Cloudflare Dashboard 手动创建项目

---

## 🎯 核心功能

### 1. 用户管理系统

- **注册/登录**: 安全的用户认证系统
- **会话管理**: 基于 Cookie 的会话保持
- **用户隔离**: 每个用户的数据完全隔离

### 2. NAT64 代理功能

- **自动地址转换**: IPv4 地址自动转换为 NAT64 IPv6 地址
- **故障转移**: 直连失败时自动使用 NAT64 重试
- **DNS 解析**: 支持 DNS over HTTPS 查询

### 3. 源节点管理

- **NAT64 源节点**: 基于 NAT64 技术的源节点生成
- **ProxyIP 源节点**: 支持自定义 ProxyIP Nat64 自定义 (有待开发)
- **默认节点**: 用户注册时自动创建默认源节点

### 4. 订阅服务

- **多格式支持**: Base64、Clash、Sing-box 等格式
- **实时更新**: 节点变更后订阅自动更新
- **个性化**: 每个用户拥有独立的订阅链接

## 🌐 核心功能特性

### 📡 NAT64 代理功能

#### 1. **NAT64 技术实现**

- **自动地址转换**: IPv4 地址自动转换为 NAT64 IPv6 地址
- **智能故障转移**: 直连失败时自动切换到 NAT64 网关
- **DNS 解析**: 支持 DNS over HTTPS 查询
- **连接重试**: 自动重试机制确保连接稳定性

#### 2. **VLESS 协议支持**

- **协议解析**: 完整的 VLESS 协议头部解析
- **WebSocket 传输**: 支持 WebSocket 作为传输层
- **TLS 加密**: 支持 TLS/非 TLS 双模式
- **多端口支持**: 支持多种端口配置

### 🔧 用户管理系统

#### 1. **用户认证**

- **注册登录**: 安全的用户注册和登录系统
- **会话管理**: 基于 Cookie 的会话保持
- **密码安全**: SHA-256 密码哈希存储
- **用户隔离**: 每个用户的数据完全隔离

#### 2. **源节点管理**

- **默认源节点**: 用户注册时自动创建 NAT64 （已完成）和 ProxyIP 源节点（有待开发）
- **节点生成**: 基于源节点生成更多节点
- **节点配置**: 支持自定义节点参数（有待开发）
- **节点验证**: 验证节点配置的有效性 （有待开发）

### 📡 订阅服务

#### 1. **多格式支持**

- **Base64 格式**: 标准 V2Ray 订阅格式
- **Clash 格式**: YAML 格式的 Clash 配置
- **Sing-box 格式**: JSON 格式的 Sing-box 配置
- **实时更新**: 节点变更后订阅自动更新

#### 2. **订阅管理**

- **个性化订阅**: 每个用户拥有独立的订阅链接
- **订阅更新**: 支持手动和自动更新订阅
- **订阅验证**: 验证订阅内容的有效性
- **订阅分享**: 支持订阅链接的分享功能

## 📖 使用方法

### 1. 访问管理界面

部署完成后，访问您的 Pages 域名即可看到管理界面。

### 2. 注册账户

首次使用需要注册账户，系统会自动分配唯一的 UUID。

### 3. 管理源节点

- 查看默认的 NAT64 和 ProxyIP 源节点
- 自定义配置新的源节点
- 一键复制或导入到节点生成器

### 4. 生成订阅

- 使用节点生成器扩展更多节点
- 更新订阅获取最新节点列表
- 配置到客户端使用

## 🔧 技术架构

### 核心技术栈

- **前端**: HTML5 + CSS3 + JavaScript (Bootstrap 5)
- **后端**: Cloudflare Workers (Edge Computing)
- **数据库**: Cloudflare D1 (分布式 SQLite)
- **存储**: Cloudflare KV (键值存储)
- **部署**: Cloudflare Pages (全球 CDN)

### 核心模块

```javascript
// 主要功能模块
├── 用户认证 (getUserBySession 中间件)
├── NAT64 代理 (convertToNAT64IPv6, getIPv6ProxyAddress)
├── VLESS 协议处理 (parseVlessHeader, handleTCPOutBound)
├── 订阅生成 (generateSubscription, generateClashConfig)
├── 源节点管理 (createDefaultSourceNodes)
└── WebSocket 处理 (handleWebSocket)
```

### 🏗️ 技术架构

#### 1. **前端架构**

```javascript
// 现代化 Web UI 架构
├── 用户界面层 (Bootstrap 5 + 响应式设计)
├── 业务逻辑层 (JavaScript ES6+)
├── 数据交互层 (Fetch API)
└── 状态管理层 (本地存储 + 会话管理)
```

#### 2. **后端架构**

```javascript
// Cloudflare Workers 边缘计算架构
├── API 网关层 (路由分发 + 中间件)
├── 业务服务层 (用户管理 + 节点管理)
├── 数据访问层 (D1 数据库 + KV 存储)
└── 代理服务层 (VLESS 协议处理)
```

#### 3. **数据架构**

```sql
-- 核心数据表结构
├── users (用户管理)
├── subscriptions (订阅管理)
└── 其他扩展表 (根据功能需要)
```

### 🔌 主要 API 接口

#### 1. **认证相关 API**

```bash
POST /api/register          # 用户注册
POST /api/login            # 用户登录
POST /api/logout           # 用户登出
```

#### 2. **订阅服务 API**

```bash
GET /sub/:uuid                         # 获取订阅内容 (Base64)
GET /sub/:uuid?type=clash              # 获取 Clash 配置
GET /sub/:uuid?type=singbox            # 获取 Sing-box 配置
```

## 🌐 NAT64 技术原理

### 工作原理

1. **直连尝试**: 首先尝试直接连接目标 IPv4 地址
2. **NAT64 转换**: 失败时自动将 IPv4 地址转换为 NAT64 IPv6 地址
3. **重试连接**: 通过 NAT64 网关重新建立连接

### 地址转换算法

```javascript
// IPv4 到 NAT64 IPv6 转换示例
// 1.2.3.4 → [2602:fc59:b0:64::0102:0304]
function convertToNAT64IPv6(ipv4Address) {
  const parts = ipv4Address.split(".");
  const hex = parts.map((part) =>
    parseInt(part, 10).toString(16).padStart(2, "0")
  );
  const prefix = "2602:fc59:b0:64::";
  return `[${prefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}
```

## 🔒 安全特性

- **密码哈希**: 使用 SHA-256 加密存储用户密码
- **会话验证**: 严格的会话管理和验证机制
- **UUID 绑定**: 用户 UUID 与账户绑定，防止滥用
- **协议限制**: 仅支持 TCP 和 UDP (端口 53 DNS)

## 📊 性能优化

- **连接池复用**: 优化连接建立和复用
- **异步处理**: 全异步架构，提高并发性能
- **智能缓存**: DNS 查询结果缓存
- **边缘计算**: 利用 Cloudflare 全球边缘节点

## 🚨 故障排除

### 常见问题

1. **部署失败**: 检查 D1 数据库和 KV 绑定是否正确
2. **用户无法登录**: 确认数据库表结构是否正确创建
3. **NAT64 不工作**: 检查网络环境是否支持 NAT64

### 调试方法

- 查看 Cloudflare Workers 日志
- 检查浏览器开发者工具控制台
- 验证数据库连接和表结构

## 📝 更新日志

### v2.0.0 (当前版本)

- ✅ 集成 NAT64 技术
- ✅ 添加用户管理系统
- ✅ 实现源节点管理
- ✅ 支持多格式订阅
- ✅ 修复重复函数定义问题

### v1.0.0

- ✅ 基础 VLESS 代理功能
- ✅ 简单的节点生成

## 🙏 致谢

- **甬哥**: 提供的开源项目 VLESS 代理逻辑
  - 博客: [https://ygkkk.blogspot.com](https://ygkkk.blogspot.com)
  - YouTube: [https://www.youtube.com/@ygkkk](https://www.youtube.com/@ygkkk)
- **Cloudflare**: 提供强大的边缘计算平台
- **开源社区**: 各种技术方案和最佳实践

## ⚠️ 重要提醒

### Cloudflare 免费版限制

**请注意，本项目基于 Cloudflare Workers 免费版部署，存在以下限制：**

1. **请求次数限制**: 每天最多 10 万次请求
2. **数据库存储限制**: D1 数据库有存储容量限制
3. **共享资源**: 所有用户共享同一个 Cloudflare 账户的免费额度

### 使用建议

- **个人使用**: 适合个人或小团队使用
- **自建节点**: 如果您有自己的节点，建议导入自己的节点以减少对 Cloudflare 资源的依赖
- **监控使用量**: 定期检查 Cloudflare 仪表板中的使用情况
- **升级计划**: 如需更大使用量，可考虑升级到 Cloudflare 付费版

### 节点类型说明

- **Cloudflare 节点**: 使用 Cloudflare 的免费资源，所有用户共享每日限额
- **自建节点**: 您自己的服务器节点，不占用 Cloudflare 资源

## ⚠️ 免责声明

本项目仅供学习和技术研究使用。请遵守您所在地区的相关法律法规，勿将此项目用于任何非法用途。对于使用本项目所造成的任何后果，项目作者和贡献者概不负责。

## 📞 技术支持

如果您在使用过程中遇到问题，可以：

1. 查看 `开发摘要.md` 中的详细技术文档
2. 检查 Cloudflare Workers 的错误日志
3. 参考 `AGENTS.md` 中的代理协议说明

---

**项目地址**: [CFvless-ADMIN](https://github.com/samni728/cfvless-admin)

**最后更新**: 2025 年 8 月 24 日
