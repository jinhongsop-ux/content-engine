/**
 * keyword-store.js
 *
 * Single source of truth for all keyword rows for a site.
 *
 * Persistence:
 *   - keywords.csv  — the planning table (user-owned, editable)
 *   - outputs/queue-state.json — generation status overlay
 *
 * A "row" is the merged object of keyword fields + live status fields:
 *   { keyword, urlslug, priority, intent, articletype, targetwordcount,
 *     secondarykeywords, variants, direction, internallinkingurls,
 *     status, qaScore, wordCount, error, updatedAt }
 *
 * The keyword row is the unit of work. Adding a new row = planning a new article.
 * Generating against a slug = updating that row's status fields.
 */

import fs   from 'fs';
import { join } from 'path';
import { parse }     from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Canonical CSV column order — what we write back out
const CSV_COLUMNS = [
  'keyword', 'urlslug', 'priority', 'intent', 'articletype',
  'targetwordcount', 'secondarykeywords', 'variants',
  'direction', 'internallinkingurls',
  'volume', 'kd', 'cannibalcheck', 'pillartarget', 'blogid',
];

// Status fields stored separately in queue-state.json (not in CSV)
const STATUS_FIELDS = ['status', 'qaScore', 'wordCount', 'error', 'updatedAt'];

export class KeywordStore {
  constructor(ctx) {
    this.ctx       = ctx;
    this.siteDir   = ctx.siteDir;
    this.outputDir = ctx.outputDir;
    this._rows     = [];   // { ...csvFields, ...statusFields }
  }

  // ── Load ─────────────────────────────────────────────────────────────────────

  load() {
    // 1. Load keyword CSV
    const csvPath = join(this.siteDir, 'keywords.csv');
    let csvRows   = [];
    if (fs.existsSync(csvPath)) {
      try {
        const raw = fs.readFileSync(csvPath, 'utf-8');
        const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
        csvRows = records.map(r => normaliseRow(r)).filter(isRealKeywordRow);
      } catch (e) {
        console.warn(`[keyword-store] keywords.csv parse error: ${e.message}`);
      }
    }

    // 2. Load status overlay
    const stateFile = join(this.outputDir, 'queue-state.json');
    let state = {};
    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch {}
    }

    // 3. Merge
    this._rows = csvRows.map(r => ({
      ...r,
      status:    state[r.urlslug]?.status    || 'queued',
      qaScore:   state[r.urlslug]?.qaScore   ?? null,
      wordCount: state[r.urlslug]?.wordCount ?? null,
      error:     state[r.urlslug]?.error     || null,
      updatedAt: state[r.urlslug]?.updatedAt || null,
    }));

    return this;
  }

  // ── Read ──────────────────────────────────────────────────────────────────────

  getAll() {
    return this._rows.map(r => ({ ...r }));
  }

  getOne(slug) {
    return this._rows.find(r => r.urlslug === slug) || null;
  }

  // For task-queue compatibility — returns just the task fields
  getTaskRows(filter = {}) {
    let rows = this._rows;
    if (filter.slugs)      rows = rows.filter(r => filter.slugs.includes(r.urlslug));
    if (filter.onlyFailed) rows = rows.filter(r => r.status === 'failed');
    if (!filter.slugs && !filter.onlyFailed) rows = rows.filter(r => r.status !== 'done');
    return rows;
  }

  // ── Write (CSV fields) ────────────────────────────────────────────────────────

  add(fields) {
    if (!fields.keyword) throw new Error('keyword is required');

    const slug = fields.urlslug || slugify(fields.keyword);
    if (this._rows.find(r => r.urlslug === slug)) {
      throw new Error(`Slug "${slug}" already exists. Update the existing row or use a different keyword.`);
    }

    const row = {
      ...emptyRow(),
      ...normaliseRow(fields),
      urlslug:   slug,
      status:    'queued',
      qaScore:   null,
      wordCount: null,
      error:     null,
      updatedAt: null,
    };
    this._rows.push(row);
    this._persistCsv();
    return { ...row };
  }

  update(slug, fields) {
    const idx = this._rows.findIndex(r => r.urlslug === slug);
    if (idx === -1) throw new Error(`Keyword "${slug}" not found`);

    // Only allow updating planning fields, not status fields
    const allowed = normaliseRow(fields);
    this._rows[idx] = { ...this._rows[idx], ...allowed };
    this._persistCsv();
    return { ...this._rows[idx] };
  }

  remove(slug) {
    const before = this._rows.length;
    this._rows = this._rows.filter(r => r.urlslug !== slug);
    if (this._rows.length === before) throw new Error(`Keyword "${slug}" not found`);
    this._persistCsv();
    this._persistState();
  }

  // ── Write (status fields) ─────────────────────────────────────────────────────

  setStatus(slug, status, extra = {}) {
    const row = this._rows.find(r => r.urlslug === slug);
    if (!row) return;
    Object.assign(row, { status, updatedAt: new Date().toISOString(), ...extra });
    this._persistState();
  }

  resetStatus(slugs = null) {
    for (const row of this._rows) {
      if (!slugs || slugs.includes(row.urlslug)) {
        row.status    = 'queued';
        row.error     = null;
        row.qaScore   = null;
        row.wordCount = null;
        row.updatedAt = null;
      }
    }
    this._persistState();
  }

  // ── CSV import / export ───────────────────────────────────────────────────────

  importCsv(csvText) {
    const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    const normalised = records.map(r => normaliseRow(r)).filter(isRealKeywordRow);

    // Load existing status so we don't lose progress on re-import
    const existingStatus = {};
    for (const r of this._rows) {
      existingStatus[r.urlslug] = {
        status: r.status, qaScore: r.qaScore, wordCount: r.wordCount,
        error: r.error, updatedAt: r.updatedAt,
      };
    }

    this._rows = normalised.map(r => ({
      ...r,
      ...(existingStatus[r.urlslug] || { status: 'queued', qaScore: null, wordCount: null, error: null, updatedAt: null }),
    }));

    this._persistCsv();
    this._persistState();
    return this._rows.length;
  }

  exportCsv() {
    const data = this._rows.map(r => {
      const out = {};
      for (const col of CSV_COLUMNS) out[col] = r[col] ?? '';
      return out;
    });
    return stringify(data, { header: true, columns: CSV_COLUMNS });
  }

  // ── Persist ───────────────────────────────────────────────────────────────────

  _persistCsv() {
    fs.mkdirSync(this.siteDir, { recursive: true });
    fs.writeFileSync(join(this.siteDir, 'keywords.csv'), this.exportCsv(), 'utf-8');
  }

  _persistState() {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const state = {};
    for (const r of this._rows) {
      state[r.urlslug] = {
        status:    r.status,
        qaScore:   r.qaScore,
        wordCount: r.wordCount,
        error:     r.error,
        updatedAt: r.updatedAt,
      };
    }
    fs.writeFileSync(
      join(this.outputDir, 'queue-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseRow(r) {
  const source = {};
  for (const [key, value] of Object.entries(r || {})) {
    source[normaliseKey(key)] = value;
  }
  const out = {};
  for (const col of CSV_COLUMNS) {
    const val = source[normaliseKey(col)] ?? '';
    out[col] = String(val).trim();
  }
  // Ensure urlslug always exists
  if (!out.urlslug) out.urlslug = slugify(out.keyword);
  return out;
}

function normaliseKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function emptyRow() {
  const r = {};
  for (const col of CSV_COLUMNS) r[col] = '';
  return r;
}

function isRealKeywordRow(row) {
  const kw = String(row.keyword || '').trim();
  return Boolean(kw) && !/^\[.*字段.*\]/i.test(kw) && !/^field\s*guide$/i.test(kw);
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
