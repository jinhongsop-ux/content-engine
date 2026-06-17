# Security Check

This file summarizes the security review for Content Engine Lite v0.2.0 packaging.

## Checked Areas

- Project root files.
- `engine/` source files.
- `ui/` frontend file.
- `templates/` default strategy files.
- `examples/` deliverable examples.
- `docs/` documentation.
- `desktop/` Electron shell files.
- `scripts/` release and smoke scripts.
- `sites/` real local site data, for risk identification only.

## Findings

- Real local site data exists under `sites/`.
- Local `sites/` data may contain WordPress Application Passwords, production domains, article outputs, generated assets, customer notes, and API-related settings.
- No real API key is intentionally added to `.env.example` or `examples/demo-site/`.
- The demo site uses fictional data only.
- The Electron desktop shell starts the existing local Express app; it does not add a cloud backend or external credential storage.

## Packaging Rule

The release builder and Electron builder both exclude the entire `sites/` directory. Real local site data is allowed to remain on the user's machine, but it is not packaged into deliverables.

Expected deliverables:

- `release/Content-Engine-Lite-v0.2.0.zip`
- `dist/Content-Engine-Lite-0.2.0-x64.exe`

## Excluded From Release

- `.git/`
- `node_modules/`
- `.env`
- `.env.*`
- `sites/`
- `release/`
- `dist/`
- `logs/`
- `runtime/`
- `outputs/`
- `site-recycle-bin/`
- `server.out.log`
- `server.err.log`
- temporary and backup files

## User Responsibilities

- Do not paste real API keys into source files.
- Store runtime secrets in local `.env`, system environment variables, or the UI only when needed.
- Review all generated content before publishing.
- Keep real customer and production site data outside public repositories and shared release packages.
