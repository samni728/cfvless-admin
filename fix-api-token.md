# 🔧 修复 API Token 权限问题

## 🎯 问题原因
当前 API Token 缺少 Cloudflare Pages 部署权限

## 🚀 解决步骤

### 1. 创建新的 API Token

1. **访问 Cloudflare Dashboard**：
   - 前往：https://dash.cloudflare.com/profile/api-tokens

2. **创建自定义 Token**：
   - 点击 **Create Token**
   - 选择 **Custom token**

3. **设置权限**（重要！）：
   ```
   Account 权限：
   ✅ Account:Read
   ✅ Cloudflare Pages:Edit
   ✅ Workers Scripts:Edit
   ✅ Workers KV Storage:Edit
   ✅ D1:Edit
   
   User 权限：
   ✅ User:Read (这个很重要！)
   
   Zone 权限：
   ✅ Zone:Read (如果有域名)
   
   Account Resources：
   ✅ Include - All accounts
   
   Zone Resources：
   ✅ Include - All zones (如果有域名)
   ```

4. **创建并复制 Token**

### 2. 更新环境变量

```bash
# 使用新的 API Token
export CLOUDFLARE_ACCOUNT_ID=70b781084676b01e57807b5249dc6007
export CLOUDFLARE_API_TOKEN=新的完整权限Token

# 验证权限
wrangler whoami
```

### 3. 重新测试部署

```bash
# 测试权限
wrangler pages project list

# 重新部署
./deploy-menu.sh
# 选择选项 2 或 3
```

## 🎯 权限检查清单

创建 Token 时确保包含以下权限：

- [x] **Account:Read** - 读取账户信息
- [x] **User:Read** - 读取用户详情（必需！）
- [x] **Cloudflare Pages:Edit** - 部署 Pages
- [x] **Workers Scripts:Edit** - 管理 Workers
- [x] **Workers KV Storage:Edit** - 管理 KV
- [x] **D1:Edit** - 管理 D1 数据库

## 🔍 验证 Token 权限

```bash
# 检查用户信息
wrangler whoami

# 检查 Pages 权限
wrangler pages project list

# 检查 D1 权限
wrangler d1 list

# 检查 KV 权限
wrangler kv namespace list
```

如果所有命令都能正常执行，说明权限配置正确。