# One-Click Start

Content Engine Lite v0.1.1 增加了 Windows 本地一键启动方式。

非技术使用者解压 release zip 后，可以直接双击 `start-windows.bat`。首次运行会自动安装依赖，并在服务启动后打开 `http://127.0.0.1:3000`。

停止时可以关闭启动窗口，或双击 `stop-windows.bat`。

## 边界说明

- 这是 Windows 本地启动方式，不是云端 SaaS。
- 首次运行需要联网安装 npm 依赖。
- API Key、模型调用费用、WordPress 费用由使用方自行承担。
- 生成内容必须人工审核后使用。
- release 包不包含真实 `sites/` 数据，也不包含真实 API Key 或 WordPress 密码。
