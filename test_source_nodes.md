# 源节点管理功能测试指南

## 功能概述
系统已成功集成NAT64功能，用户注册后会自动创建默认源节点。

## 测试步骤

### 1. 数据库初始化
```bash
# 访问数据库初始化接口
curl -X POST https://your-worker.workers.dev/api/init-db
```

### 2. 用户注册测试
```bash
# 注册新用户
curl -X POST https://your-worker.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'
```

### 3. 用户登录测试
```bash
# 登录用户
curl -X POST https://your-worker.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'
```

### 4. 查看源节点配置
```bash
# 获取源节点配置列表（需要登录后的Cookie）
curl -X GET https://your-worker.workers.dev/api/source-nodes \
  -H "Cookie: session_id=YOUR_SESSION_ID"
```

## 预期结果

### 用户注册后应该看到：
1. 系统自动创建默认NAT64源节点
2. 节点名称：`系统默认NAT64源节点`
3. 节点类型：`nat64`
4. 状态：`启用`
5. 自动添加到节点池

### 前端界面应该显示：
1. 默认源节点区域显示系统创建的节点
2. 节点包含完整的VLESS链接
3. 可以复制和导入到生成器

## 技术实现

### 集成的NAT64函数：
- `convertToNAT64IPv6()` - IPv4转IPv6地址
- `getIPv6ProxyAddress()` - 获取IPv6代理地址
- `isIPv4()` - 检查IPv4地址
- `generateSimpleNAT64Node()` - 生成NAT64节点

### 数据库表：
- `source_node_configs` - 源节点配置表
- `node_pool` - 节点池表

### API接口：
- `GET /api/source-nodes` - 获取源节点列表
- `POST /api/source-nodes` - 创建源节点配置
- `PUT /api/source-nodes/:id` - 更新源节点配置
- `DELETE /api/source-nodes/:id` - 删除源节点配置

## 注意事项

1. 每个用户使用独立的UUID，确保安全性
2. 默认源节点在用户注册时自动创建
3. 源节点配置包含完整的VLESS链接格式
4. 支持NAT64和ProxyIP两种类型
5. 前端界面已完整实现，支持复制和导入功能
