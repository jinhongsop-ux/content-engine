/**
 * meta-writer.js
 *
 * Writes/updates the site's meta-table.xlsx with metadata from a completed article.
 * Each site has one file at sites/<siteId>/outputs/meta-table.xlsx.
 *
 * Sheet layout:
 *   Sheet1 "Articles"    — one row per article (slug, status, word count, QA score, date)
 *   Sheet2 "SEO Fields"  — SEO titles, meta description, focus keyword
 *   Sheet3 "Image ALTs"  — image alt text suggestions by article + position
 *   Sheet4 "Schema"      — JSON-LD per article
 *   Sheet5 "QA Report"   — per-dimension scores, hard fails, warnings
 *
 * Primary key: urlSlug (updates existing row if slug already exists)
 */

import ExcelJS from 'exceljs';
import { join } from 'path';
import fs from 'fs';

export async function writeMeta(ctx, task, qaResult, meta) {
  const filePath = join(ctx.outputDir, 'meta-table.xlsx');
  const slug = task.urlslug || task['url slug'] || task.keyword.replace(/\s+/g, '-');

  // Ensure output directory exists
  fs.mkdirSync(ctx.outputDir, { recursive: true });

  const wb = new ExcelJS.Workbook();

  // Load existing file or create fresh
  if (fs.existsSync(filePath)) {
    await wb.xlsx.readFile(filePath);
  } else {
    initWorkbook(wb);
  }

  const now = new Date().toISOString().split('T')[0];

  // ── Sheet 1: Articles overview ──
  await upsertRow(wb, 'Articles', 'Slug', slug, {
    'Slug':         slug,
    'Keyword':      task.keyword,
    'Status':       qaResult.pass ? 'done' : 'qa-failed',
    'Word Count':   qaResult.wordCount || 0,
    'QA Score':     qaResult.score || 0,
    'Hard Fails':   (qaResult.hardFails || []).map(f => f.id).join(', '),
    'Warnings':     (qaResult.warnings || []).map(w => w.id).join(', '),
    'Internal Links': qaResult.internalLinkCount || 0,
    'Generated At': now,
    'Article Type': task.articletype || task['article type'] || '',
  });

  // ── Sheet 2: SEO Fields ──
  if (meta) {
    await upsertRow(wb, 'SEO Fields', 'Slug', slug, {
      'Slug':             slug,
      'Keyword':          task.keyword,
      'SEO Title 1':      meta.seoTitles?.[0] || '',
      'SEO Title 2':      meta.seoTitles?.[1] || '',
      'SEO Title 3':      meta.seoTitles?.[2] || '',
      'Meta Description': meta.metaDescription || '',
      'Focus Keyword':    task.keyword,
      'Schema Type':      meta.schema?.['@type'] || '',
    });
  }

  // ── Sheet 3: Image ALTs ──
  if (meta?.altTexts?.length) {
    const sheet = getOrCreateSheet(wb, 'Image ALTs');
    ensureHeaders(sheet, ['Slug', 'Keyword', 'Position', 'ALT Suggestion']);

    // Remove old rows for this slug before re-inserting
    removeRowsByKey(sheet, 'Slug', slug);

    for (const alt of meta.altTexts) {
      sheet.addRow({
        'Slug':           slug,
        'Keyword':        task.keyword,
        'Position':       alt.position,
        'ALT Suggestion': alt.suggestion,
      });
    }
  }

  // ── Sheet 4: Schema ──
  if (meta?.schema) {
    await upsertRow(wb, 'Schema', 'Slug', slug, {
      'Slug':       slug,
      'Keyword':    task.keyword,
      'Schema Type': meta.schema['@type'] || '',
      'JSON-LD':    JSON.stringify(meta.schema, null, 2),
    });
  }

  // ── Sheet 5: QA Report ──
  await upsertRow(wb, 'QA Report', 'Slug', slug, {
    'Slug':              slug,
    'Keyword':           task.keyword,
    'Overall Score':     qaResult.score || 0,
    'Pass':              qaResult.pass ? 'YES' : 'NO',
    'SEO Structure':     Math.round((qaResult.scores?.seoStructure     || 0) * 20),
    'Brand Fit':         Math.round((qaResult.scores?.brandFit         || 0) * 20),
    'Helpfulness':       Math.round((qaResult.scores?.helpfulness      || 0) * 20),
    'Readability':       Math.round((qaResult.scores?.readability      || 0) * 20),
    'Publish Readiness': Math.round((qaResult.scores?.publishReadiness || 0) * 20),
    'Hard Fails':        (qaResult.hardFails || []).map(f => f.message).join(' | '),
    'Warnings':          (qaResult.warnings  || []).map(w => w.message).join(' | '),
    'Generated At':      now,
  });

  await wb.xlsx.writeFile(filePath);
  return filePath;
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function initWorkbook(wb) {
  const sheets = {
    'Articles':  ['Slug', 'Keyword', 'Status', 'Word Count', 'QA Score', 'Hard Fails', 'Warnings', 'Internal Links', 'Generated At', 'Article Type'],
    'SEO Fields':['Slug', 'Keyword', 'SEO Title 1', 'SEO Title 2', 'SEO Title 3', 'Meta Description', 'Focus Keyword', 'Schema Type'],
    'Image ALTs':['Slug', 'Keyword', 'Position', 'ALT Suggestion'],
    'Schema':    ['Slug', 'Keyword', 'Schema Type', 'JSON-LD'],
    'QA Report': ['Slug', 'Keyword', 'Overall Score', 'Pass', 'SEO Structure', 'Brand Fit', 'Helpfulness', 'Readability', 'Publish Readiness', 'Hard Fails', 'Warnings', 'Generated At'],
  };

  for (const [name, cols] of Object.entries(sheets)) {
    const sheet = wb.addWorksheet(name);
    sheet.addRow(cols);
    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font   = { bold: true };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } };
    headerRow.commit();
  }
}

function getOrCreateSheet(wb, name) {
  return wb.getWorksheet(name) || wb.addWorksheet(name);
}

function ensureHeaders(sheet, headers) {
  if (sheet.rowCount === 0) {
    sheet.addRow(headers);
  }
}

async function upsertRow(wb, sheetName, keyCol, keyVal, data) {
  const sheet = getOrCreateSheet(wb, sheetName);
  if (sheet.rowCount === 0) {
    sheet.addRow(Object.keys(data));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } };
    headerRow.commit();
  }

  // Find existing row by key
  const headers = sheet.getRow(1).values.slice(1); // slice(1) because ExcelJS 1-indexes
  const keyIdx  = headers.indexOf(keyCol) + 1;     // back to 1-indexed

  let targetRow = null;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.getCell(keyIdx).value === keyVal) {
      targetRow = row;
    }
  });

  const rowValues = headers.map(h => data[h] ?? '');

  if (targetRow) {
    rowValues.forEach((val, i) => targetRow.getCell(i + 1).value = val);
    targetRow.commit();
  } else {
    sheet.addRow(rowValues);
  }
}

function removeRowsByKey(sheet, keyCol, keyVal) {
  if (sheet.rowCount === 0) return;
  const headers = sheet.getRow(1).values.slice(1);
  const keyIdx  = headers.indexOf(keyCol);
  if (keyIdx === -1) return;

  const toRemove = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.getCell(keyIdx + 1).value === keyVal) {
      toRemove.push(rowNumber);
    }
  });
  // Remove in reverse order to keep indices stable
  for (const n of toRemove.reverse()) {
    sheet.spliceRows(n, 1);
  }
}
