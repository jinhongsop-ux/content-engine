# Windows 一键启动说明

Content Engine Lite 提供 Windows 本地一键启动方式。非技术用户解压 release zip 后，可以直接双击 `start-windows.bat`。

## 它会做什么

- 检查 Node.js 和 npm。
- 首次运行时自动执行 `npm install`。
- 如果没有 `.env`，从 `.env.example` 复制一份。
- 启动本地服务。
- 打开 `http://127.0.0.1:3000`。
- 保持启动窗口打开，方便查看日志。

## 如何停止

- 关闭启动窗口；或
- 双击 `stop-windows.bat`。

停止脚本只会尝试停止由本启动器记录的本程序进程，不会按端口强杀其他程序。

## 边界说明

- 这是 Windows 本地启动方式，不是云端 SaaS。
- 首次运行需要联网安装 npm 依赖。
- API Key、模型调用费用、WordPress 费用由使用方自行承担。
- 生成内容必须人工审核后使用。
- release 包不包含真实 `sites/` 数据、真实 API Key 或 WordPress 密码。
