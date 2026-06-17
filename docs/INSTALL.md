# 安装与启动

## 环境要求

- Windows 10/11。
- Node.js 18 或更高版本。
- npm。

## 方式一：Windows 双击启动

适合非技术用户。

1. 解压 `Content-Engine-Lite-v0.2.0.zip`。
2. 双击 `start-windows.bat`。
3. 首次运行会自动安装依赖，需要联网。
4. 浏览器会自动打开 `http://127.0.0.1:3000`。

停止程序：

```text
stop-windows.bat
```

或直接关闭启动窗口。

## 方式二：命令行启动

```powershell
npm install
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

## 方式三：桌面窗口启动

开发或本机完整包测试时可用：

```powershell
npm run desktop
```

## 配置密钥

`.env.example` 会作为示例。真实 API Key 可以填在本地 `.env`、系统环境变量，或界面顶部 API Key 输入框中。

不要把 `.env`、API Key、WordPress Application Password 提交到仓库或打包给别人。

## 验证

```powershell
npm run smoke
```

## 打包

源码 release zip：

```powershell
npm run build-release
```

Windows 桌面便携包：

```powershell
npm run pack:win
```
