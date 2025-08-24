# 🔧 源节点管理功能使用指南

## 📋 功能概述

源节点管理是订阅聚合管理平台V2.0的新增功能，支持NAT64和ProxyIP两种类型的源节点生成与管理。

## 🚀 快速开始

### 1. 数据库初始化

首次使用前，需要初始化数据库表结构：

```bash
# 发送POST请求到初始化接口
curl -X POST https://your-worker.workers.dev/api/init-db
```

### 2. 用户注册

新用户注册时会自动创建默认的NAT64和ProxyIP源节点配置。

### 3. 访问源节点管理

登录后，点击"🔧 源节点管理"标签页即可使用。

## 🌟 主要功能

### 默认源节点
- 系统自动为每个用户创建默认的NAT64和ProxyIP源节点
- 可以直接复制使用或导入到生成器进行修改

### NAT64源节点生成器
- **技术特点**：IPv6到IPv4转换技术，适用于IPv6环境
- **配置选项**：
  - 配置名称：自定义配置名称
  - 域名：Worker域名或自定义域名
  - UUID：用户唯一标识符
  - NAT64前缀：支持多种优质前缀选择
  - 自动回退：连接失败时的自动重试机制

### ProxyIP源节点生成器
- **技术特点**：自定义代理IP，适用于优选IP场景
- **配置选项**：
  - 配置名称：自定义配置名称
  - 域名：Worker域名或自定义域名
  - UUID：用户唯一标识符
  - 代理IP地址：可选的优选IP地址
  - 代理端口：代理服务端口

### 配置管理
- 保存自定义配置
- 查看配置历史
- 删除不需要的配置
- 导入配置到生成器

## 🔧 API接口

### 源节点配置管理

#### 获取源节点配置列表
```http
GET /api/source-nodes
```

#### 创建源节点配置
```http
POST /api/source-nodes
Content-Type: application/json

{
  "config_name": "我的NAT64配置",
  "node_type": "nat64",
  "config_data": {
    "uuid": "user-uuid",
    "domain": "your-worker.workers.dev",
    "nat64Prefix": "2602:fc59:b0:64::",
    "autoFallback": true
  }
}
```

#### 生成源节点（预览）
```http
POST /api/generate-source-node
Content-Type: application/json

{
  "node_type": "nat64",
  "config_data": {
    "uuid": "user-uuid",
    "domain": "your-worker.workers.dev",
    "nat64Prefix": "2602:fc59:b0:64::",
    "autoFallback": true
  }
}
```

#### 更新源节点配置
```http
PUT /api/source-nodes/{id}
Content-Type: application/json

{
  "config_name": "更新的配置名称",
  "config_data": { ... },
  "enabled": true
}
```

#### 删除源节点配置
```http
DELETE /api/source-nodes/{id}
```

## 🛠️ 技术实现

### NAT64技术原理
- 使用IPv6到IPv4的地址转换
- 支持多个优质NAT64前缀
- 自动DNS解析和地址转换
- 连接失败时的智能重试机制

### ProxyIP技术原理
- 支持自定义代理IP和端口
- 灵活的配置选项
- 适用于优选IP场景

### 数据库结构
```sql
CREATE TABLE source_node_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    config_name TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (node_type IN ('nat64', 'proxyip')),
    config_data TEXT NOT NULL,  -- JSON格式
    generated_node TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

## 🔒 安全特性

- 用户UUID绑定验证
- 配置所有权验证
- 默认配置保护（不可删除）
- 会话认证保护

## 📝 使用示例

### 生成NAT64源节点
1. 填写配置名称："我的NAT64节点"
2. 输入域名："my-worker.workers.dev"
3. 点击"生成"按钮生成UUID
4. 选择NAT64前缀（推荐使用默认）
5. 点击"🚀 生成NAT64节点"
6. 复制生成的节点链接或保存配置

### 生成ProxyIP源节点
1. 填写配置名称："我的ProxyIP节点"
2. 输入域名："my-worker.workers.dev"
3. 点击"生成"按钮生成UUID
4. 输入优选IP地址（可选）
5. 设置代理端口（默认443）
6. 点击"🚀 生成ProxyIP节点"
7. 复制生成的节点链接或保存配置

## 🎯 最佳实践

1. **域名配置**：使用自己的Worker域名或绑定的自定义域名
2. **UUID管理**：每个用户使用唯一的UUID，不要共享
3. **配置命名**：使用有意义的配置名称便于管理
4. **定期备份**：重要配置建议导出备份
5. **测试验证**：生成节点后建议先测试连接性

## 🔄 更新日志

### V2.0 (当前版本)
- ✅ 新增源节点管理功能
- ✅ 支持NAT64和ProxyIP两种类型
- ✅ 自动创建默认源节点
- ✅ 完整的WebUI界面
- ✅ 配置导入导出功能

## 🤝 技术支持

如有问题或建议，请通过以下方式联系：
- 查看开发摘要文档了解更多技术细节
- 检查数据库连接和表结构
- 确认用户权限和会话状态