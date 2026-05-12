# Content Engine — Codex Handoff Instructions

## What this is
A Node.js content generation engine. Reads site config files, calls the Anthropic API,
outputs clean publish-ready HTML articles + a meta-table.xlsx per site.
Started by: node main.js → http://localhost:3000

## Setup (run once)
```
npm install
export ANTHROPIC_API_KEY=your-api-key
node main.js
```

## Directory structure (RESTORE THIS EXACTLY after unzipping)
```
content-engine/
├── main.js
├── package.json
├── engine/
│   ├── api.js
│   ├── cleaner.js
│   ├── config-loader.js
│   ├── generator.js
│   ├── keyword-store.js      ← NEW (manage keyword rows)
│   ├── link-matcher.js
│   ├── meta-writer.js
│   ├── prompt-builder.js
│   ├── qa.js
│   ├── splitter.js
│   └── task-queue.js
├── templates/               ← create this folder (can be empty to start)
├── ui/
│   └── index.html
└── sites/
    └── [site-id]/           ← one folder per site
        ├── site.json
        ├── knowledge.json
        ├── author.json
        ├── links.json
        ├── keywords.csv
        └── outputs/         ← auto-created on first run
            ├── *.html
            ├── meta-table.xlsx
            └── queue-state.json
```

---

## Task 1 — First smoke test

Goal: verify a single article generates correctly end-to-end.

Steps:
1. Create `sites/test-site/` directory
2. Copy `sites/example-site/*.json` and `sites/example-site/keywords.csv` into it
3. Edit `sites/test-site/site.json` — change siteId to "test-site"
4. Edit `sites/test-site/keywords.csv` — keep only the first row
5. Run: `node main.js`
6. Open http://localhost:3000
7. Select "test-site" in the site dropdown
8. Enter API key in the top-right field
9. Click the ▶ button on the single keyword row
10. Watch the log panel on the left for progress

Expected result:
- Log shows: "Done: [slug] · [N]w · QA [score]"
- `sites/test-site/outputs/[slug].html` exists and contains `<article>`
- `sites/test-site/outputs/meta-table.xlsx` exists with 5 sheets
- Preview drawer opens when you click the 📄 icon on the row

If the model doesn't output the `===HTML_START===` delimiter:
→ Open `engine/prompt-builder.js`, find the "Role" section, add this line at the top of the output format block:
  "CRITICAL: Your response MUST start with exactly ===HTML_START=== on its own line."
→ Retry the generation (reset the row status first).

---

## Task 2 — Wire up real site configs

For each real site:
1. Create `sites/[site-id]/` folder
2. Add the 5 config files (site.json, knowledge.json, author.json, links.json, keywords.csv)
3. Refresh the UI — the site appears in the dropdown automatically
4. Import an existing keywords.csv via the "Import CSV" button in the topbar (replaces the file)

The keywords.csv minimum required columns: `keyword`, `urlslug`
All other columns are optional (priority, articletype, etc.) — blanks use defaults.

---

## Task 3 — Known issues to fix

### 3a. SSE progress in batch mode
The current batch run (`POST /api/sites/:id/run`) streams SSE but the UI reads it via
fetch + ReadableStream. If progress doesn't update in real time, add a polling fallback:

```js
// In ui/index.html, inside startBatch(), after the streamRun call:
const poll = setInterval(() => reload(), 3000);
setTimeout(() => clearInterval(poll), 10 * 60 * 1000); // stop after 10 min
```

### 3b. templates/ folder
The config-loader looks for files in `/templates/`. Create the folder even if empty:
```
mkdir templates
```
Optional: create `templates/article-types.json` to override default word counts or
Schema types for any article type.

### 3c. knowledge.json is optional but improves quality
If you have a knowledge.json, the fields it reads are:
- `terminology` — array of `{ en, definition }` objects
- `authorityFacts` — array of strings
- `faq` — array of `{ question, answer }` objects

---

## Task 4 — WordPress publish integration (future)

When ready to connect to WordPress, add this route to `engine/api.js`:

```js
// POST /api/sites/:siteId/publish/:slug
// Body: { wpUrl, wpUser, wpAppPassword }
router.post('/sites/:siteId/publish/:slug', async (req, res) => {
  const htmlPath = join(siteDir, 'outputs', `${req.params.slug}.html`);
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const store = await getStore(req.params.siteId);
  const row = store.getOne(req.params.slug);

  // WP REST API post creation
  const wpRes = await fetch(`${req.body.wpUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${req.body.wpUser}:${req.body.wpAppPassword}`).toString('base64'),
    },
    body: JSON.stringify({
      title:   row.keyword,
      content: html,
      slug:    row.urlslug,
      status:  'draft',   // change to 'publish' when ready
    }),
  });
  const result = await wpRes.json();
  res.json({ ok: wpRes.ok, wpId: result.id, link: result.link });
});
```

Add a "Publish to WP" button next to the ▶ button in the table row actions in `ui/index.html`.

---

## Config file field reference

### site.json
| Field | Required | Description |
|---|---|---|
| siteId | ✓ | Matches directory name |
| domain | ✓ | Full URL |
| language | ✓ | "en", "zh", etc. |
| siteName | | Display name in UI |
| positioning | | One-sentence brand description |
| mustSay | | Array of required phrases |
| mustNotSay | | Array of forbidden phrases |
| writingStyle.tone | | e.g. "calm, practical" |

### keywords.csv
| Column | Required | Notes |
|---|---|---|
| keyword | ✓ | Primary keyword for the article |
| urlslug | ✓ | URL path slug (no slashes) |
| articletype | | buying-guide / price-guide / comparison / faq / how-to / pillar |
| priority | | P1 / P2 / P3 |
| targetwordcount | | Number |
| secondarykeywords | | Comma-separated |
| direction | | Article angle / notes for the model |
| internallinkingurls | | Comma-separated URLs to link to |

### links.json
```json
{
  "pillarPages":  [{ "anchor": "link text", "url": "/url/", "topic": "...", "keywords": ["kw"] }],
  "blogPosts":    [...],
  "productPages": [...]
}
```

---

## Architecture notes

**keyword-store.js** is the single source of truth. It:
- Reads/writes `keywords.csv` (planning fields)
- Reads/writes `outputs/queue-state.json` (status fields)
- Merges both into unified rows for the UI
- Updating a row in the UI calls PUT /keywords/:slug → store.update() → writes back to CSV

**splitter.js** depends on the model outputting:
```
===HTML_START===
<article>...</article>
===HTML_END===
===META_START===
{ ...json... }
===META_END===
```
If the model skips this, check prompt-builder.js → buildSystemPrompt → the "Role" section.
The format instruction is the first thing in the system prompt.

**meta-writer.js** uses ExcelJS. It opens the existing xlsx or creates it fresh.
Primary key is `urlslug` — re-running a slug updates the row, doesn't duplicate it.
