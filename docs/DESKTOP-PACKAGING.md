# 桌面版封装说明

Content Engine Lite v0.2.0 支持两种本地交付形态：

1. 源码交付包：`release/Content-Engine-Lite-v0.2.0.zip`
2. Windows 桌面便携包：`dist/Content-Engine-Lite-0.2.0-x64.exe`

## 桌面版工作方式

桌面版使用 Electron 作为外壳：

- Electron 主进程启动本地 Express 服务。
- 服务仍然使用 `main.js`、`engine/`、`ui/`、`templates/`。
- 窗口加载 `http://127.0.0.1:3000`。
- 核心生成逻辑没有被重写。

## 打包命令

```powershell
npm install
npm run smoke
npm run pack:win
```

## 桌面包包含

- `main.js`
- `desktop/`
- `engine/`
- `ui/`
- `templates/`
- `examples/demo-site/`
- `docs/`
- `scripts/`
- `.env.example`
- 项目说明文件和 package 文件

## 桌面包排除

- `sites/`
- `.env`
- `.env.*`
- `node_modules/`
- `.git/`
- `release/`
- `runtime/`
- `outputs/`
- `logs/`
- `site-recycle-bin/`
- 真实 API Key
- WordPress Application Password
- 真实站点配置和真实输出

## 用户数据

桌面便携版首次运行后，用户可以在软件里创建站点或导入资料。真实数据仍然写入本机运行目录下的 `sites/[siteId]/`，不会预置在安装包里。

如果需要迁移到另一台电脑，建议迁移：

```text
sites/
.env
```

迁移前请确认里面没有需要脱敏的客户数据。

## 已知限制

- 首次运行仍需要本机具备 Node/Electron 运行依赖或使用已打包的便携 exe。
- 如果放在没有写权限的目录，站点数据写入可能失败。建议放在用户文档、下载、桌面或专用工作目录。
- WordPress 发布仍然是草稿发布，需要人工检查。
- 生成内容质量取决于站点资料、Project 指令、关键词规划和所使用的模型。
