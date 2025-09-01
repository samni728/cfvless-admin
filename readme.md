# 🌐 订阅聚合管理平台 - 小白部署指南

这是一个基于 **Cloudflare Workers + D1 数据库 + KV 存储** 的订阅聚合管理平台，提供用户注册/登录、订阅源管理、Tag-based 节点管理、节点池管理和订阅输出功能。

## ✨ 核心特性

- 🔐 **用户系统**：完整的注册/登录/会话管理
- 📡 **订阅管理**：支持多种订阅源的导入和刷新
- 🏷️ **Tag 系统**：灵活的节点分类和管理
- 🎯 **节点生成器**：智能节点生成和扩展
- 📊 **数据统计**：实时的使用情况分析
- 🌐 **多格式支持**：Base64、Clash、Sing-box 等格式
- 📱 **响应式设计**：完美适配桌面和移动设备

## 🚀 部署指南（推荐）

### 📋 准备工作

在开始之前，您需要：

- ✅ 一个 Cloudflare 账户（免费即可）
- ✅ 下载本项目代码到本地

### 步骤 1：创建 Cloudflare Pages 项目

#### 1.1 登录 Cloudflare Dashboard

1. **访问 Cloudflare**：

   - 打开浏览器，访问：https://dash.cloudflare.com
   - 使用您的账户登录

2. **进入 Pages 服务**：
   - 在左侧菜单中找到 **Workers 和 Pages**
   - 点击进入 **Pages** 页面

#### 1.2 创建新项目

1. **开始创建**：

   - 点击 **创建应用程序** 按钮
   - 选择 **上传资产** 选项

2. **项目配置**：

   - **项目名称**：输入 `cfvless-admin`（或您喜欢的名称）
   - 点击 **创建项目**

3. **上传文件**：

   **方法一：直接拖拽文件（推荐）**

   - 将以下 2 个文件直接拖拽到上传区域：
     - `index.html`（主页面）
     - `_worker.js`（后端逻辑）

   **方法二：使用打包文件（更简单）**

- 下载 [v2.0 Release 包](https://github.com/samni728/cfvless-admin/releases/tag/v2.0)
- 直接将 zip 包拖拽到上传区域，Cloudflare Pages 会自动解压
- 无需手动解压文件

  - 点击 **部署站点**

4. **等待部署**：
   - 系统会自动部署您的文件
   - 完成后会显示访问地址，如：`https://cfvless-admin.pages.dev`

### 步骤 2：创建 D1 数据库

#### 2.1 进入 D1 服务

1. **返回主菜单**：

   - 在 Cloudflare Dashboard 左侧菜单
   - 点击 **Workers 和 Pages** → **D1**

2. **创建数据库**：
   - 点击 **创建数据库** 按钮
   - **数据库名称**：输入 `subscription-db`
   - 点击 **创建**

#### 2.2 初始化数据库表

1. **进入数据库控制台**：

   - 点击刚创建的 `subscription-db` 数据库
   - 选择 **控制台** 标签

2. **执行初始化 SQL**：

   **注意**：Cloudflare D1 控制台无法一次性执行长脚本，需要分段执行。请按以下步骤操作：

   **第一步：创建表结构**

   - 复制以下代码到 SQL 输入框：

   ```sql
   CREATE TABLE IF NOT EXISTS users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT UNIQUE NOT NULL,
       hashed_password TEXT NOT NULL,
       user_uuid TEXT UNIQUE,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```

   - 点击 **执行** 按钮
   - 重复执行以下每个表的创建语句：

   **第二步：创建订阅源表**

   ```sql
   CREATE TABLE IF NOT EXISTS subscription_sources (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       source_name TEXT NOT NULL,
       source_url TEXT NOT NULL,
       fetch_status TEXT DEFAULT 'pending',
       node_count INTEGER DEFAULT 0,
       last_fetch_at DATETIME,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
   );
   ```

   **第三步：创建节点池表**

   ```sql
   CREATE TABLE IF NOT EXISTS node_pool (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       source_id INTEGER,
       node_url TEXT NOT NULL,
       node_hash TEXT,
       status TEXT DEFAULT 'untested',
       last_test_at DATETIME,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
       FOREIGN KEY (source_id) REFERENCES subscription_sources (id) ON DELETE CASCADE,
       UNIQUE(user_id, node_hash)
   );
   ```

   **第四步：创建订阅表**

   ```sql
   CREATE TABLE IF NOT EXISTS subscriptions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       uuid TEXT UNIQUE NOT NULL,
       node_data_base64 TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
   );
   ```

   **第五步：创建标签表**

   ```sql
   CREATE TABLE IF NOT EXISTS tags (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       tag_name TEXT NOT NULL,
       description TEXT DEFAULT '',
       tag_uuid TEXT UNIQUE NOT NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
       UNIQUE(user_id, tag_name)
   );
   ```

   **第六步：创建节点标签映射表**

   ```sql
   CREATE TABLE IF NOT EXISTS node_tag_map (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       node_id INTEGER NOT NULL,
       tag_id INTEGER NOT NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (node_id) REFERENCES node_pool (id) ON DELETE CASCADE,
       FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
       UNIQUE(node_id, tag_id)
   );
   ```

   **第七步：创建源节点配置表**

   ```sql
   CREATE TABLE IF NOT EXISTS source_node_configs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       config_name TEXT NOT NULL,
       node_type TEXT NOT NULL CHECK (node_type IN ('nat64', 'proxyip')),
       config_data TEXT NOT NULL,
       generated_node TEXT NOT NULL,
       is_default BOOLEAN DEFAULT FALSE,
       enabled BOOLEAN DEFAULT TRUE,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
   );
   ```

   **第八步：创建索引**

   - 执行以下索引创建语句（可以一次性执行多个索引）：

   ```sql
   CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
   CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(user_uuid);
   CREATE INDEX IF NOT EXISTS idx_subscription_sources_user_id ON subscription_sources(user_id);
   CREATE INDEX IF NOT EXISTS idx_subscription_sources_status ON subscription_sources(fetch_status);
   CREATE INDEX IF NOT EXISTS idx_node_pool_user_id ON node_pool(user_id);
   CREATE INDEX IF NOT EXISTS idx_node_pool_source_id ON node_pool(source_id);
   CREATE INDEX IF NOT EXISTS idx_node_pool_status ON node_pool(status);
   CREATE INDEX IF NOT EXISTS idx_node_pool_hash ON node_pool(node_hash);
   CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
   CREATE INDEX IF NOT EXISTS idx_subscriptions_uuid ON subscriptions(uuid);
   CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
   CREATE INDEX IF NOT EXISTS idx_tags_uuid ON tags(tag_uuid);
   CREATE INDEX IF NOT EXISTS idx_node_tag_map_node_id ON node_tag_map(node_id);
   CREATE INDEX IF NOT EXISTS idx_node_tag_map_tag_id ON node_tag_map(tag_id);
   CREATE INDEX IF NOT EXISTS idx_source_node_configs_user_id ON source_node_configs(user_id);
   CREATE INDEX IF NOT EXISTS idx_source_node_configs_type ON source_node_configs(node_type);
   CREATE INDEX IF NOT EXISTS idx_source_node_configs_default ON source_node_configs(is_default);
   ```

3. **验证创建结果**：
   - 执行成功后，可以运行以下命令查看表：
   ```sql
   SELECT name FROM sqlite_master WHERE type='table';
   ```
   - 应该看到 7 个表被创建：
     - `users` - 用户表
     - `subscription_sources` - 订阅源表
     - `node_pool` - 节点池表
     - `subscriptions` - 订阅表
     - `tags` - 标签表
     - `node_tag_map` - 节点标签映射表
     - `source_node_configs` - 源节点配置表

### 步骤 3：创建 KV 命名空间

#### 3.1 进入 KV 服务

1. **访问 KV 页面**：

   - 在 Cloudflare Dashboard 左侧菜单
   - 点击 **Workers 和 Pages** → **KV**

2. **创建命名空间**：
   - 点击 **创建命名空间** 按钮
   - **命名空间名称**：输入 `subscription`
   - 点击 **添加**

### 步骤 4：绑定资源到 Pages 项目

#### 4.1 进入 Pages 项目设置

1. **返回 Pages**：

   - 在 Cloudflare Dashboard 中
   - 进入 **Workers 和 Pages** → **Pages**
   - 点击您的 `cfvless-admin` 项目

2. **进入设置页面**：
   - 点击 **设置** 标签
   - 选择 **函数** 子标签

#### 4.2 绑定 D1 数据库

1. **添加 D1 绑定**：

   - 在 **D1 数据库绑定** 部分
   - 点击 **添加绑定** 按钮

2. **配置绑定**：
   - **变量名**：输入 `DB`（必须大写）
   - **D1 数据库**：选择 `subscription-db`
   - 点击 **保存**

#### 4.3 绑定 KV 命名空间

1. **添加 KV 绑定**：

   - 在 **KV 命名空间绑定** 部分
   - 点击 **添加绑定** 按钮

2. **配置绑定**：
   - **变量名**：输入 `subscription`
   - **KV 命名空间**：选择 `subscription`
   - 点击 **保存**

#### 4.4 完成绑定

1. **保存所有设置**：

   - 确认两个绑定都已添加
   - 点击页面底部的 **保存** 按钮

2. **等待重新部署**：
   - 保存后，必须重新上传一次上面的 pages 的文件，必须重新部署一次，Pages 的刚才的设置才会生效！
   - 等待部署完成（通常 1-2 分钟）

### 步骤 5：验证部署

#### 5.1 访问网站

1. **打开网站**：

   - 访问您的 Pages 地址：`https://你的 pages 域名.pages.dev`
   - 应该能看到登录页面

2. **测试功能**：
   - 尝试注册一个新账户
   - 登录并测试基本功能

#### 5.2 故障排除

如果网站无法正常工作：

1. **检查绑定**：

   - 确认 D1 和 KV 绑定的变量名正确
   - `DB`（D1 数据库）和 `subscription`（KV 命名空间）

2. **查看日志**：

   - 在 Pages 项目中点击 **函数** 标签
   - 查看实时日志了解错误信息

3. **重新部署**：
   - 在 Pages 项目中点击 **部署** 标签
   - 点击最新部署右侧的 **重试** 按钮

## 🎯 数据库配置说明

**注意**：数据库表结构已在上述 SQL 执行步骤中详细说明，无需重复配置。

- `tag_uuid`: 标签 UUID

#### 5. **node_tag_map 表** - 节点标签映射

```sql
CREATE TABLE node_tag_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES node_pool (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    UNIQUE(node_id, tag_id)
);
```

- `id`: 映射唯一 ID
- `node_id`: 节点 ID
- `tag_id`: 标签 ID

#### 6. **subscriptions 表** - 订阅管理

```sql
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    node_data_base64 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

- `id`: 订阅唯一 ID
- `user_id`: 所属用户 ID
- `uuid`: 订阅 UUID
- `node_data_base64`: Base64 编码的节点数据

#### 7. **source_node_configs 表** - 源节点配置

```sql
CREATE TABLE source_node_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    config_name TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (node_type IN ('nat64', 'proxyip')),
    config_data TEXT NOT NULL,
    generated_node TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

- `id`: 配置唯一 ID
- `user_id`: 所属用户 ID
- `config_name`: 配置名称
- `node_type`: 节点类型（nat64 或 proxyip）
- `config_data`: 配置数据（JSON 格式）
- `generated_node`: 生成的节点链接

### 重要索引说明

```sql
-- 用户相关索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_uuid ON users(user_uuid);

-- 订阅源相关索引
CREATE INDEX idx_subscription_sources_user_id ON subscription_sources(user_id);
CREATE INDEX idx_subscription_sources_status ON subscription_sources(fetch_status);

-- 节点池相关索引
CREATE INDEX idx_node_pool_user_id ON node_pool(user_id);
CREATE INDEX idx_node_pool_source_id ON node_pool(source_id);
CREATE INDEX idx_node_pool_status ON node_pool(status);
CREATE INDEX idx_node_pool_hash ON node_pool(node_hash);

-- 标签相关索引
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_tags_uuid ON tags(tag_uuid);

-- 映射相关索引
CREATE INDEX idx_node_tag_map_node_id ON node_tag_map(node_id);
CREATE INDEX idx_node_tag_map_tag_id ON node_tag_map(tag_id);

-- 源节点配置相关索引
CREATE INDEX idx_source_node_configs_user_id ON source_node_configs(user_id);
CREATE INDEX idx_source_node_configs_type ON source_node_configs(node_type);
CREATE INDEX idx_source_node_configs_default ON source_node_configs(is_default);
```

## 🔧 故障排除

### 常见问题及解决方案

#### 1. **网站无法访问**

**症状**：访问 Pages 地址显示错误页面
**解决方案**：

- 检查 Pages 项目是否部署成功
- 确认域名配置正确
- 查看部署日志是否有错误

#### 2. **无法注册/登录**

**症状**：注册或登录按钮无响应
**解决方案**：

- 确认 D1 数据库已创建并初始化
- 检查数据库绑定变量名是否为`DB`
- 验证数据库表结构是否正确

#### 3. **功能异常**

**症状**：某些功能无法使用
**解决方案**：

- 确认 KV 命名空间已创建
- 检查 KV 绑定变量名是否为`subscription`
- 重新部署项目

#### 4. **数据库连接失败**

**症状**：控制台显示数据库错误
**解决方案**：

- 检查 D1 数据库状态
- 确认绑定配置正确
- 验证数据库权限设置

### 调试方法

#### 1. **查看 Pages 日志**

1. 进入 Pages 项目
2. 点击**函数**标签
3. 查看实时日志输出

#### 2. **检查数据库状态**

1. 进入 D1 服务
2. 选择数据库
3. 查看表结构和数据

#### 3. **验证绑定配置**

1. 进入 Pages 项目设置
2. 检查函数绑定
3. 确认变量名和资源匹配

## 📱 使用说明

### 1. **用户注册**

- 访问网站首页
- 点击"注册"按钮
- 输入用户名和密码
- 系统自动创建用户账户

### 2. **用户登录**

- 输入用户名和密码
- 点击"登录"按钮
- 系统创建会话并跳转到管理界面

### 3. **订阅源管理**

- 添加订阅源 URL
- 系统自动解析节点
- 支持手动刷新和更新

### 4. **Tag 管理**

- 创建自定义标签
- 将节点分配到不同标签
- 支持批量操作

### 5. **节点生成器**

- 选择模板节点
- 配置生成参数
- 生成扩展节点

### 6. **订阅输出**

- 支持多种格式
- 实时更新节点列表
- 个性化订阅链接

## 📦 快速下载

### 🚀 最新版本下载

**v2.0 稳定版**：[下载 Release 包](https://github.com/samni728/cfvless-admin/releases/tag/v2.0)

- 📁 包含文件：`index.html` + `_worker.js`
- 🎯 开箱即用，无需额外配置
- 📱 支持直接拖拽 zip 包到 Cloudflare Pages
- ⚡ 自动解压，部署更简单

### 🔧 手动下载

如果您想手动下载单个文件：

- [index.html](https://github.com/samni728/cfvless-admin/blob/main/index.html) - 主页面文件
- [\_worker.js](https://github.com/samni728/cfvless-admin/blob/main/_worker.js) - 后端逻辑文件

## 🔧 高级配置

### 🌐 IP 段自定义配置

项目内置了完整的 IP 段配置，支持自定义修改：

- **位置**：在 `index.html` 文件的第 1481 行附近
- **配置说明**：`// 数据配置 - 内置IP段配置（可自定义修改）`
- **修改方法**：
  - 编辑 `index.html` 文件
  - 找到 `dataByCountry` 对象
  - 修改对应国家的 IP 段配置
  - 支持添加、删除或修改 IP 段
- **格式要求**：IP 段格式为 `x.x.x.x/24`（CIDR 格式）
- **应用场景**：根据实际需求调整节点生成的 IP 范围

### 📝 配置示例

```javascript
"🇺🇸 美国 (US)": {
  ipv4: [
    "8.6.144.0/24",    // 可修改
    "8.6.145.0/24",    // 可修改
    "8.6.146.0/24"     // 可修改
  ]
}
```

## 🌟 项目特色

- **简单部署**：只需 2 个文件，拖拽上传即可
- **自动配置**：用户注册时自动创建默认配置
- **智能管理**：Tag-based 节点分类管理
- **多格式支持**：兼容主流客户端
- **响应式设计**：完美适配各种设备

## 📞 技术支持

如果您在使用过程中遇到问题：

1. **检查部署步骤**：确保按照指南逐步操作
2. **查看错误日志**：在 Pages 函数标签中查看详细错误信息
3. **验证配置**：确认数据库和 KV 绑定正确
4. **重新部署**：绑定资源后需要重新部署

## ⚠️ 重要提醒

- **免费版限制**：Cloudflare 免费版有使用量限制
- **数据备份**：定期备份重要数据
- **安全设置**：使用强密码保护账户
- **合规使用**：遵守当地法律法规

---

**项目地址**: [CFvless-ADMIN](https://github.com/samni728/cfvless-admin)

**最后更新**: 2025 年 1 月

**部署难度**: ⭐⭐ (适合小白用户)
