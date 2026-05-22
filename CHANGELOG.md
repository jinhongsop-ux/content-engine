# Changelog

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
