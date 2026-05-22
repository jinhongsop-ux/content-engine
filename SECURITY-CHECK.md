# Security Check

This file summarizes the security review for Content Engine Lite v0.1 packaging.

## Checked Areas

- Project root files.
- `engine/` source files.
- `ui/` frontend file.
- `templates/` default strategy files.
- `examples/` deliverable examples.
- `sites/` real local site data, for risk identification only.

## Findings

- Real local site data exists under `sites/`.
- At least one real WordPress Application Password pattern was found in local `sites/` data.
- Real article outputs and generated assets exist under site output folders.
- No real API key is intentionally added to `.env.example` or `examples/demo-site/`.
- Brand-specific template residue found in global UI/templates was replaced with generic wording before building the release package.

## Packaging Rule

The release builder excludes the entire `sites/` directory. Real local site data is allowed to remain on the user's machine, but it is not packaged into `release/Content-Engine-Lite-v0.1.zip`.

The generated release zip was checked for blocked paths. Result: no `.git`, `node_modules`, `sites`, `outputs`, `.env`, logs, or runtime folders were found in the zip.

## Excluded From Release

- `.git/`
- `node_modules/`
- `.env`
- `.env.*`
- `sites/`
- `release/`
- `logs/`
- `runtime/`
- `outputs/`
- `server.out.log`
- `server.err.log`
- temporary and backup files

## User Responsibilities

- Do not paste real API keys into source files.
- Store runtime secrets in local environment variables or the UI when needed.
- Review all generated content before publishing.
- Keep real customer and production site data outside public repositories and shared release packages.
