# 🚀 Cloudflare Pages 部署完整指南

## 📋 新的部署策略：职责分离

我们采用了**"职责分离"**的策略，让整个部署流程更加稳定和专业：

- **开发者/用户（手动）**：负责在 Cloudflare 上一次性创建好 D1 数据库和 KV 命名空间，并手动将它们绑定到 Pages 项目上。这个操作只需要做一次。
- **GitHub Action（自动）**：负责在每次代码提交后，只将必要的 `_worker.js`, `index.html`, `data.js` 三个文件部署更新到已经配置好的 Pages 项目中。

### 🎯 这样做的好处

1. **流程极其稳定**：不会再有因为 Wrangler 版本更新或配置冲突导致的资源创建失败
2. **部署产物干净**：生产环境只包含它需要的文件
3. **职责清晰**：Action 只做它最擅长的事——代码部署

## 🚀 完整部署流程

### 步骤 1：手动创建基础设施（一次性操作）

#### 1.1 创建 D1 数据库

1. **登录 Cloudflare Dashboard**
   - 访问：https://dash.cloudflare.com/
   - 进入 **Workers 和 Pages** → **D1**

2. **创建数据库**
   - 点击 **创建数据库**
   - 数据库名称：`subscription-db`
   - 点击 **创建**

3. **初始化数据库**
   - 进入新创建的数据库
   - 点击 **控制台** 标签
   - 复制 `d1_init.sql` 文件的内容并执行

#### 1.2 创建 KV 命名空间

1. **进入 KV 存储**
   - 在 Cloudflare Dashboard 中进入 **Workers 和 Pages** → **KV**

2. **创建命名空间**
   - 点击 **创建命名空间**
   - 命名空间名称：`subscription`
   - 点击 **添加**

#### 1.3 创建 Pages 项目

1. **进入 Pages**
   - 在 Cloudflare Dashboard 中进入 **Workers 和 Pages** → **Pages**

2. **创建新项目**
   - 点击 **创建应用程序**
   - 选择 **连接到 Git**
   - 选择您 fork 的 `cfvless-admin` 仓库

3. **配置构建设置**
   ```
   项目名称: cfvless-admin
   生产分支: main
   框架预设: None
   构建命令: (留空)
   构建输出目录: public
   根目录: (留空)
   ```

4. **保存并部署**
   - 点击 **保存并部署**
   - 等待首次部署完成

### 步骤 2：绑定资源（一次性操作）

1. **进入 Pages 项目设置**
   - 在 Pages 列表中点击 `cfvless-admin` 项目
   - 点击 **设置** → **函数**

2. **绑定 D1 数据库**
   - 在 **D1 数据库绑定** 部分点击 **添加绑定**
   - 变量名：`DB`
   - D1 数据库：选择 `subscription-db`
   - 点击 **保存**

3. **绑定 KV 命名空间**
   - 在 **KV 命名空间绑定** 部分点击 **添加绑定**
   - 变量名：`subscription`
   - KV 命名空间：选择 `subscription`
   - 点击 **保存**

4. **等待重新部署**
   - 保存后 Pages 会自动重新部署
   - 等待部署完成

### 步骤 3：启用自动部署

现在您可以享受自动部署的便利：

```bash
# 每次代码更改后，只需推送即可自动部署
git add .
git commit -m "更新功能"
git push origin main
```

GitHub Actions 会自动：
1. 准备部署产物（只包含必要文件）
2. 部署到 Cloudflare Pages
3. 显示部署结果和访问链接

## 📋 已完成的配置修复

### 1. 修复了 wrangler.toml 配置

**之前的问题**：
- 使用了 Workers 的配置格式
- 缺少 `pages_build_output_dir` 字段

**现在的配置**：
```toml
name = "cfvless-admin"
compatibility_date = "2024-01-01"

[pages_build]
pages_build_output_dir = "./"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "subscription-db"

[[kv_namespaces]]
binding = "subscription"
```

### 2. 优化了 GitHub Actions 工作流

**新增功能**：
- ✅ 自动创建不存在的 Pages 项目
- ✅ 智能重试机制
- ✅ 详细的错误处理和日志
- ✅ 环境验证

## ⚠️ 部署后必须完成的配置

无论使用哪种方案，部署成功后都需要在 Cloudflare Dashboard 中手动绑定资源：

### 1. 绑定 D1 数据库

1. **进入 Pages 项目设置**
   - Cloudflare Dashboard → Workers 和 Pages → Pages → cfvless-admin
   - 点击 **设置** → **函数**

2. **添加 D1 绑定**
   - 在 **D1 数据库绑定** 部分点击 **添加绑定**
   - 变量名：`DB`
   - D1 数据库：选择 `subscription-db`

### 2. 绑定 KV 命名空间

1. **添加 KV 绑定**
   - 在 **KV 命名空间绑定** 部分点击 **添加绑定**
   - 变量名：`subscription`
   - KV 命名空间：选择对应的命名空间

### 3. 保存并重新部署

- 点击 **保存**
- Pages 会自动触发重新部署
- 等待部署完成

## 🔍 验证部署成功

1. **访问应用**
   - URL: https://cfvless-admin.pages.dev
   - 检查页面是否正常加载

2. **检查功能**
   - 尝试注册/登录功能
   - 检查数据库连接是否正常

3. **查看日志**
   - Cloudflare Dashboard → Pages → cfvless-admin → 函数
   - 查看实时日志确认无错误

## 🎯 推荐流程

**对于新用户，推荐使用方案一**：
1. 手动在 Dashboard 创建项目（5分钟）
2. 推送代码触发自动部署
3. 手动绑定 D1 和 KV 资源
4. 验证功能正常

这样可以确保最高的成功率和最少的问题。

## 📞 如果仍有问题

如果按照以上步骤仍然遇到问题，请提供：

1. **完整的 GitHub Actions 日志**
2. **Cloudflare Dashboard 中的错误信息**
3. **具体的错误步骤**

我会进一步协助您解决问题。