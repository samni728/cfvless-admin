# 源节点管理功能测试指南

## 🎯 测试目标
验证用户注册后自动创建默认源节点的功能是否正常工作。

## 📋 测试步骤

### 1. 注册新用户
```bash
curl -X POST https://fq8-cxq933.pages.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser001",
    "password": "testpass123"
  }'
```

**预期结果**：
```json
{
  "success": true,
  "message": "注册成功",
  "user": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "username": "testuser001",
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

### 2. 用户登录
```bash
curl -X POST https://fq8-cxq933.pages.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser001",
    "password": "testpass123"
  }'
```

**预期结果**：
```json
{
  "success": true,
  "message": "登录成功",
  "sessionId": "xxxxxxxxxxxxxxxx",
  "user": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "username": "testuser001",
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

**重要**：保存返回的 `sessionId`，后续请求需要使用。

### 3. 获取源节点列表
```bash
curl -X GET https://fq8-cxq933.pages.dev/api/source-nodes \
  -H "Cookie: session_id=YOUR_SESSION_ID"
```

**预期结果**：
```json
{
  "success": true,
  "nodes": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "userId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "系统默认NAT64源节点",
      "type": "nat64",
      "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "domain": "fq8-cxq933.pages.dev",
      "port": 443,
      "encryption": "none",
      "security": "tls",
      "sni": "fq8-cxq933.pages.dev",
      "fp": "randomized",
      "type_ws": "ws",
      "host": "fq8-cxq933.pages.dev",
      "path": "/?ed=2560",
      "enabled": true,
      "isDefault": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "vlessUrl": "vless://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@fq8-cxq933.pages.dev:443?encryption=none&security=tls&sni=fq8-cxq933.pages.dev&fp=randomized&type=ws&host=fq8-cxq933.pages.dev&path=%2F%3Fed%3D2560#fq8-cxq933.pages.dev"
    }
  ]
}
```

### 4. 创建自定义源节点
```bash
curl -X POST https://fq8-cxq933.pages.dev/api/source-nodes \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=YOUR_SESSION_ID" \
  -d '{
    "name": "自定义测试节点",
    "domain": "example.com",
    "port": 443,
    "type": "nat64"
  }'
```

**预期结果**：
```json
{
  "success": true,
  "message": "源节点创建成功",
  "node": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "userId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "自定义测试节点",
    "type": "nat64",
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "domain": "example.com",
    "port": 443,
    "encryption": "none",
    "security": "tls",
    "sni": "example.com",
    "fp": "randomized",
    "type_ws": "ws",
    "host": "example.com",
    "path": "/?ed=2560",
    "enabled": true,
    "isDefault": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "vlessUrl": "vless://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@example.com:443?encryption=none&security=tls&sni=example.com&fp=randomized&type=ws&host=example.com&path=%2F%3Fed%3D2560#example.com"
  }
}
```

### 5. 再次获取源节点列表（验证自定义节点）
```bash
curl -X GET https://fq8-cxq933.pages.dev/api/source-nodes \
  -H "Cookie: session_id=YOUR_SESSION_ID"
```

**预期结果**：应该看到两个节点（默认节点 + 自定义节点）

## ✅ 成功标准

1. **用户注册成功**：返回success: true
2. **用户登录成功**：返回sessionId
3. **默认源节点自动创建**：注册后立即能看到"系统默认NAT64源节点"
4. **VLESS链接格式正确**：包含所有必要参数
5. **自定义节点创建成功**：能够创建新的源节点
6. **用户隔离**：不同用户只能看到自己的节点

## 🔧 故障排除

### 如果注册失败
- 检查用户名是否已存在
- 确保JSON格式正确

### 如果登录失败
- 检查用户名和密码是否正确
- 确保用户已注册

### 如果获取源节点失败
- 检查session_id是否正确
- 确保用户已登录

### 如果VLESS链接无法使用
- 检查域名是否正确
- 确保Worker部署成功
- 验证WebSocket功能是否正常

## 📝 测试记录

请记录以下信息：
- 测试时间：
- 注册的用户名：
- 生成的UUID：
- 默认源节点的VLESS链接：
- 是否成功创建自定义节点：
- 遇到的问题：

## 🎉 功能验证完成

如果所有测试都通过，说明源节点管理功能已经完全正常工作！
