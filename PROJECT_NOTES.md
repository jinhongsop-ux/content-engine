# Project Notes

This rebuild follows Claude's planned architecture but makes it run as a clean local article factory:

- `KeywordStore` owns the editable keyword table and queue state.
- `TaskQueue` handles single and batch generation with concurrency.
- `prompt-builder` creates a strict two-block output contract.
- `splitter` extracts article HTML and metadata JSON.
- `cleaner` removes unsafe or non-publishable HTML artifacts.
- `qa` scores the article and marks hard failures.
- `meta-writer` writes/upserts the Excel metadata workbook.
- `ui/index.html` provides a local control panel for CSV import/export, editing, generation, preview, and downloads.

The model must return:

```text
===HTML_START===
<article>...</article>
===HTML_END===
===META_START===
{ "seoTitles": [], "metaDescription": "...", "altTexts": [], "schema": {}, "wordCount": 0, "qaFlags": [] }
===META_END===
```

The next major extension is WordPress publishing. Add it after article generation and QA are stable for real site configs.
