# Install

## Requirements

- Windows 10/11 or equivalent local machine.
- Node.js 18 or newer.
- npm.

## Windows One-Click Start

For non-technical Windows users, unzip the release package and double-click:

```text
start-windows.bat
```

The script checks Node.js/npm, installs dependencies on first run, creates a local `.env` from `.env.example` if needed, starts the local app, and opens:

```text
http://127.0.0.1:3000
```

To stop the app, close the startup window or double-click:

```text
stop-windows.bat
```

More details: `docs/QUICK-START-WINDOWS.md`.

## Manual Install Dependencies

From the project folder:

```powershell
npm install
```

## Manual Start

```powershell
npm start
```

Open:

```text
http://127.0.0.1:3000
```

## Optional Environment Variables

Copy `.env.example` to `.env` only for local private use. Do not share `.env`.

The app also allows API keys to be pasted in the UI.

## Verify

```powershell
npm run smoke
```
