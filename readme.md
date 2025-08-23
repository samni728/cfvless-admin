# Cloudflare VLESS/VMess 代理部署与批量生成工具

这是一个强大且易于使用的 Cloudflare 工具集，旨在帮助用户快速部署高性能的 VLESS/VMess 代理节点，并提供一个灵活的在线工具来批量生成自定义节点。

本项目主要包含两个核心部分：

1.  **`worker-page` 代理部署**: 一个可以直接部署到 Cloudflare Pages 的 VLESS/VMess 代理脚本。部署后，您可以获得一个稳定的代理服务和对应的订阅链接。
2.  **`节点生成` 工具**: 一个纯前端的、数据驱动的在线节点生成器。您可以用它来批量生成具有不同出口 IP 和域名的节点，极大地增强了连接的灵活性和可用性。

## ✨ 项目特色

*   **一键部署**: 只需将 `worker-page` 文件夹上传至 Cloudflare Pages，即可拥有自己的代理服务。
*   **高度灵活**: `节点生成` 工具允许您使用内置的优选 IP/域名，或完全自定义自己的地址池。
*   **地区筛选**: 内置的数据源按地理位置（美国、欧洲、亚洲等）分类，方便您生成指定出口地区的节点。
*   **支持两大协议**: 完美兼容 VLESS 和 VMess 两种主流协议的链接模板。
*   **纯静态，无服务器依赖**: `节点生成` 工具完全在您的浏览器中运行，无需任何后端服务器，安全可靠。
*   **界面友好**: 使用 Bootstrap 5 构建，界面美观，交互体验良好，对新手非常友好。

## 📁 项目文件结构说明

```
.
├── 节点生成/
│   ├── public/
│   │   ├── data.js       # 内置的 IP 和域名数据源
│   │   └── index.html      # 节点生成器的主页面
│   └── (其他旧文件...)     # ips-v4.txt 等为旧版示例，当前版本不直接使用 里面也有很多 ipv4 ipv6 的 cloudflare 网段可以参考
│
├── worker-page/
│   └── _worker.js        # 部署到 Cloudflare Pages 的核心代理脚本
│
├── cf-vless/
│   └── _worker.js        # 基础 VLESS 代理 Worker 脚本
│
├── cf-vlessadmin/        # 📡 订阅聚合管理平台 V2.0
│   ├── _worker.js        # 主要业务逻辑 (1200+ 行)
│   ├── _workernat64.js   # NAT64 专用版本 (2200+ 行)
│   ├── index.html        # 完整 Web 管理界面 (2500+ 行)
│   ├── data.js           # 地区 IP 段数据配置
│   ├── vlessnoproxyip.js # 无 ProxyIP 版本
│   ├── wrangler.toml.example  # 部署配置示例
│   ├── 开发摘要.md       # 技术分析和开发笔记
│   ├── 订阅聚合管理平台-业务规划.md  # 商业化规划方案
│   └── README.md         # 详细项目文档
│
└── CF-ipranges/          # Cloudflare IP 段数据
    ├── ips-v4.txt        # IPv4 地址段
    ├── ips-v6.txt        # IPv6 地址段
    └── cf 网段.numbers   # IP 段统计表格
```

### 🆕 cf-vlessadmin - 企业级订阅聚合管理平台

**cf-vlessadmin** 是本项目的旗舰产品，一个功能完整的现代化订阅聚合管理平台：

#### 🎯 核心特性
- **🔐 用户认证系统**: 完整的注册/登录/会话管理 (SHA-256 + Cookie + KV)
- **📡 订阅源管理**: 多源导入、自动刷新、智能去重、状态监控
- **🏷️ 标签分组系统**: 灵活的节点分组、批量操作、独立订阅生成
- **🌐 节点池管理**: 智能去重算法、协议解析、质量检测
- **📊 多格式输出**: Base64、Clash YAML、Surge 等格式支持

#### 🏗️ 技术架构
```javascript
// 技术栈
前端: 现代化 Web UI (HTML5 + CSS3 + JavaScript)
后端: Cloudflare Workers (Edge Computing)
数据库: Cloudflare D1 (分布式 SQLite) + KV 存储
部署: Cloudflare Pages (全球 CDN 分发)

// 核心模块
├── 用户认证 (getUserBySession 中间件)
├── 订阅源管理 (fetchAllSourcesAndRefresh)
├── 节点池管理 (generateSimpleHash 去重)
├── 标签分组 (批量操作 API)
└── 订阅分发 (多格式输出)
```

#### 📊 数据库设计
```sql
users                 # 用户表 (认证信息)
subscription_sources   # 订阅源表 (多源管理)
node_pool             # 节点池表 (去重存储)
tags                  # 标签表 (分组管理)
node_tag_map          # 节点标签映射表
subscriptions         # 订阅表 (Base64 数据)
```

#### 🚀 API 接口
```bash
# 认证相关
POST /api/register, /api/login, /api/logout

# 订阅源管理 (需认证)
GET|POST|PUT|DELETE /api/sources
POST /api/sources/refresh

# 节点管理 (需认证)
GET /api/nodes, POST /api/nodes/import

# 标签管理 (需认证)
GET|POST /api/tags
POST /api/tags/{add-nodes,remove-nodes,batch-operations}

# 订阅服务 (公开)
GET /sub/:uuid                # Base64 订阅
GET /sub/:uuid?type=clash     # Clash 配置
GET /sub/tag/:tag_uuid        # 标签订阅
```

#### 💼 商业化规划
- **基础版**: 订阅源管理、节点分组、基础统计
- **高级版**: 高级过滤、自定义规则、API 访问、流量统计
- **企业版**: 多用户管理、详细分析、技术支持、私有部署

---

## 🚀 第一部分：部署自己的代理节点 (`worker-page`)

这部分将指导您如何将 `_worker.js` 部署到 Cloudflare Pages，从而获得一个基础的代理服务和订阅链接。

### 准备工作
*   您需要一个 Cloudflare 账户。

### 部署步骤

1.  **登录 Cloudflare**:
    打开 [Cloudflare 官网](https://dash.cloudflare.com/) 并登录您的账户。

2.  **修改 `_worker.js` (关键步骤！)**:
    *   在您本地的 `worker-page` 文件夹中，找到 `_worker.js` 文件并用文本编辑器打开它。
    *   找到下面这行代码（通常在文件顶部）：
        ```javascript
        let userID = "86c50e3a-5b87-49dd-bd20-03c7f2735e40";
        ```
    *   将引号中的 `86c50e3a-5b87-49dd-bd20-03c7f2735e40` **替换为您自己的 UUID**。您可以使用在线 UUID 生成工具来创建一个新的。**这一步是为了保护您的服务不被滥用。**
    *   修改完成后，保存文件。

3.  **进入 Pages 并创建项目**:
    *   在 Cloudflare 仪表板左侧菜单中，点击 `Workers & Pages`。
    *   选择 `创建应用程序` -> `Pages` -> `上传资产`。

4.  **上传并部署**:
    *   给您的项目起一个名字，例如 `my-proxy-page`。
    *   将您本地修改好的 **`worker-page` 文件夹** 整个拖拽到上传区域。
    *   点击 `保存并部署`。

5.  **部署成功**:
    *   等待片刻，Cloudflare 会为您生成一个域名，例如 `my-proxy-page.pages.dev`。
    *   现在，您的代理服务已经在线运行了！

### 如何使用代理

*   访问 `https://<你的Pages域名>/<你的UUID>` （例如: `https://my-proxy-page.pages.dev/86c50e3a-5b87-49dd-bd20-03c7f2735e40`）。
*   您会看到一个配置页面，其中包含了可直接导入的节点链接和各种客户端的订阅链接。

---

## 🛠️ 第二部分：终极 Cloudflare 节点生成器与持久化订阅平台 V2.0

这是一个基于 **Cloudflare Pages, Workers, D1 数据库 和 KV** 构建的、功能完备的 VLESS/VMess 代理节点解决方案。它已经从一个简单的生成工具，进化为一个**支持多用户、持久化订阅**的管理平台。

现在，您可以创建自己的账户，安全地保存和管理您的专属订阅链接。**一次配置，永久有效**，彻底告别频繁更换订阅链接的烦恼。

<!-- 建议您在这里放一张项目界面的截图 -->
<!-- ![项目截图](https://example.com/screenshot.png) -->

---

## ✨ V2.0 核心特性

*   **🔐 用户账户系统**:
    *   支持用户**注册**和**登录**，您的所有数据都与您的个人账户绑定。
    *   采用安全的 **Cookie 会话管理** 和 **密码哈希** 存储，确保账户安全。

*   **💾 持久化订阅**:
    *   每个用户拥有一个**固定的、唯一的订阅 UUID**。
    *   在工具中更新节点后，**无需更换客户端的订阅链接**，只需在客户端更新订阅即可获取最新节点。
    *   所有订阅数据安全地存储在您的个人 **Cloudflare D1 数据库**中。

*   **🔗 多格式订阅转换**:
    *   后端 Worker 引擎可以动态地将您的节点列表转换为多种主流格式。
    *   完美支持 **标准 Base64 (V2Ray)** 和 **Clash (YAML)** 两种订阅格式。

*   **⚡️ 强大的节点生成**:
    *   保留了原有的强大功能，可从内置或自定义的 IP/域名池中，瞬间生成成百上千个新节点。
    *   完美解析和生成 VLESS 和 VMess 两种主流协议。

*   **🔧 终极 Serverless 架构**:
    *   采用 Cloudflare Pages (静态托管) + `_worker.js` (API & 订阅服务) + D1 (核心数据) + KV (会话存储) 的终极架构，性能强大且成本极低。

---

## 📁 项目文件结构 (V2.0)

我们采用了 Cloudflare Pages 高级 Worker 模式，最终部署的文件结构极其精简：

```
.
├── _worker.js      # 核心后端：用户认证、数据库操作、API、订阅生成
├── index.html      # 前端UI界面：包含登录/注册和节点生成逻辑
└── data.js         # 内置的 IP 和域名数据源
```

---

## 🛠️ V2.0 部署与配置指南 (必读)

请严格遵循以下步骤，这是保证 V2.0 版本所有功能正常的关键。

### 准备工作

1.  您需要一个 Cloudflare 账户。
2.  准备好本项目最终的三个核心文件: `_worker.js`, `index.html`, `data.js`。

### 第一步: 创建 D1 数据库 和 KV 命名空间

这是 V2.0 版本的核心，用于存储您的用户和订阅数据。

1.  **创建 D1 数据库**:
    *   登录 Cloudflare 仪表板 -> 左侧菜单 **Workers 和 Pages** -> **D1**。
    *   点击 **创建数据库**。
    *   输入数据库名称，例如 `my-subscription`，选择地区，然后点击"创建"。

2.  **创建数据表 (关键步骤!)**:
    *   进入您刚创建的 `my-subscription` 数据库，切换到 **控制台 (Console)** 选项卡。
    *   **首先，粘贴并执行以下命令创建 `users` 表**:
        ```sql
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          hashed_password TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        ```
    *   **然后，粘贴并执行以下命令创建 `subscriptions` 表**:
        ```sql
        CREATE TABLE IF NOT EXISTS subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE,
          uuid TEXT UNIQUE NOT NULL,
          node_data_base64 TEXT,
          updated_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        ```
    *   执行成功后，请刷新页面，确保您能在左侧看到 `users` 和 `subscriptions` 两张表。

3.  **创建 KV 命名空间**:
    *   在左侧菜单中，点击 **Workers 和 Pages** -> **KV**。
    *   点击 **创建命名空间**。
    *   输入一个命名空间名称，例如 `user_sessions` (用于存储登录会话)，然后点击"添加"。

### 第二步: 部署到 Cloudflare Pages

1.  在左侧菜单中，点击 **Workers 和 Pages** -> **创建应用程序** -> **Pages** -> **上传资产**。
2.  给您的项目起一个名字。
3.  **【最关键操作】**:
    *   **不要**拖拽任何文件夹。
    *   在您的电脑上，**同时选中** `_worker.js`, `index.html`, `data.js` 这**三个文件**。
    *   将这**三个文件本身**直接拖拽到 Cloudflare 的上传区域。
4.  **【第二关键操作】**:
    *   点击 **部署站点**。
    *   部署完成后，进入项目设置 -> **构建和部署 (Build & deployments)**，确保 **构建输出目录 (Build output directory)** 字段是**空的**。

### 第三步: 绑定 D1 和 KV

1.  在您的 Pages 项目页面，点击 **设置 (Settings)** -> **函数 (Functions)**。
2.  **绑定 D1 数据库**:
    *   找到 **D1 数据库绑定 (D1 Database Bindings)**，点击 **添加绑定**。
    *   **变量名称**: 必须输入 `DB` (大写)。
    *   **D1 数据库**: 选择您在第一步中创建的 `my-subscription` 数据库。
3.  **绑定 KV 命名空间**:
    *   找到 **KV 命名空间绑定 (KV Namespace Bindings)**，点击 **添加绑定**。
    *   **变量名称**: 必须输入 `subscription`。
    *   **KV 命名空间**: 选择您在第一步创建的 `user_sessions` 命名空间。
4.  点击 **保存**。Cloudflare 会自动为您触发一次新的部署以使绑定生效。

部署成功后，您的 V2.0 平台就完全可用了！

---

## 📖 使用方法

访问您的 Pages 域名即可开始使用。

1.  **注册/登录**: 首次访问时，您会看到登录提示。请点击按钮，在弹出的模态框中注册一个新账户，然后登录。
2.  **生成节点**: 登录后，您会看到熟悉的节点生成界面。像以前一样生成您需要的节点。
3.  **更新/创建订阅**: 点击 **更新我的专属订阅** 按钮。
    *   如果是第一次操作，系统会为您创建一个**永久的订阅链接**。
    *   如果之前已经创建过，系统会将新生成的节点更新到您已有的订阅链接中。
4.  **使用订阅**: 将下方显示的"标准格式"或"Clash 格式"链接配置到您的客户端中。此后，您**再也无需更换此链接**，只需在客户端更新订阅即可。

---

## 🙏 致谢

*   本项目 `_worker.js` 中的部分代理逻辑来源于 **甬哥** 的无私分享，他是一位优秀的技术博主。
    *   **博客地址**: [https://ygkkk.blogspot.com](https://ygkkk.blogspot.com)
    *   **YouTube 频道**: [https://www.youtube.com/@ygkkk](https://www.youtube.com/@ygkkk)
*   `节点生成` 工具的构思、V2.0 用户系统的架构设计与开发由 **Google Gemini** 根据用户需求完成。

## ⚠️ 免责声明

本项目仅供学习和技术研究使用。请遵守您所在地区的相关法律法规，勿将此项目用于任何非法用途。对于使用本项目所造成的任何后果，项目作者和贡献者概不负责。