# Content Engine

Content Engine is a local multi-site article factory. It reads one folder per site, manages a keyword planning table, generates publish-ready article HTML, runs QA, and writes a companion `meta-table.xlsx`.

## Run

```powershell
npm install
npm start
```

Open:

```text
http://127.0.0.1:3000
```

You can set `ANTHROPIC_API_KEY` in the environment or paste an API key in the UI.

## Project Structure

```text
content-engine/
  main.js
  engine/
    api.js
    cleaner.js
    config-loader.js
    generator.js
    keyword-store.js
    link-matcher.js
    meta-writer.js
    prompt-builder.js
    qa.js
    splitter.js
    task-queue.js
  templates/
    article-types.json
    prompt-sections.json
  ui/
    index.html
  sites/
    example-site/
      site.json
      knowledge.json
      author.json
      links.json
      keywords.csv
```

## Site Folder Contract

Each site lives in `sites/<site-id>/`.

Required:

- `site.json`: brand, positioning, language, conversion goal, must-say and must-not-say rules.
- `author.json`: author identity and writing notes.
- `keywords.csv`: keyword planning table.

Optional but recommended:

- `knowledge.json`: terms, facts, FAQs, objections, selling points.
- `links.json`: internal links for natural article insertion.

## keywords.csv Columns

Required:

- `keyword`
- `urlslug`

Recommended:

- `priority`
- `intent`
- `articletype`
- `targetwordcount`
- `secondarykeywords`
- `variants`
- `direction`
- `internallinkingurls`

Supported article types:

- `buying-guide`
- `price-guide`
- `comparison`
- `faq`
- `how-to`
- `pillar`

## UI Workflow

The admin UI has four main areas:

1. `关键词任务`: edit the keyword table, import/export CSV, run one article or batch generation.
2. `文件管理`: view and edit `site.json`, `knowledge.json`, `author.json`, `links.json`, and `keywords.csv` for the selected site. This is where referenced data lives.
3. `流程逻辑`: see every generation step, which files it reads, which engine module runs, and what files it writes.
4. `新增网站`: create a new `sites/<site-id>/` folder with starter config files.

Basic generation flow:

1. Choose a site from the top-left dropdown.
2. Confirm the site files in `文件管理`.
3. Import or edit `keywords.csv`.
4. Enter an API key or use `ANTHROPIC_API_KEY`.
5. Generate a single row or batch-run queued rows.
6. Preview article HTML from the row action.
7. Export CSV, article ZIP, or `meta-table.xlsx`.

## Outputs

Generated files are written under:

```text
sites/<site-id>/outputs/
  <slug>.html
  meta-table.xlsx
  queue-state.json
```

`keywords.csv` remains the planning source of truth. Runtime status is stored in `outputs/queue-state.json`.

## API Summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sites` | List configured sites |
| POST | `/api/sites` | Create a new site folder with starter config files |
| GET | `/api/sites/:siteId/files` | Read editable site files and output file list |
| PUT | `/api/sites/:siteId/files/:fileName` | Save one editable site file |
| GET | `/api/pipeline` | Show the generation pipeline and file roles |
| GET | `/api/sites/:siteId/keywords` | Read keyword table with status |
| POST | `/api/sites/:siteId/keywords` | Add keyword row |
| PUT | `/api/sites/:siteId/keywords/:slug` | Update keyword row |
| DELETE | `/api/sites/:siteId/keywords/:slug` | Delete keyword row |
| POST | `/api/sites/:siteId/keywords/import` | Replace keyword CSV |
| GET | `/api/sites/:siteId/keywords/export` | Download keyword CSV |
| POST | `/api/sites/:siteId/generate/:slug` | Generate one article via SSE |
| POST | `/api/sites/:siteId/run` | Batch-generate via SSE |
| POST | `/api/sites/:siteId/reset` | Reset selected rows |
| GET | `/api/sites/:siteId/articles/:slug` | Read generated HTML |
| GET | `/api/sites/:siteId/export` | Download generated HTML ZIP |
| GET | `/api/sites/:siteId/meta-table` | Download metadata workbook |
