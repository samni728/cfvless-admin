# 🚀 GitHub Actions 一键部署指南

## 优化后的部署方案

### ✅ 已完成的优化

1. **修复了密钥名称不一致问题**
   - 统一使用 `CLOUDFLARE_ACCOUNT_ID`（之前有拼写错误）
   - 更新了 README 中的所有引用

2. **创建了优化的 GitHub Actions 工作流**
   - 文件：`.github/workflows/deploy-optimized.yml`
   - 自动创建和配置 D1 数据库
   - 自动创建和配置 KV 命名空间
   - 智能的错误处理和日志输出
   - 支持手动触发和自定义参数

3. **禁用了冲突的旧工作流**
   - `deploy.yml` → `deploy.yml.disabled`
   - `deploy-simple.yml` → `deploy-simple.yml.disabled`
   - `deploy-mvp.yml` → `deploy-mvp.yml.disabled`

4. **更新了 README 部署说明**
   - 添加了两种部署方式（自动/手动）
   - 改进了故障排除指南
   - 明确了所需权限

### 🔧 部署配置要求

#### GitHub Secrets 设置
确保在 GitHub 仓库设置中添加以下密钥：

```
CLOUDFLARE_API_TOKEN    # 必须包含以下权限：
                       # - Workers Scripts: Edit
                       # - Workers KV Storage: Edit  
                       # - D1: Edit
                       # - Cloudflare Pages: Edit
                       # - Account Settings: Read

CLOUDFLARE_ACCOUNT_ID   # 从 Cloudflare Dashboard 右侧边栏获取
```

#### 权限验证
您的 API Token 必须具备以下权限：
- ✅ Workers Scripts: Edit（发布 Worker、写入 secrets）
- ✅ Workers KV Storage: Edit（创建命名空间、读写 KV）
- ✅ D1: Edit（创建数据库、跑 migrations）
- ✅ Cloudflare Pages: Edit（发布 Pages）
- ✅ Account Settings: Read（读取账户信息）

### 🚀 部署方式

#### 方式一：自动部署（推荐）
1. 推送代码到 `main` 分支
2. GitHub Actions 自动触发部署
3. 自动创建所需资源并部署

#### 方式二：手动部署
1. 进入 GitHub 仓库的 **Actions** 标签
2. 选择 **Deploy to Cloudflare (Optimized)** 工作流
3. 点击 **Run workflow** 按钮
4. 可自定义参数：
   - 项目名称（默认：cfvless-admin）
   - D1 数据库名（默认：subscription-db）
   - KV 绑定名（默认：subscription）

### 🔍 故障排除

#### 常见问题及解决方案

1. **密钥配置错误**
   ```
   ❌ CLOUDFLARE_API_TOKEN 未设置
   ```
   - 检查 GitHub Secrets 中是否正确设置了密钥
   - 确保密钥名称完全一致（区分大小写）

2. **权限不足**
   ```
   Error: Authentication error
   ```
   - 检查 API Token 是否包含所有必需权限
   - 重新创建 API Token 并确保选择正确的权限

3. **项目名称冲突**
   ```
   Error: Project already exists
   ```
   - 在手动部署时使用不同的项目名称
   - 或在 Cloudflare Dashboard 中删除现有项目

4. **资源创建失败**
   ```
   Error: Failed to create D1 database
   ```
   - 检查 Cloudflare 账户是否有足够的配额
   - 确保 Account ID 正确

### 📋 部署后验证

部署成功后，您可以：

1. **访问应用**
   - URL: `https://[项目名称].pages.dev`
   - 默认: `https://cfvless-admin.pages.dev`

2. **检查资源**
   - Cloudflare Dashboard → Workers 和 Pages → Pages
   - 检查 D1 数据库是否创建
   - 检查 KV 命名空间是否创建

3. **查看日志**
   - GitHub Actions 中查看部署日志
   - Cloudflare Dashboard 中查看 Pages 部署状态

### 🎯 优化特性

新的部署工作流包含以下优化：

- **智能资源检测**：自动检测现有资源，避免重复创建
- **配置文件动态生成**：根据实际资源 ID 生成配置
- **详细日志输出**：便于调试和问题排查
- **错误处理**：优雅处理各种异常情况
- **清理机制**：自动清理临时文件
- **参数化配置**：支持自定义项目参数

### 📞 技术支持

如果遇到问题：

1. 查看 GitHub Actions 的详细日志
2. 检查 Cloudflare Dashboard 中的资源状态
3. 确认所有密钥和权限配置正确
4. 参考本文档的故障排除部分

---

**部署成功后，您的 Cloudflare VLESS/VMess 聚合管理平台就可以正常使用了！** 🎉