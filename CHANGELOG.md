# Changelog

## v0.2.0 - C/B SOP Guides and Desktop Package

- Adds an in-app “使用教程” panel.
- Splits tutorials for C端 DTC/content sites and B端 foreign trade/manufacturing sites.
- Adds C端 and B端 operation documents under `docs/USER-GUIDE-B2C.md` and `docs/USER-GUIDE-B2B.md`.
- Updates QA wording from failure-style language to editorial attention points and publishing suggestions.
- Adds Electron desktop shell under `desktop/`.
- Adds `npm run desktop` and `npm run pack:win`.
- Adds desktop packaging documentation.
- Keeps the existing Express backend, `ui/index.html`, content pipeline, import center, WordPress draft publishing, and real `sites/` exclusion rules.

## v0.1.1 - Windows One-Click Start

- Adds `start-windows.bat` and `scripts/start-windows.ps1` for Windows double-click startup.
- Adds `stop-windows.bat` and `scripts/stop-windows.ps1` for safe shutdown of the recorded local app process.
- Adds Windows quick-start documentation.
- Updates the release builder to include Windows launcher files.
- Keeps real `sites/` data, `.env`, outputs, logs, runtime cache, API keys, and WordPress credentials excluded from the release package.

## v0.1.0 - Content Engine Lite

First local deliverable package for the Content Engine Lite workbench.

- Preserves the current stable local Node.js + Express application.
- Documents install, usage, configuration, data file formats, troubleshooting, security checks, and delivery boundaries.
- Adds a fictional demo site under `examples/demo-site/`.
- Adds smoke testing for core file presence, UI script parsing, templates, demo keywords, and API route markers.
- Adds a release builder that creates `release/Content-Engine-Lite-v0.1.zip`.
- Excludes real `sites/` data, `.env`, outputs, logs, `node_modules`, `.git`, and release artifacts from the deliverable zip.
