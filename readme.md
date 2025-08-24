# 🌐 NAT64 VLESS 代理项目 - Cloudflare Workers 部署版

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

### 准备工作

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
- **ProxyIP 源节点**: 支持自定义 ProxyIP 的源节点
- **默认节点**: 用户注册时自动创建默认源节点

### 4. 订阅服务

- **多格式支持**: Base64、Clash、Sing-box 等格式
- **实时更新**: 节点变更后订阅自动更新
- **个性化**: 每个用户拥有独立的订阅链接

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
    const parts = ipv4Address.split('.');
    const hex = parts.map(part => 
        parseInt(part, 10).toString(16).padStart(2, '0')
    );
    const prefix = '2602:fc59:b0:64::';
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

- **甬哥**: 提供基础的 VLESS 代理逻辑
  - 博客: [https://ygkkk.blogspot.com](https://ygkkk.blogspot.com)
  - YouTube: [https://www.youtube.com/@ygkkk](https://www.youtube.com/@ygkkk)
- **Cloudflare**: 提供强大的边缘计算平台
- **开源社区**: 各种技术方案和最佳实践

## ⚠️ 免责声明

本项目仅供学习和技术研究使用。请遵守您所在地区的相关法律法规，勿将此项目用于任何非法用途。对于使用本项目所造成的任何后果，项目作者和贡献者概不负责。

## 📞 技术支持

如果您在使用过程中遇到问题，可以：

1. 查看 `开发摘要.md` 中的详细技术文档
2. 检查 Cloudflare Workers 的错误日志
3. 参考 `AGENTS.md` 中的代理协议说明

---

**项目地址**: [GitHub Repository](https://github.com/samni728/cfvless-admin)

**最后更新**: 2024年12月