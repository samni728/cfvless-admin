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

## 🚀 快速部署

### 🚀 一键部署（推荐）

#### 方式一：Cloudflare Dashboard 直接部署（最简单）

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-blue?style=for-the-badge&logo=cloudflare)](https://dash.cloudflare.com/)

**这是最简单的方式，无需任何配置！**

**部署步骤：**

1. **Fork 项目** → 点击右上角 [Fork](https://github.com/samni728/cfvless-admin/fork) 按钮
2. **点击部署按钮** → 进入 Cloudflare Dashboard
3. **导航到 Pages** → 点击左侧菜单 **Workers 和 Pages** → **Pages**
4. **创建应用程序** → 点击 **创建应用程序**
5. **选择 "Connect to Git"** → 连接 GitHub 仓库
6. **选择 GitHub** → 授权访问您的 GitHub 账户
7. **选择仓库** → 选择您 Fork 后的仓库（例如：`您的用户名/cfvless-admin`）
8. **配置构建设置**：
   - Framework preset: **None**
   - Build command: **留空**
   - Build output directory: **留空**
9. **点击 "Save and Deploy"** → 完成！

**✅ 优势：**

- ✅ **零配置**：无需设置 API Token
- ✅ **Web 界面**：完全通过浏览器操作
- ✅ **自动认证**：Cloudflare 处理所有认证
- ✅ **自动更新**：代码推送后自动重新部署
- ✅ **用户友好**：适合所有技术水平
- ✅ **独立部署**：每个用户部署自己的版本

**⚠️ 重要提醒：**

- **必须先 Fork 项目**：用户需要先 Fork 到自己的 GitHub 账户
- 部署成功后，您需要**手动创建** D1 数据库和 KV 命名空间
- 详细步骤请参考下方的"部署后配置"部分

#### 方式二：GitHub Actions 自动部署（高级用户）

[![Run on GitHub Actions](https://img.shields.io/badge/Run%20on-GitHub%20Actions-black?style=for-the-badge&logo=github)](../../actions/workflows/deploy-mvp.yml)

[打开本仓库的 Actions 页](../../actions)

**⚠️ 注意：推荐使用方式一，更简单！**

**如果您需要更高级的自动化部署，可以设置 GitHub Actions：**

#### 方式三：直接上传部署

如果 GitHub 集成遇到问题，可以使用直接上传：

1. 访问 [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages/new/create)
2. 选择 **Direct Upload**
3. 下载项目文件：
   ```bash
   git clone https://github.com/samni728/cfvless-admin.git
   ```
4. 上传以下文件：
   - `_worker.js`
   - `index.html`
   - `data.js`
   - `wrangler.toml`
5. 点击 **Deploy site**

### 命令行部署

如果您已安装 Wrangler CLI：

```bash
# 克隆项目
git clone https://github.com/samni728/cfvless-admin.git
cd cfvless-admin

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
   - **Name**: `CLOUDflare_ACCOUNT_ID`
   - **Value**: 粘贴您的 Account ID（从 Cloudflare Dashboard 右侧边栏获取）
   - 点击 **Add secret**

##### 步骤 3：验证设置

1. **检查密钥是否添加成功**

   - 在 Secrets 列表中应该看到 `CLOUDFLARE_API_TOKEN` 和 `CLOUDflare_ACCOUNT_ID`
   - 密钥值会显示为 `***`（隐藏保护）

2. **触发部署**
   - 推送任何代码更改到 `main` 分支
   - 或者手动触发 GitHub Actions

**⚠️ 重要提醒**：

- API Token 只显示一次，请妥善保存
- 密钥名称必须完全一致：`CLOUDFLARE_API_TOKEN` 和 `CLOUDflare_ACCOUNT_ID`
- 如果 Token 泄露，请立即在 Cloudflare 中删除并重新创建

4. **推送代码**：推送代码到 `main` 分支即可自动部署

#### 故障排除：

如果部署失败，请检查：

- API Token 权限是否正确（需要 Cloudflare Pages:Edit 权限）
- 项目名称是否已存在（如果存在，请先删除或使用不同名称）
- GitHub Actions 是否已启用

### 🔧 故障排除

#### 404 错误解决方案

如果点击部署按钮后出现 404 错误：

1. **直接访问 Cloudflare Pages**：

   - 手动访问：https://dash.cloudflare.com/
   - 进入 **Workers 和 Pages** → **Pages**
   - 点击 **创建应用程序**

2. **检查账户权限**：

   - 确保已登录 Cloudflare 账户
   - 确保账户有 Pages 访问权限

3. **使用备用链接**：
   - 直接访问：https://dash.cloudflare.com/?to=/:account/pages/new/create
   - 或者：https://dash.cloudflare.com/?to=/:account/pages

#### 部署后配置（必需）

**无论使用哪种部署方式，部署成功后都需要手动配置以下资源：**

##### 1. 创建 D1 数据库

1. 访问 [Cloudflare D1](https://dash.cloudflare.com/?to=/:account/workers/d1)
2. 点击 **创建数据库**
3. 输入数据库名称：`cfvless-db`
4. 创建后，在数据库控制台执行 `d1_init.sql` 中的 SQL 语句

##### 2. 创建 KV 命名空间

1. 访问 [Cloudflare KV](https://dash.cloudflare.com/?to=/:account/workers/kv)
2. 点击 **创建命名空间**
3. 输入名称：`user-sessions`

##### 3. 配置绑定

1. 进入您的 Pages 项目设置
2. 点击 **函数 (Functions)** 标签
3. 在 **绑定** 部分添加：
   - **D1 数据库绑定**：
     - 变量名称：`DB`
     - D1 数据库：选择刚创建的 `cfvless-db`
   - **KV 命名空间绑定**：
     - 变量名称：`subscription`
     - KV 命名空间：选择刚创建的 `user-sessions`
4. 点击 **保存**

**完成以上配置后，您的应用就可以正常使用了！**

### 手动部署

#### 准备工作

1. **Cloudflare 账户**: 需要一个 Cloudflare 账户
2. **D1 数据库**: 用于存储用户数据和订阅信息
3. **KV 存储**: 用于会话管理

### 部署步骤

#### 1. 创建 D1 数据库

1. 登录 Cloudflare 仪表板 → **Workers 和 Pages** → **D1**
2. 点击 **创建数据库**，输入名称如 `cfvless-db`
3. 在数据库控制台中执行以下 SQL：

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    user_uuid TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 订阅源表
CREATE TABLE IF NOT EXISTS subscription_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    last_fetch DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 节点池表
CREATE TABLE IF NOT EXISTS node_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    node_hash TEXT UNIQUE NOT NULL,
    node_data TEXT NOT NULL,
    protocol TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#007bff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 节点标签映射表
CREATE TABLE IF NOT EXISTS node_tag_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (node_id) REFERENCES node_pool (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE(node_id, tag_id)
);

-- 订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    node_data_base64 TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

#### 2. 创建 KV 命名空间

1. 在 Cloudflare 仪表板中 → **Workers 和 Pages** → **KV**
2. 点击 **创建命名空间**，输入名称如 `user-sessions`

#### 3. 部署到 Cloudflare Pages

1. 在 Cloudflare 仪表板中 → **Workers 和 Pages** → **创建应用程序** → **Pages** → **上传资产**
2. 项目名称：输入如 `cfvless-admin`
3. **上传文件**：同时选择 `_worker.js`、`index.html`、`data.js` 三个文件
4. 点击 **部署站点**

#### 4. 配置绑定

1. 进入项目设置 → **函数 (Functions)**
2. **绑定 D1 数据库**：
   - 变量名称：`DB`
   - D1 数据库：选择刚创建的数据库
3. **绑定 KV 命名空间**：
   - 变量名称：`subscription`
   - KV 命名空间：选择刚创建的命名空间
4. 点击 **保存**

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
