# 📋 订阅聚合管理平台 - 完整开发文档

## 🎯 项目概述

这是一个基于Cloudflare Workers + D1数据库 + KV存储的订阅聚合管理平台，提供用户注册/登录、订阅源管理、Tag-based节点管理、节点池管理和订阅输出功能。

---

# 📡 订阅聚合管理平台 V2.0

## 🌟 项目简介

一个基于 **Cloudflare Workers + D1数据库 + KV存储** 的现代化订阅聚合管理平台，提供完整的用户管理、订阅源管理、节点生成、Tag分类和订阅输出功能。

### ✨ 核心特性

- 🔐 **用户系统**：完整的注册/登录/会话管理
- 📡 **订阅管理**：支持多种订阅源的导入和刷新
- 🏷️ **Tag系统**：灵活的节点分类和管理
- 🎯 **节点生成器**：智能节点生成和扩展
- 📊 **数据统计**：实时的使用情况分析
- 🌐 **多格式支持**：Base64、Clash、Sing-box等格式
- 📱 **响应式设计**：完美适配桌面和移动设备

## 🚀 快速开始

### 环境要求

- Cloudflare账号
- Wrangler CLI工具
- Node.js 16+

### 部署步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd subscription-manager
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境**
```bash
cp wrangler.toml.example wrangler.toml
# 编辑 wrangler.toml 配置你的信息
```

4. **创建数据库**
```bash
wrangler d1 create subscription-manager-db
# 将返回的database_id填入wrangler.toml
```

5. **初始化数据库**
```bash
wrangler d1 execute subscription-manager-db --file=./schema.sql
```

6. **部署到Cloudflare**
```bash
wrangler deploy
```

## 🏗️ 技术架构

### 核心技术栈

- **前端**: HTML5 + Bootstrap 5 + Vanilla JavaScript
- **后端**: Cloudflare Workers (JavaScript)
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare KV
- **部署**: Cloudflare Pages/Workers

### 数据库设计

```sql
-- 用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    user_uuid TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 会话表
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 订阅源表
CREATE TABLE subscription_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    last_updated DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 节点池表
CREATE TABLE node_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    source_id INTEGER,
    node_url TEXT NOT NULL,
    node_hash TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (source_id) REFERENCES subscription_sources (id)
);

-- Tag表
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tag_name TEXT NOT NULL,
    tag_uuid TEXT UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 节点Tag映射表
CREATE TABLE node_tag_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER,
    node_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tag_id) REFERENCES tags (id),
    FOREIGN KEY (node_id) REFERENCES node_pool (id)
);

-- 源节点配置表
CREATE TABLE source_node_configs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    config_name TEXT NOT NULL,
    node_type TEXT NOT NULL, -- 'nat64' 或 'proxyip'
    config_data TEXT NOT NULL, -- JSON格式配置
    generated_node TEXT NOT NULL, -- 生成的源节点链接
    is_default BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

---

# 📋 NAT64 VLESS代理项目技术分析笔记

## 🎯 NAT64项目概述

这是一个基于Cloudflare Workers的NAT64 VLESS代理项目，专门设计用于在IPv6环境下通过NAT64技术访问IPv4资源，并提供多种客户端订阅格式。

## 🔧 核心技术架构

### 1. NAT64技术实现

**核心原理：**
- NAT64是一种IPv6到IPv4的转换技术
- 当直连IPv4失败时，自动通过NAT64 IPv6地址重试连接
- 使用固定的NAT64前缀：`2602:fc59:b0:64::`

**关键代码逻辑：**
```javascript
// NAT64 IPv6地址转换函数 (第249-265行)
function convertToNAT64IPv6(ipv4Address) {
    const parts = ipv4Address.split('.');
    const hex = parts.map(part => {
        const num = parseInt(part, 10);
        return num.toString(16).padStart(2, '0');
    });
    const prefixes = ['2602:fc59:b0:64::'];
    const chosenPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return `[${chosenPrefix}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}]`;
}
```

**DNS解析与NAT64转换流程：**
```javascript
// 获取IPv6代理地址 (第267-287行)
async function getIPv6ProxyAddress(domain) {
    // 1. 通过Cloudflare DoH查询A记录
    const dnsQuery = await fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`);
    // 2. 提取IPv4地址
    const ipv4Address = aRecord.data;
    // 3. 转换为NAT64 IPv6地址
    return convertToNAT64IPv6(ipv4Address);
}
```

### 2. VLESS协议处理

**协议解析：**
```javascript
// VLESS头部解析 (第369-435行)
function parseVlessHeader(buffer, userID) {
    // 验证版本号、UUID、选项长度
    // 解析命令类型（TCP=1, UDP=2）
    // 解析目标地址（IPv4/域名/IPv6）和端口
    // 返回解析结果
}
```

**连接重试机制：**
```javascript
// 连接失败时的NAT64重试 (第289-315行)
async function retry() {
    const proxyIP = await getIPv6ProxyAddress(result.addressRemote);
    console.log(`尝试通过NAT64 IPv6地址 ${proxyIP} 连接...`);
    const tcpSocket = await connect({
        hostname: proxyIP,
        port: result.portRemote
    });
}
```

## 🚀 项目功能扩展开发方案 (基于Cloudflare Workers/Pages)

### 📋 产品愿景

在现有订阅聚合管理平台的基础上，集成NAT64和ProxyIP源节点生成功能，通过WebUI配置生成这两种类型的源节点，然后利用现有的节点生成器扩展出更多节点，形成完整的节点生成和管理闭环。

### 🚀 开发里程碑 - 详细任务分解

#### 📋 项目1: 数据库架构扩展 (预计1-2天)

**任务清单：**
- [ ] **1.1** 扩展users表，添加user_uuid字段
- [ ] **1.2** 创建source_node_configs表
- [ ] **1.3** 创建相关索引
- [ ] **1.4** 测试数据库迁移脚本

#### 📋 项目2: 用户注册逻辑扩展 (预计2-3天)

**任务清单：**
- [ ] **2.1** 修改用户注册API，自动分配UUID
- [ ] **2.2** 实现默认NAT64源节点创建函数
- [ ] **2.3** 实现默认ProxyIP源节点创建函数
- [ ] **2.4** 集成到现有注册流程
- [ ] **2.5** 处理现有用户的UUID分配（数据迁移）
- [ ] **2.6** 测试注册流程和默认节点创建

### 📊 总体时间估算

**总计：13-18天 (约2-3周)**

### 🎯 核心价值和创新点

#### 1. **完美的功能闭环**
```
源节点配置 → 源节点生成 → 节点扩展 → Tag管理 → 订阅输出
     ↑                                              ↓
   WebUI配置 ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← 完整的管理流程
```

#### 2. **技术创新点**
- **首个集成NAT64和ProxyIP的订阅管理平台**
- **源节点 + 节点生成器的双重扩展能力**
- **基于现有架构的无缝集成**
- **适配Cloudflare Workers/Pages的轻量化设计**

---

🚀 **立即体验**: [https://your-domain.pages.dev](https://your-domain.pages.dev)
