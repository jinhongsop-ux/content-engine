# Content Engine Lite v0.1.1

Content Engine Lite is a local internal AI content production workbench. It helps manage site data, keyword tasks, Project instructions, prompt strategy, outline generation, article generation, QA checks, image planning, publish packs, and WordPress draft publishing.

It is not a mature SaaS product. It is not an unattended publishing system. Generated content must be reviewed by a human before use.

## Windows One-Click Start

After extracting the release package, double-click:

```text
start-windows.bat
```

The first run installs dependencies if needed, creates a local `.env` from `.env.example` if missing, starts the local service, and opens:

```text
http://127.0.0.1:3000
```

To stop it, close the startup window or double-click `stop-windows.bat`.

Detailed guide:

- `docs/QUICK-START-WINDOWS.md`
- `docs/ONE-CLICK-START.md`

## Manual Quick Start

```powershell
npm install
npm start
```

Open:

```text
http://127.0.0.1:3000
```

## Verify

```powershell
npm run smoke
```

## Build Release Zip

```powershell
npm run build-release
```

Output:

```text
release/Content-Engine-Lite-v0.1.1.zip
```

## Main Folders

- `main.js`: local server entry.
- `engine/`: backend routes and generation pipeline.
- `ui/`: browser UI.
- `templates/`: default article, prompt, and QA strategy.
- `examples/demo-site/`: fictional demo data.
- `docs/`: installation, usage, configuration, data formats, delivery scope, troubleshooting, and license notes.
- `scripts/`: smoke test and release builder.

## Data Storage

Real working data is stored locally under `sites/[siteId]/`. The release package intentionally excludes the entire `sites/` directory to avoid packaging real site data, generated outputs, API keys, or WordPress credentials.

## Documentation

Start with:

- `docs/README.md`
- `docs/INSTALL.md`
- `docs/USAGE.md`
- `docs/CONFIG.md`
- `docs/DATA-FILES.md`
- `SECURITY-CHECK.md`

## Delivery Boundary

This software does not guarantee SEO ranking, traffic, inquiries, or sales. API keys, model costs, server costs, and WordPress costs are the responsibility of the user or receiving organization. Do not resell, publicly publish, redistribute, or upload this package to a public repository unless a separate written agreement allows it.
