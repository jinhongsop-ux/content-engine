# Windows 一键启动

适用于拿到 release zip 后的本地使用者。这个方式不需要打开命令行手动输入 `npm install` / `npm start`。

## 启动步骤

1. 解压 `Content-Engine-Lite-v0.1.1.zip` 到一个固定文件夹。
2. 双击根目录里的 `start-windows.bat`。
3. 首次运行如果没有 `node_modules/`，脚本会自动执行 `npm install`，需要联网，可能需要几分钟。
4. 服务启动后，浏览器会自动打开 `http://127.0.0.1:3000`。

启动窗口会保持打开，用来显示运行日志。关闭这个窗口通常就会停止本地服务。

## 配置 .env

首次启动时，如果项目根目录没有 `.env`，脚本会从 `.env.example` 复制一份。

`.env` 是本机私有配置文件，可以按需填写默认模型地址、模型名等配置。不要把 `.env` 发给别人，不要提交到 GitHub，也不要放进 release 包。

API Key 也可以直接在界面顶部输入框填写。

## 停止程序

推荐方式：

1. 关闭 `start-windows.bat` 打开的启动窗口；或
2. 双击根目录里的 `stop-windows.bat`。

`stop-windows.bat` 只会尝试停止由 `start-windows.bat` 记录的本程序进程，不会按端口强行结束其他程序。

## 常见问题

### Node 未安装

如果提示没有检测到 Node.js 或 npm，请先安装 Node.js LTS：https://nodejs.org/

安装后重新双击 `start-windows.bat`。

### npm install 失败

通常是网络、代理、权限或 npm 源问题。可以确认电脑能访问 npm registry，或把项目解压到权限限制较少的目录，例如 `D:\Content-Engine-Lite\`。

### 端口被占用

默认服务地址是 `http://127.0.0.1:3000`。如果端口已被其他程序占用，请先关闭占用 3000 端口的程序，再重新启动。

### API Key 未配置

界面可以打开，但生成文章会失败。请在界面顶部输入 API Key，或在 `.env` 中配置默认值。

### 浏览器没有自动打开

手动打开浏览器访问 `http://127.0.0.1:3000`。

### Windows PowerShell 执行策略提示

`start-windows.bat` 已使用 `-ExecutionPolicy Bypass` 调用本地脚本。如果仍被拦截，通常是公司电脑安全策略限制，需要管理员允许本地 PowerShell 脚本执行。
