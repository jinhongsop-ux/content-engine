# Content Engine Lite v0.2.0

Content Engine Lite 是一个本地运行的 AI 内容生产工作台，用于管理多站点资料、关键词任务、Project 指令、大纲、文章、QA 注意点、图片配置、发布资料包和 WordPress 草稿发布。

它不是 SaaS，也不是无人值守发文系统。所有生成内容都必须经过人工审核后再发布。

## 核心能力

- 内容任务：关键词表、筛选、搜索、批量选择、生成大纲、生成文章、HTML 美化、WordPress 草稿发布。
- 文章工作台：大纲、正文、HTML 源码、QA 注意点、发布包、图片配置、数据包。
- 站点资料库：品牌/公司设置、作者/团队档案、品类/行业知识、内链库、样式参考、Project 指令。
- 导入中心：上传资料、AI 识别、字段映射、写入记录、站点隔离。
- 使用教程：按 C 端 D1-D8、B 端 D0-D8 展示不同 SOP 和资料准备路径。
- 设置：文章模型、Gemini 辅助模型、WordPress、默认策略入口。
- 本地桌面版：可用 Electron 方式打开为桌面软件，也保留浏览器本地访问方式。

## 快速启动

### Windows 双击启动

解压 release 包后，双击：

```text
start-windows.bat
```

首次运行会检查 Node.js/npm、安装依赖、创建本地 `.env`，然后打开：

```text
http://127.0.0.1:3000
```

停止时关闭启动窗口，或双击：

```text
stop-windows.bat
```

### 手动启动

```powershell
npm install
npm start
```

### 桌面开发启动

```powershell
npm run desktop
```

## 验证与打包

```powershell
npm run smoke
npm run build-release
npm run pack:win
```

输出：

- 源码交付包：`release/Content-Engine-Lite-v0.2.0.zip`
- Windows 桌面包：`dist/Content-Engine-Lite-0.2.0-x64.exe`

## 数据存储

真实工作数据存储在本地：

```text
sites/[siteId]/
```

release 包会排除整个 `sites/` 目录，避免打包真实站点数据、API Key、WordPress 密码和生成内容。

## 重要文档

- `docs/INSTALL.md`：安装和启动。
- `docs/USER-GUIDE-B2C.md`：C 端内容站使用教程。
- `docs/USER-GUIDE-B2B.md`：B 端外贸/制造站使用教程。
- `docs/DATA-FILES.md`：标准导入文件格式。
- `docs/DESKTOP-PACKAGING.md`：桌面版封装说明。
- `docs/TROUBLESHOOTING.md`：常见问题排查。
- `SECURITY-CHECK.md`：敏感信息和 release 排除规则。

## 交付边界

本软件不承诺 SEO 排名、流量、询盘或成交。模型费用、API Key、WordPress 费用和本地运行环境由使用方自行负责。未经单独授权，不允许转售、公开发布、二次分发或上传到公开仓库。
