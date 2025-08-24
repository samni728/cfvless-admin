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

## 🌐 Cloudflare VLESS/VMess 聚合管理平台

### 📡 节点管理功能

#### 1. **NAT64 节点生成**
- **自动 NAT64 转换**: 基于 NAT64 技术自动生成 IPv6 节点
- **智能故障转移**: 直连失败时自动切换到 NAT64 网关
- **多前缀支持**: 支持多个 NAT64 前缀配置
- **实时状态监控**: 监控 NAT64 节点的连接状态

#### 2. **自定义优选 IP 节点**
- **IP 优选算法**: 智能选择最优的 Cloudflare IP
- **地区筛选**: 按地理位置筛选 IP（美国、欧洲、亚洲等）
- **延迟测试**: 自动测试 IP 延迟并排序
- **自定义 IP 池**: 支持用户自定义 IP 地址池

#### 3. **CF 网段随机生成**
- **Cloudflare IP 段**: 内置完整的 Cloudflare IPv4/IPv6 网段
- **随机化算法**: 智能随机选择最优网段
- **负载均衡**: 自动分散流量到不同网段
- **网段监控**: 实时监控各网段的可用性

### 🔧 订阅节点管理

#### 1. **节点整删减功能**
- **批量删除**: 支持批量删除选中的节点
- **智能去重**: 自动识别并删除重复节点
- **条件筛选**: 按协议、地区、延迟等条件筛选删除
- **操作确认**: 删除前提供确认机制，防止误操作

#### 2. **节点编辑功能**
- **单个编辑**: 支持编辑单个节点的配置
- **批量修改**: 批量修改节点的共同属性
- **协议转换**: 支持 VLESS 和 VMess 协议互转
- **参数优化**: 自动优化节点参数配置

#### 3. **节点导入导出**
- **多格式导入**: 支持 Base64、Clash、Sing-box 等格式导入
- **批量导入**: 支持批量导入多个订阅源
- **智能解析**: 自动识别和解析各种节点格式
- **导出功能**: 支持多种格式导出节点列表

### 📊 分享管理功能

#### 1. **订阅分享**
- **公开分享**: 创建公开的订阅链接供他人使用
- **私有分享**: 创建带密码的私有订阅链接
- **时效控制**: 设置分享链接的有效期
- **访问统计**: 统计分享链接的访问次数

#### 2. **权限管理**
- **用户权限**: 不同用户拥有不同的操作权限
- **分享权限**: 控制用户是否可以分享订阅
- **管理权限**: 管理员可以管理所有用户的订阅
- **API 权限**: 控制 API 访问权限

#### 3. **分享统计**
- **使用统计**: 统计订阅的使用情况
- **流量统计**: 监控订阅的流量使用
- **用户统计**: 统计使用分享链接的用户
- **性能分析**: 分析订阅的性能表现

### 🏷️ 标签分组系统

#### 1. **智能标签**
- **自动标签**: 根据节点特征自动生成标签
- **自定义标签**: 用户可自定义标签名称和颜色
- **标签分类**: 支持多级标签分类
- **标签搜索**: 快速搜索特定标签的节点

#### 2. **分组管理**
- **动态分组**: 根据条件动态创建节点分组
- **静态分组**: 手动创建固定的节点分组
- **分组嵌套**: 支持分组的嵌套结构
- **分组分享**: 分享特定的节点分组

### 🔄 自动化功能

#### 1. **自动更新**
- **定时更新**: 定时自动更新订阅源
- **增量更新**: 只更新发生变化的节点
- **智能同步**: 自动同步多个订阅源
- **更新通知**: 更新完成后发送通知

#### 2. **智能优化**
- **性能优化**: 自动优化节点性能
- **负载均衡**: 自动平衡节点负载
- **故障检测**: 自动检测故障节点
- **自动切换**: 故障时自动切换到备用节点

### 📈 数据分析

#### 1. **使用统计**
- **节点使用率**: 统计各节点的使用频率
- **协议分布**: 分析不同协议的使用情况
- **地区分布**: 统计不同地区节点的使用
- **性能趋势**: 分析节点性能的变化趋势

#### 2. **质量评估**
- **延迟分析**: 分析节点的延迟表现
- **稳定性评估**: 评估节点的稳定性
- **可用性统计**: 统计节点的可用性
- **质量评分**: 为节点提供质量评分

### 🔐 安全功能

#### 1. **访问控制**
- **IP 白名单**: 限制特定 IP 访问
- **访问频率限制**: 防止恶意访问
- **会话管理**: 安全的会话控制
- **操作日志**: 记录所有操作日志

#### 2. **数据保护**
- **数据加密**: 敏感数据加密存储
- **备份恢复**: 自动备份和恢复功能
- **数据隔离**: 用户数据完全隔离
- **隐私保护**: 保护用户隐私信息

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

## 🎯 使用场景

### 1. **个人用户**
- **学习研究**: 用于网络技术学习和研究
- **个人代理**: 搭建个人专属代理服务
- **节点管理**: 管理多个订阅源和节点
- **性能优化**: 优化网络连接性能

### 2. **小型团队**
- **团队协作**: 团队成员共享优质节点
- **权限管理**: 不同成员拥有不同权限
- **资源分享**: 安全地分享订阅资源
- **使用统计**: 监控团队使用情况

### 3. **企业用户**
- **企业代理**: 为企业提供代理服务
- **多用户管理**: 管理大量用户账户
- **数据分析**: 详细的使用数据分析
- **安全控制**: 严格的安全访问控制

### 4. **服务提供商**
- **商业化服务**: 提供订阅管理服务
- **多租户支持**: 支持多个客户使用
- **API 服务**: 提供 API 接口服务
- **定制开发**: 根据需求定制功能

## 💼 商业价值

### 1. **技术优势**
- **NAT64 技术**: 解决 IPv6 环境下的 IPv4 访问问题
- **边缘计算**: 利用 Cloudflare 全球边缘节点
- **高性能**: 基于 Workers 的高性能架构
- **可扩展**: 支持大规模用户和节点管理

### 2. **功能优势**
- **聚合管理**: 统一管理多个订阅源
- **智能优化**: 自动优化节点性能
- **多格式支持**: 支持多种客户端格式
- **分享功能**: 灵活的分享和权限管理

### 3. **成本优势**
- **零服务器成本**: 基于 Cloudflare 免费服务
- **低维护成本**: 自动化运维和管理
- **高可用性**: 99.9% 以上的可用性
- **全球加速**: 利用 Cloudflare CDN 加速

### 4. **市场前景**
- **需求增长**: 代理服务需求持续增长
- **技术趋势**: NAT64 技术成为主流
- **用户群体**: 个人、团队、企业多层级用户
- **商业模式**: SaaS 服务模式潜力巨大

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
├── WebSocket 处理 (handleWebSocket)
├── 节点聚合管理 (fetchAllSourcesAndRefresh)
├── 标签分组系统 (tagManagement)
├── 分享管理 (shareManagement)
└── 数据分析 (analyticsEngine)
```

### 🏗️ 聚合管理平台架构

#### 1. **前端架构**
```javascript
// 现代化 Web UI 架构
├── 用户界面层 (Bootstrap 5 + 响应式设计)
├── 业务逻辑层 (JavaScript ES6+)
├── 数据交互层 (Fetch API + WebSocket)
└── 状态管理层 (本地存储 + 会话管理)
```

#### 2. **后端架构**
```javascript
// Cloudflare Workers 边缘计算架构
├── API 网关层 (路由分发 + 中间件)
├── 业务服务层 (用户管理 + 节点管理)
├── 数据访问层 (D1 数据库 + KV 存储)
└── 代理服务层 (VLESS/VMess 协议处理)
```

#### 3. **数据架构**
```sql
-- 核心数据表结构
├── users (用户管理)
├── subscription_sources (订阅源管理)
├── node_pool (节点池管理)
├── tags (标签管理)
├── node_tag_map (节点标签映射)
├── subscriptions (订阅管理)
├── share_links (分享链接管理)
├── access_logs (访问日志)
└── analytics_data (分析数据)
```

### 🔌 API 接口设计

#### 1. **认证相关 API**
```bash
POST /api/register          # 用户注册
POST /api/login            # 用户登录
POST /api/logout           # 用户登出
GET  /api/user/profile     # 获取用户信息
PUT  /api/user/profile     # 更新用户信息
```

#### 2. **订阅源管理 API**
```bash
GET    /api/sources                    # 获取订阅源列表
POST   /api/sources                    # 创建新订阅源
PUT    /api/sources/:id                # 更新订阅源
DELETE /api/sources/:id                # 删除订阅源
POST   /api/sources/refresh            # 刷新所有订阅源
POST   /api/sources/:id/refresh        # 刷新指定订阅源
GET    /api/sources/:id/status         # 获取订阅源状态
```

#### 3. **节点管理 API**
```bash
GET    /api/nodes                      # 获取节点列表
POST   /api/nodes/import               # 导入节点
DELETE /api/nodes/batch                # 批量删除节点
PUT    /api/nodes/:id                  # 更新节点信息
POST   /api/nodes/test                 # 测试节点连接
GET    /api/nodes/statistics           # 获取节点统计
```

#### 4. **标签管理 API**
```bash
GET    /api/tags                       # 获取标签列表
POST   /api/tags                       # 创建新标签
PUT    /api/tags/:id                   # 更新标签
DELETE /api/tags/:id                   # 删除标签
POST   /api/tags/:id/add-nodes         # 为标签添加节点
POST   /api/tags/:id/remove-nodes      # 从标签移除节点
GET    /api/tags/:id/nodes             # 获取标签下的节点
```

#### 5. **分享管理 API**
```bash
GET    /api/shares                     # 获取分享列表
POST   /api/shares                     # 创建分享链接
PUT    /api/shares/:id                 # 更新分享设置
DELETE /api/shares/:id                 # 删除分享链接
GET    /api/shares/:id/statistics      # 获取分享统计
POST   /api/shares/:id/access          # 记录访问日志
```

#### 6. **订阅服务 API**
```bash
GET /sub/:uuid                         # 获取订阅内容 (Base64)
GET /sub/:uuid?type=clash              # 获取 Clash 配置
GET /sub/:uuid?type=singbox            # 获取 Sing-box 配置
GET /sub/tag/:tag_uuid                 # 获取标签订阅
GET /sub/share/:share_id               # 获取分享订阅
```

#### 7. **数据分析 API**
```bash
GET /api/analytics/usage               # 获取使用统计
GET /api/analytics/performance         # 获取性能分析
GET /api/analytics/geographic          # 获取地理分布
GET /api/analytics/traffic             # 获取流量统计
GET /api/analytics/quality             # 获取质量评估
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

**最后更新**: 2024 年 12 月
