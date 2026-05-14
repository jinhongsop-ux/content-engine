/**
 * Express API router for the content engine UI.
 */

import { Router } from 'express';
import { join } from 'path';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { loadSiteContext, listSites } from './config-loader.js';
import { TaskQueue } from './task-queue.js';
import { KeywordStore } from './keyword-store.js';
import { buildArticlePrompt, buildOutlinePrompt } from './prompt-builder.js';
import { generate } from './generator.js';
import { clean } from './cleaner.js';
import { validate } from './qa.js';
import { writeMeta } from './meta-writer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const router = Router();

const ROOT_DIR = join(__dirname, '..');
const SITES_DIR = join(ROOT_DIR, 'sites');
const TEMPLATES_DIR = join(ROOT_DIR, 'templates');

const CONFIG_FILES = {
  site: 'site.json',
  knowledge: 'knowledge.json',
  author: 'author.json',
  links: 'links.json',
  'style-reference': 'style-reference.json',
  style: 'style-reference.json',
};

const TEMPLATE_FILES = {
  'article-types': {
    filename: 'article-types.json',
    defaults: defaultArticleTypes,
  },
  'prompt-sections': {
    filename: 'prompt-sections.json',
    defaults: defaultPromptSections,
  },
  'qa-rules': {
    filename: 'qa-rules.json',
    defaults: defaultQaRules,
  },
};

const EDITABLE_SITE_FILES = new Set(['site.json', 'knowledge.json', 'author.json', 'links.json', 'style-reference.json', 'project-instructions.md', 'keywords.csv']);
const stores = new Map();

router.get('/sites', (req, res) => {
  try {
    const sites = listSites().map(siteId => {
      const cfgPath = join(SITES_DIR, siteId, 'site.json');
      let displayName = siteId;
      try {
        displayName = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')).siteName || siteId;
      } catch {}
      return { siteId, displayName };
    });
    res.json({ sites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sites', createSiteHandler);
router.post('/sites/create', createSiteHandler);

router.delete('/sites/:siteId', (req, res) => {
  try {
    const { siteId } = req.params;
    const confirmSiteId = String(req.body?.confirmSiteId || '').trim();
    if (confirmSiteId !== siteId) {
      return res.status(400).json({ error: 'Deletion requires confirmSiteId matching the siteId.' });
    }
    const siteDir = getSiteDir(siteId);
    const resolvedRoot = fs.realpathSync(SITES_DIR);
    const resolvedSite = fs.realpathSync(siteDir);
    if (!resolvedSite.startsWith(resolvedRoot + path.sep)) {
      return res.status(400).json({ error: 'Refusing to delete outside the sites directory.' });
    }
    fs.rmSync(resolvedSite, { recursive: true, force: false });
    stores.delete(siteId);
    res.json({ ok: true, siteId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sites/:siteId/config/:file', (req, res) => {
  try {
    const filePath = getConfigPath(req.params.siteId, req.params.file);
    const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : {};
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/config/:file', (req, res) => {
  try {
    const filePath = getConfigPath(req.params.siteId, req.params.file);
    const content = req.body?.content;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return res.status(400).json({ error: 'Body must be { content: object }' });
    }
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    stores.delete(req.params.siteId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sites/:siteId/project-instructions', (req, res) => {
  try {
    const p = join(getSiteDir(req.params.siteId), 'project-instructions.md');
    res.json({ content: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '', exists: fs.existsSync(p) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/project-instructions', (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : req.body?.content;
    if (typeof content !== 'string') return res.status(400).json({ error: 'Body must be { content: string }' });
    fs.writeFileSync(join(getSiteDir(req.params.siteId), 'project-instructions.md'), content, 'utf-8');
    stores.delete(req.params.siteId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/templates/:file', (req, res) => {
  try {
    const spec = getTemplateSpec(req.params.file);
    const filePath = join(TEMPLATES_DIR, spec.filename);
    if (!fs.existsSync(filePath)) return res.json({ content: spec.defaults(), isCustom: false });
    res.json({ content: JSON.parse(fs.readFileSync(filePath, 'utf-8')), isCustom: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/templates/:file', (req, res) => {
  try {
    const spec = getTemplateSpec(req.params.file);
    const content = req.body?.content;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return res.status(400).json({ error: 'Body must be { content: object }' });
    }
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.writeFileSync(join(TEMPLATES_DIR, spec.filename), JSON.stringify(content, null, 2), 'utf-8');
    stores.clear();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/templates/:file', (req, res) => {
  try {
    const spec = getTemplateSpec(req.params.file);
    const filePath = join(TEMPLATES_DIR, spec.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    stores.clear();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sites/:siteId/files', (req, res) => {
  try {
    const siteDir = getSiteDir(req.params.siteId);
    const files = [...EDITABLE_SITE_FILES].map(name => {
      const p = join(siteDir, name);
      const exists = fs.existsSync(p);
      return {
        name,
        exists,
        size: exists ? fs.statSync(p).size : 0,
        content: exists ? fs.readFileSync(p, 'utf-8') : '',
        role: siteFileRole(name),
      };
    });
    const outputDir = join(siteDir, 'outputs');
    const outputs = fs.existsSync(outputDir)
      ? fs.readdirSync(outputDir).map(name => ({ name, size: fs.statSync(join(outputDir, name)).size }))
      : [];
    res.json({ siteId: req.params.siteId, siteDir, files, outputs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/sites/:siteId/files/:fileName', (req, res) => {
  try {
    const { siteId, fileName } = req.params;
    if (!EDITABLE_SITE_FILES.has(fileName)) return res.status(400).json({ error: 'This file is not editable from the UI' });
    const siteDir = getSiteDir(siteId);
    const content = typeof req.body === 'string' ? req.body : req.body?.content;
    if (typeof content !== 'string') return res.status(400).json({ error: 'Request body must be text/plain or { content }' });
    if (fileName.endsWith('.json')) JSON.parse(content);
    fs.writeFileSync(join(siteDir, fileName), content, 'utf-8');
    stores.delete(siteId);
    res.json({ ok: true, fileName });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pipeline', (_req, res) => {
  res.json({
    steps: [
      {
        id: 'site-config',
        title: '1. Load site config and knowledge base',
        reads: ['sites/<siteId>/site.json', 'sites/<siteId>/knowledge.json', 'sites/<siteId>/author.json', 'sites/<siteId>/links.json'],
        code: ['engine/config-loader.js'],
        output: 'Unified ctx object used by later modules',
      },
      {
        id: 'keyword-store',
        title: '2. Load keyword plan and queue state',
        reads: ['sites/<siteId>/keywords.csv', 'sites/<siteId>/outputs/queue-state.json'],
        code: ['engine/keyword-store.js'],
        output: 'Keyword task rows, generation status, errors, QA score and word count',
      },
      {
        id: 'prompt',
        title: '3. Build prompt',
        reads: ['ctx.site', 'ctx.knowledge', 'ctx.author', 'ctx.linkIndex', 'templates/*.json', 'current keyword row'],
        code: ['engine/prompt-builder.js', 'engine/link-matcher.js'],
        output: 'systemPrompt + userPrompt',
      },
      {
        id: 'generate',
        title: '4. Call model to generate outline or article',
        reads: ['systemPrompt', 'userPrompt', 'API Key / model config'],
        code: ['engine/generator.js'],
        output: 'Raw HTML, SEO metadata, schema, ALT text and publish-pack fields',
      },
      {
        id: 'split-clean-qa',
        title: '5. Split, clean and QA check',
        reads: ['model output', 'brand rules', 'QA rules'],
        code: ['engine/splitter.js', 'engine/cleaner.js', 'engine/qa.js'],
        output: 'clean article HTML + QA report + metadata',
      },
      {
        id: 'write',
        title: '6. Write article and metadata files',
        reads: ['cleanHtml', 'meta', 'qaResult'],
        code: ['engine/task-queue.js', 'engine/meta-writer.js'],
        output: ['sites/<siteId>/outputs/<slug>.html', 'sites/<siteId>/outputs/meta-table.xlsx', 'sites/<siteId>/outputs/queue-state.json'],
      },
    ],
    fileRoles: {
      'site.json': siteFileRole('site.json'),
      'knowledge.json': siteFileRole('knowledge.json'),
      'author.json': siteFileRole('author.json'),
      'links.json': siteFileRole('links.json'),
      'keywords.csv': siteFileRole('keywords.csv'),
      'project-instructions.md': 'Site-level project instructions for brand SOP, writing rules, compliance boundaries, output format and workflow.',
      'templates/article-types.json': 'Article type strategy. Prefer global instruction text to avoid hard-coded titles and openings.',
      'templates/prompt-sections.json': 'Prompt section templates for author statement, observational claims, links, CTA and style guidance.',
      'templates/qa-rules.json': 'QA rules for hard fails, warnings and scoring weights.',
    },
  });
});

router.get('/sites/:siteId/keywords', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    res.json({ keywords: store.getAll() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sites/:siteId/keywords', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    const row = store.add(req.body);
    res.json({ ok: true, row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/sites/:siteId/keywords/:slug', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    const row = store.update(req.params.slug, req.body);
    res.json({ ok: true, row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/sites/:siteId/keywords/:slug', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    store.remove(req.params.slug);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/import-preview', async (req, res) => {
  try {
    const { siteId } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'Body must include files: [{ name, content }]' });
    const expanded = await expandImportFiles(files);
    const previews = await Promise.all(expanded.map((file, index) => previewImportFile(siteId, file, index)));
    res.json({ ok: true, files: previews });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/import-files', async (req, res) => {
  try {
    const { siteId } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'Body must include files: [{ name, content }]' });
    const result = await importSiteFiles(siteId, await expandImportFiles(files));
    stores.delete(siteId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/setup-preview', async (req, res) => {
  try {
    const { siteId } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'Body must include files: [{ name, content }]' });
    const expanded = await expandImportFiles(files);
    const apiConfig = pickApiConfig(req.body || {});
    const previews = [];
    for (let i = 0; i < expanded.length; i++) {
      const file = expanded[i];
      const heuristic = await previewImportFile(siteId, file, i);
      const ai = apiConfig.apiKey ? await classifySetupFileWithAI(file, apiConfig).catch(err => ({ error: err.message })) : null;
      previews.push(normalizeSetupPreview(file, heuristic, ai, i));
    }
    res.json({ ok: true, required: setupRequiredFiles(siteId), files: previews });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/setup-apply', async (req, res) => {
  try {
    const { siteId } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'Body must include selected files' });
    const result = await applySetupFiles(siteId, files);
    stores.delete(siteId);
    res.json({ ok: true, required: setupRequiredFiles(siteId), ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sites/:siteId/keywords/import', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
    if (!csvText) return res.status(400).json({ error: 'Send CSV as plain-text body or { csv: "..." }' });
    const count = store.importCsv(csvText);
    res.json({ ok: true, imported: count, keywords: store.getAll() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sites/:siteId/keywords/export', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.siteId}-keywords.csv"`);
    res.send(store.exportCsv());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sites/:siteId/generate/:slug', async (req, res) => {
  const { siteId, slug } = req.params;
  const apiConfig = pickApiConfig(req.body || {});

  setupSSE(res);
  const send = makeSend(res);

  try {
    const store = await getStore(siteId);
    const queue = await makeQueue(siteId, store);
    store.setStatus(slug, 'queued');

    queue.on('task-start', d => { if (d.slug === slug) send('task-start', d); });
    queue.on('task-done', d => { if (d.slug === slug) send('task-done', d); });

    await queue.run({ slugs: [slug], apiConfig });

    send('done', store.getOne(slug) || {});
    res.end();
  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

router.post('/sites/:siteId/run', async (req, res) => {
  const { siteId } = req.params;
  const { concurrency = 2, onlyFailed = false, slugs = null } = req.body || {};
  const apiConfig = pickApiConfig(req.body || {});

  setupSSE(res);
  const send = makeSend(res);

  try {
    const store = await getStore(siteId);
    const queue = await makeQueue(siteId, store);

    queue.on('queue-start', d => send('queue-start', d));
    queue.on('task-start', d => send('task-start', d));
    queue.on('task-done', d => send('task-done', d));
    queue.on('queue-done', d => send('queue-done', d));

    await queue.run({ concurrency, onlyFailed, slugs, apiConfig });
    send('done', {});
    res.end();
  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

router.post('/sites/:siteId/outline/:slug', async (req, res) => {
  const { siteId, slug } = req.params;
  const apiConfig = pickApiConfig(req.body || {});

  setupSSE(res);
  const send = makeSend(res);

  try {
    const ctx = await loadSiteContext(siteId);
    const store = await getStore(siteId);
    const row = store.getOne(slug);
    if (!row) throw new Error(`Keyword "${slug}" not found`);

    store.setStatus(slug, 'running');
    send('outline-start', { slug, keyword: row.keyword });

    const outline = await generateOutline(ctx, row, {
      apiKey: apiConfig.apiKey || ctx.site.apiKey || process.env.ANTHROPIC_API_KEY,
      endpoint: apiConfig.endpoint,
      model: apiConfig.model,
      maxTokens: apiConfig.maxTokens,
    });

    fs.mkdirSync(ctx.outputDir, { recursive: true });
    fs.mkdirSync(join(ctx.siteDir, 'outlines'), { recursive: true });
    fs.writeFileSync(join(ctx.outputDir, `${slug}.outline.json`), JSON.stringify(outline, null, 2), 'utf-8');
    fs.writeFileSync(join(ctx.siteDir, 'outlines', `${slug}.json`), JSON.stringify(outline, null, 2), 'utf-8');
    store.setStatus(slug, 'outlined', { error: null });

    send('outline-done', { slug, keyword: row.keyword, status: 'outlined', outline });
    res.end();
  } catch (err) {
    const store = await getStore(siteId).catch(() => null);
    store?.setStatus(slug, 'failed', { error: err.message });
    send('error', { message: err.message });
    res.end();
  }
});

router.post('/sites/:siteId/generate-article/:slug', async (req, res) => {
  const { siteId, slug } = req.params;
  const apiConfig = pickApiConfig(req.body || {});

  setupSSE(res);
  const send = makeSend(res);

  try {
    const ctx = await loadSiteContext(siteId);
    const store = await getStore(siteId);
    const row = store.getOne(slug);
    if (!row) throw new Error(`Keyword "${slug}" not found`);

    const outline = readFirstJsonFile([
      join(ctx.outputDir, `${slug}.outline.json`),
      join(ctx.siteDir, 'outlines', `${slug}.json`),
    ]);
    if (!outline) throw new Error('Please generate an outline before generating the article.');

    store.setStatus(slug, 'running');
    send('task-start', { slug, keyword: row.keyword });

    const result = await generateArticleFromOutline(ctx, row, outline, {
      apiKey: apiConfig.apiKey || ctx.site.apiKey || process.env.ANTHROPIC_API_KEY,
      endpoint: apiConfig.endpoint,
      model: apiConfig.model,
      maxTokens: apiConfig.maxTokens,
    });

    fs.writeFileSync(join(ctx.outputDir, `${slug}.html`), result.html, 'utf-8');
    fs.writeFileSync(join(ctx.outputDir, `${slug}.qa.json`), JSON.stringify(result.qa, null, 2), 'utf-8');
    fs.writeFileSync(join(ctx.outputDir, `${slug}.data-pack.json`), JSON.stringify(result.dataPack, null, 2), 'utf-8');
    fs.writeFileSync(join(ctx.outputDir, `${slug}-data-pack.json`), JSON.stringify(result.dataPack, null, 2), 'utf-8');
    await writeMeta(ctx, row, result.qa, result.meta);

    const status = result.qa.pass ? 'done' : 'failed';
    const error = result.qa.pass ? null : result.qa.hardFails.map(f => f.message).join('; ');
    store.setStatus(slug, status, {
      qaScore: result.qa.score,
      wordCount: result.qa.wordCount,
      error,
    });

    send('task-done', {
      slug,
      keyword: row.keyword,
      status,
      qaScore: result.qa.score,
      wordCount: result.qa.wordCount,
      error,
    });
    res.end();
  } catch (err) {
    const store = await getStore(siteId).catch(() => null);
    store?.setStatus(slug, 'failed', { error: err.message });
    send('error', { message: err.message });
    res.end();
  }
});

router.post('/sites/:siteId/reset', async (req, res) => {
  try {
    const store = await getStore(req.params.siteId);
    store.resetStatus(req.body?.slugs || null);
    res.json({ ok: true, keywords: store.getAll() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sites/:siteId/publish-pack/:slug', async (req, res) => {
  try {
    res.json(await buildPublishPack(req.params.siteId, req.params.slug));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sites/:siteId/outlines/:slug', (req, res) => {
  try {
    const siteDir = getSiteDir(req.params.siteId);
    const outline = readFirstJsonFile([
      join(siteDir, 'outputs', `${req.params.slug}.outline.json`),
      join(siteDir, 'outlines', `${req.params.slug}.json`),
    ]);
    if (!outline) return res.status(404).json({ error: 'Outline not found' });
    res.json({ outline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sites/:siteId/qa/:slug', (req, res) => {
  try {
    const siteDir = getSiteDir(req.params.siteId);
    const qa = readJsonFile(join(siteDir, 'outputs', `${req.params.slug}.qa.json`));
    if (!qa) return res.status(404).json({ error: 'QA report not found' });
    res.json({ qa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sites/:siteId/data-pack/:slug', async (req, res) => {
  try {
    const { siteId, slug } = req.params;
    const siteDir = getSiteDir(siteId);
    const outputDir = join(siteDir, 'outputs');
    const outline = readFirstJsonFile([
      join(outputDir, `${slug}.outline.json`),
      join(siteDir, 'outlines', `${slug}.json`),
    ]);
    const qa = readJsonFile(join(outputDir, `${slug}.qa.json`));
    const dataPack = readFirstJsonFile([
      join(outputDir, `${slug}.data-pack.json`),
      join(outputDir, `${slug}-data-pack.json`),
    ]);
    const publishPack = fs.existsSync(join(outputDir, `${slug}.html`))
      ? await buildPublishPack(siteId, slug)
      : null;
    res.json({ outline, qa, dataPack, publishPack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sites/:siteId/articles/:slug', (req, res) => {
  const p = join(SITES_DIR, req.params.siteId, 'outputs', `${req.params.slug}.html`);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Article not found' });
  const download = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.slug}.html"`);
  }
  res.send(fs.readFileSync(p, 'utf-8'));
});

router.get('/sites/:siteId/export', (req, res) => {
  const dir = join(SITES_DIR, req.params.siteId, 'outputs');
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No outputs yet' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.siteId}.zip"`);
  const arc = archiver('zip', { zlib: { level: 9 } });
  arc.pipe(res);
  fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => arc.file(join(dir, f), { name: f }));
  arc.finalize();
});

router.get('/sites/:siteId/meta-table', (req, res) => {
  const p = join(SITES_DIR, req.params.siteId, 'outputs', 'meta-table.xlsx');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'No meta-table yet' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.siteId}-meta.xlsx"`);
  res.sendFile(p);
});

async function createSiteHandler(req, res) {
  try {
    const input = req.body || {};
    const siteId = slugify(input.siteId || input.siteName || '');
    if (!siteId) return res.status(400).json({ error: 'siteId is required' });
    const siteDir = join(SITES_DIR, siteId);
    if (fs.existsSync(siteDir)) return res.status(400).json({ error: `Site already exists: ${siteId}` });

    fs.mkdirSync(join(siteDir, 'outputs'), { recursive: true });
    fs.mkdirSync(join(siteDir, 'outlines'), { recursive: true });
    fs.writeFileSync(join(siteDir, 'site.json'), JSON.stringify(makeDefaultSite(input, siteId), null, 2), 'utf-8');
    fs.writeFileSync(join(siteDir, 'knowledge.json'), JSON.stringify(makeDefaultKnowledge(), null, 2), 'utf-8');
    fs.writeFileSync(join(siteDir, 'author.json'), JSON.stringify(makeDefaultAuthor(input), null, 2), 'utf-8');
    fs.writeFileSync(join(siteDir, 'links.json'), JSON.stringify(makeDefaultLinks(), null, 2), 'utf-8');
    fs.writeFileSync(join(siteDir, 'style-reference.json'), JSON.stringify(makeDefaultStyleReference(), null, 2), 'utf-8');
    fs.writeFileSync(join(siteDir, 'project-instructions.md'), defaultProjectInstructions(input), 'utf-8');
    fs.writeFileSync(join(siteDir, 'keywords.csv'), defaultKeywordsCsv(), 'utf-8');
    stores.delete(siteId);
    res.json({ ok: true, siteId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function expandImportFiles(files) {
  const out = [];
  for (const file of files) {
    const rawName = String(file.relativePath || file.name || '');
    if (/\.zip$/i.test(rawName)) {
      const zip = await JSZip.loadAsync(decodeImportFile(file));
      const entries = Object.values(zip.files).filter(entry => !entry.dir);
      for (const entry of entries) {
        const buf = await entry.async('nodebuffer');
        out.push({
          name: path.basename(entry.name),
          relativePath: entry.name,
          encoding: isBinaryImport(entry.name) ? 'base64' : 'utf8',
          content: isBinaryImport(entry.name) ? buf.toString('base64') : buf.toString('utf-8'),
          sourceArchive: rawName,
        });
      }
    } else {
      out.push(file);
    }
  }
  return out;
}

async function previewImportFile(siteId, file, index = 0) {
  const siteDir = getSiteDir(siteId);
  const rawName = String(file.relativePath || file.name || '').replace(/\\/g, '/');
  const baseName = path.basename(rawName).toLowerCase();
  const dirName = path.dirname(rawName).replace(/\\/g, '/').toLowerCase();
  const buf = decodeImportFile(file);
  const text = buf.toString('utf-8').replace(/^\uFEFF/, '');
  const preview = {
    id: String(index),
    name: file.name || path.basename(rawName),
    relativePath: rawName,
    sourceArchive: file.sourceArchive || '',
    encoding: file.encoding || 'utf8',
    content: file.content || file.text || '',
    action: 'ignored',
    target: '',
    status: 'unknown',
    reason: '',
    duplicate: false,
  };

  try {
    if (baseName === 'keywords.csv' || (baseName.endsWith('.xlsx') && baseName.includes('keyword'))) {
      const csv = baseName.endsWith('.xlsx') ? await workbookToCsv(buf) : text;
      const report = await previewKeywords(siteId, csv);
      return {
        ...preview,
        action: baseName.endsWith('.xlsx') ? 'keywords-xlsx-import' : 'keywords-import',
        target: 'keywords.csv',
        status: report.added ? 'ready' : 'skip',
        reason: `${report.added} new, ${report.skipped} duplicate`,
        keywordReport: report,
        duplicate: report.added === 0,
      };
    }

    if (['site.json', 'author.json', 'knowledge.json', 'links.json', 'style-reference.json'].includes(baseName)) {
      JSON.parse(text);
      return { ...preview, ...previewWrite(siteDir, baseName, 'site-config-write', text) };
    }
    if (baseName === 'project-instructions.md') {
      return { ...preview, ...previewWrite(siteDir, 'project-instructions.md', 'project-instructions-write', text) };
    }
    if ((dirName.includes('templates') || ['article-types.json', 'prompt-sections.json', 'qa-rules.json'].includes(baseName)) && ['article-types.json', 'prompt-sections.json', 'qa-rules.json'].includes(baseName)) {
      JSON.parse(text);
      return { ...preview, ...previewWrite(join(siteDir, 'templates'), baseName, 'site-template-write', text, `templates/${baseName}`) };
    }
    if (baseName === 'outline.json' || baseName.endsWith('.outline.json')) {
      const outline = JSON.parse(text);
      const slug = slugify(outline.slug || outline.urlslug || outline.keyword || path.basename(baseName, '.json')) || 'outline-template';
      return { ...preview, ...previewWrite(join(siteDir, 'outlines'), `${slug}.json`, 'outline-write', JSON.stringify(outline, null, 2), `outlines/${slug}.json`) };
    }
    if (baseName === 'data-pack.json' || baseName.endsWith('data-pack.json')) {
      const pack = JSON.parse(text);
      const slug = slugify(pack.slug || pack.urlslug || pack.keywordRow?.urlslug || pack.keyword || path.basename(baseName, '.json')) || 'data-pack-template';
      return { ...preview, ...previewWrite(join(siteDir, 'outputs'), `${slug}.data-pack.json`, 'data-pack-write', JSON.stringify(pack, null, 2), `outputs/${slug}.data-pack.json`) };
    }
    if (isDocsImport(baseName, dirName)) {
      return { ...preview, ...previewWrite(join(siteDir, 'docs'), baseName, 'docs-write', text, `docs/${baseName}`) };
    }
    return { ...preview, status: 'ignored', reason: 'No matching importer for this file name.' };
  } catch (err) {
    return { ...preview, status: 'error', reason: err.message };
  }
}

function previewWrite(dir, filename, action, incoming, displayTarget = filename) {
  const targetPath = join(dir, filename);
  const exists = fs.existsSync(targetPath);
  const same = exists && sameImportContent(filename, fs.readFileSync(targetPath, 'utf-8'), incoming);
  return {
    action,
    target: displayTarget,
    status: same ? 'skip' : exists ? 'overwrite' : 'ready',
    duplicate: same,
    reason: same ? 'Same content already exists' : exists ? 'Will overwrite existing file' : 'New file',
  };
}

function sameImportContent(filename, a, b) {
  if (/\.json$/i.test(filename)) {
    try {
      return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    } catch {}
  }
  const norm = value => String(value || '').replace(/\r\n/g, '\n').trim();
  return norm(a) === norm(b);
}

function isDocsImport(baseName, dirName = '') {
  if (baseName === '.gitkeep') return false;
  if (baseName === 'keywords-field-guide.json' || baseName === 'readme.md') return true;
  if (dirName.includes('reports')) return /\.(csv|json|md|txt)$/i.test(baseName);
  return /(?:report|manifest|inventory|migration|notes|actions|field-guide)/i.test(baseName) && /\.(csv|json|md|txt)$/i.test(baseName);
}

function setupRequiredFiles(siteId) {
  const siteDir = getSiteDir(siteId);
  const items = [
    ['site.json', 'Site variables', 'Site name, domain, language, positioning, audience, tone, mustSay and mustNotSay.'],
    ['author.json', 'Author profile and story bank', 'Author identity, background, writing style, first-hand experience story material.'],
    ['knowledge.json', 'Category knowledge base', 'Glossary, authoritative facts, FAQ, compliance boundaries and buyer concerns.'],
    ['links.json', 'Internal link library', 'Topic hubs, product pages, category pages, and published blog posts.'],
    ['style-reference.json', 'HTML style reference', 'Article components, FAQ accordion, CTA, quote blocks, tables, and brand visual rules.'],
    ['project-instructions.md', 'Project instructions', 'Brand SOP, writing rules, compliance boundaries, output format and workflow instructions.'],
    ['keywords.csv', 'Keyword plan', 'Keyword, slug, article type, target word count, direction and internal link targets.'],
  ];
  return items.map(([file, label, description]) => {
    const filePath = join(siteDir, file);
    const exists = fs.existsSync(filePath);
    return {
      file,
      label,
      description,
      exists,
      size: exists ? fs.statSync(filePath).size : 0,
    };
  });
}

async function classifySetupFileWithAI(file, apiConfig = {}) {
  const rawName = String(file.relativePath || file.name || '').replace(/\\/g, '/');
  const baseName = path.basename(rawName).toLowerCase();
  const buf = decodeImportFile(file);
  const text = baseName.endsWith('.xlsx') ? await workbookToCsv(buf) : buf.toString('utf-8').replace(/^\uFEFF/, '');
  const sample = summarize(text, 12000);
  const systemPrompt = `You classify and convert uploaded website onboarding files for a content-engine app.
Return only valid JSON. No markdown.

Allowed targets:
- site.json
- author.json
- knowledge.json
- links.json
- style-reference.json
- project-instructions.md
- keywords.csv
- templates/article-types.json
- templates/prompt-sections.json
- templates/qa-rules.json
- docs/<safe-file-name>
- ignore

If the file is irrelevant, duplicated, a logo/image/binary asset, or cannot support any target, use target "ignore".
For JSON targets, mappedContent must be an object matching the target's purpose.
For project-instructions.md and keywords.csv, mappedContent must be a string.
For docs/*, mappedContent may be a string or object.
Do not invent website facts; extract and normalize only what is present.`;
  const userPrompt = `File path: ${rawName}

Content sample:
${sample}

Return this JSON shape:
{
  "target": "site.json | author.json | knowledge.json | links.json | style-reference.json | project-instructions.md | keywords.csv | templates/article-types.json | templates/prompt-sections.json | templates/qa-rules.json | docs/name.ext | ignore",
  "module": "site | author | knowledge | links | style | project | keywords | template | docs | ignore",
  "confidence": 0.0,
  "reason": "short reason",
  "mappedContent": {}
}`;
  const textOut = await callTextModel(systemPrompt, userPrompt, { maxTokens: 4500, ...apiConfig });
  return parseJsonFromText(textOut);
}

function normalizeSetupPreview(file, heuristic, ai, index = 0) {
  const rawName = String(file.relativePath || file.name || '').replace(/\\/g, '/');
  const aiTarget = ai && !ai.error ? String(ai.target || '').trim() : '';
  const target = aiTarget && aiTarget !== 'ignore' ? sanitizeSetupTarget(aiTarget, rawName) : heuristic.target;
  const module = ai && !ai.error ? ai.module || targetToSetupModule(target) : targetToSetupModule(heuristic.target);
  const status = aiTarget === 'ignore' || heuristic.status === 'ignored'
    ? 'ignored'
    : heuristic.status === 'error'
      ? 'review'
      : heuristic.status || 'review';
  return {
    id: String(index),
    name: file.name || path.basename(rawName),
    relativePath: rawName,
    sourceArchive: file.sourceArchive || '',
    encoding: file.encoding || 'utf8',
    content: file.content || file.text || '',
    target,
    module,
    status,
    confidence: Number(ai?.confidence ?? (heuristic.status === 'ignored' ? 0.25 : 0.75)),
    reason: ai?.reason || ai?.error || heuristic.reason || '',
    aiError: ai?.error || '',
    mappedContent: ai && !ai.error ? ai.mappedContent : null,
    heuristic,
  };
}

function sanitizeSetupTarget(target, rawName = '') {
  const clean = String(target || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const allowed = new Set(['site.json', 'author.json', 'knowledge.json', 'links.json', 'style-reference.json', 'project-instructions.md', 'keywords.csv']);
  if (allowed.has(clean)) return clean;
  if (/^templates\/(article-types|prompt-sections|qa-rules)\.json$/.test(clean)) return clean;
  if (clean.startsWith('docs/')) return 'docs/' + path.basename(clean);
  if (clean === 'ignore') return 'ignore';
  if (/\.md$|\.txt$|\.csv$|\.json$/i.test(rawName)) return 'docs/' + path.basename(rawName);
  return 'ignore';
}

function targetToSetupModule(target = '') {
  if (target === 'site.json') return 'site';
  if (target === 'author.json') return 'author';
  if (target === 'knowledge.json') return 'knowledge';
  if (target === 'links.json') return 'links';
  if (target === 'style-reference.json') return 'style';
  if (target === 'project-instructions.md') return 'project';
  if (target === 'keywords.csv') return 'keywords';
  if (target.startsWith('templates/')) return 'template';
  if (target.startsWith('docs/')) return 'docs';
  return 'ignore';
}

async function applySetupFiles(siteId, files) {
  const siteDir = getSiteDir(siteId);
  const summary = [];
  const errors = [];
  for (const file of files) {
    try {
      const target = sanitizeSetupTarget(file.target || '', file.relativePath || file.name || '');
      if (!target || target === 'ignore') {
        summary.push({ file: file.relativePath || file.name, action: 'ignored', target: 'ignore' });
        continue;
      }
      const raw = decodeImportFile(file).toString('utf-8').replace(/^\uFEFF/, '');
      const mapped = file.mappedContent;
      if (target === 'keywords.csv') {
        const csv = typeof mapped === 'string' && mapped.trim()
          ? mapped
          : /\.xlsx$/i.test(file.relativePath || file.name || '')
            ? await workbookToCsv(decodeImportFile(file))
            : raw;
        const report = await importKeywordsCsvDirect(siteId, csv);
        summary.push({ file: file.relativePath || file.name, action: 'keywords-imported', target, ...report });
        continue;
      }
      if (target === 'project-instructions.md') {
        fs.writeFileSync(join(siteDir, target), typeof mapped === 'string' ? mapped : raw, 'utf-8');
        summary.push({ file: file.relativePath || file.name, action: 'written', target });
        continue;
      }
      if (target.startsWith('templates/')) {
        fs.mkdirSync(join(siteDir, 'templates'), { recursive: true });
        const content = mapped && typeof mapped === 'object' ? mapped : JSON.parse(raw);
        fs.writeFileSync(join(siteDir, target), JSON.stringify(content, null, 2), 'utf-8');
        summary.push({ file: file.relativePath || file.name, action: 'written', target });
        continue;
      }
      if (target.startsWith('docs/')) {
        fs.mkdirSync(join(siteDir, 'docs'), { recursive: true });
        const content = mapped && typeof mapped === 'object' ? JSON.stringify(mapped, null, 2) : (typeof mapped === 'string' ? mapped : raw);
        fs.writeFileSync(join(siteDir, target), content, 'utf-8');
        summary.push({ file: file.relativePath || file.name, action: 'written', target });
        continue;
      }
      if (['site.json', 'author.json', 'knowledge.json', 'links.json', 'style-reference.json'].includes(target)) {
        const current = fs.existsSync(join(siteDir, target)) ? JSON.parse(fs.readFileSync(join(siteDir, target), 'utf-8')) : {};
        const content = mapped && typeof mapped === 'object' ? mergeObjects(current, mapped) : JSON.parse(raw);
        fs.writeFileSync(join(siteDir, target), JSON.stringify(content, null, 2), 'utf-8');
        summary.push({ file: file.relativePath || file.name, action: 'written', target });
        continue;
      }
      errors.push({ file: file.relativePath || file.name, error: 'Unsupported setup target: ' + target });
    } catch (err) {
      errors.push({ file: file.relativePath || file.name, error: err.message });
    }
  }
  return { summary, errors, filesApplied: summary.filter(s => s.action !== 'ignored').length };
}

function mergeObjects(a, b) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return b;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) out[key] = value.length ? value : out[key];
    else if (typeof value === 'object') out[key] = mergeObjects(out[key], value);
    else out[key] = value;
  }
  return out;
}

async function previewKeywords(siteId, csvText) {
  const siteDir = getSiteDir(siteId);
  const csvPath = join(siteDir, 'keywords.csv');
  const existingRows = readKeywordRows(fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '');
  const incomingRows = readKeywordRows(csvText);
  const existingSlugs = new Set(existingRows.map(r => String(r.urlslug || '').toLowerCase()));
  const existingKeywords = new Set(existingRows.map(r => String(r.keyword || '').trim().toLowerCase()).filter(Boolean));
  let added = 0;
  let skipped = 0;
  for (const row of incomingRows) {
    const slug = String(row.urlslug || slugify(row.keyword)).toLowerCase();
    const keyword = String(row.keyword || '').trim().toLowerCase();
    if (existingSlugs.has(slug) || (keyword && existingKeywords.has(keyword))) skipped++;
    else {
      added++;
      existingSlugs.add(slug);
      if (keyword) existingKeywords.add(keyword);
    }
  }
  return { added, skipped, total: incomingRows.length };
}

async function importSiteFiles(siteId, files) {
  const siteDir = getSiteDir(siteId);
  const summary = [];
  const errors = [];
  let importedKeywords = 0;
  let skippedDuplicates = 0;

  for (const file of files) {
    try {
      const preview = await previewImportFile(siteId, file, summary.length + errors.length);
      if (preview.status === 'skip') {
        skippedDuplicates += preview.keywordReport?.skipped || 1;
        summary.push({ file: preview.relativePath, action: 'skipped-duplicate', target: preview.target, reason: preview.reason });
        continue;
      }
      if (preview.status === 'ignored' || preview.status === 'error') {
        errors.push({ file: preview.relativePath, error: preview.reason });
        continue;
      }

      const rawName = String(file.relativePath || file.name || '').replace(/\\/g, '/');
      const baseName = path.basename(rawName).toLowerCase();
      const dirName = path.dirname(rawName).replace(/\\/g, '/').toLowerCase();
      const buf = decodeImportFile(file);
      const text = buf.toString('utf-8').replace(/^\uFEFF/, '');

      if (baseName === 'keywords.csv') {
        const report = await importKeywordsCsvDirect(siteId, text);
        importedKeywords += report.added;
        skippedDuplicates += report.skipped;
        summary.push({ file: rawName, action: 'keywords-imported', target: 'keywords.csv', ...report });
        continue;
      }

      if (baseName.endsWith('.xlsx') && baseName.includes('keyword')) {
        const report = await importKeywordsCsvDirect(siteId, await workbookToCsv(buf));
        importedKeywords += report.added;
        skippedDuplicates += report.skipped;
        summary.push({ file: rawName, action: 'keywords-xlsx-imported', target: 'keywords.csv', ...report });
        continue;
      }

      if (['site.json', 'author.json', 'knowledge.json', 'links.json', 'style-reference.json'].includes(baseName)) {
        fs.writeFileSync(join(siteDir, baseName), JSON.stringify(JSON.parse(text), null, 2), 'utf-8');
        summary.push({ file: rawName, action: 'site-config-written', target: baseName, status: preview.status });
        continue;
      }

      if (baseName === 'project-instructions.md') {
        fs.writeFileSync(join(siteDir, 'project-instructions.md'), text, 'utf-8');
        summary.push({ file: rawName, action: 'project-instructions-written', target: 'project-instructions.md', status: preview.status });
        continue;
      }

      if ((dirName.includes('templates') || ['article-types.json', 'prompt-sections.json', 'qa-rules.json'].includes(baseName)) && ['article-types.json', 'prompt-sections.json', 'qa-rules.json'].includes(baseName)) {
        fs.mkdirSync(join(siteDir, 'templates'), { recursive: true });
        fs.writeFileSync(join(siteDir, 'templates', baseName), JSON.stringify(JSON.parse(text), null, 2), 'utf-8');
        summary.push({ file: rawName, action: 'site-template-written', target: 'templates/' + baseName, status: preview.status });
        continue;
      }

      if (baseName === 'outline.json' || baseName.endsWith('.outline.json')) {
        const outline = JSON.parse(text);
        const slug = slugify(outline.slug || outline.urlslug || outline.keyword || path.basename(baseName, '.json')) || 'outline-template';
        fs.mkdirSync(join(siteDir, 'outlines'), { recursive: true });
        fs.writeFileSync(join(siteDir, 'outlines', slug + '.json'), JSON.stringify(outline, null, 2), 'utf-8');
        summary.push({ file: rawName, action: 'outline-written', target: 'outlines/' + slug + '.json', status: preview.status });
        continue;
      }

      if (baseName === 'data-pack.json' || baseName.endsWith('data-pack.json')) {
        const pack = JSON.parse(text);
        const slug = slugify(pack.slug || pack.urlslug || pack.keywordRow?.urlslug || pack.keyword || path.basename(baseName, '.json')) || 'data-pack-template';
        fs.mkdirSync(join(siteDir, 'outputs'), { recursive: true });
        fs.writeFileSync(join(siteDir, 'outputs', slug + '.data-pack.json'), JSON.stringify(pack, null, 2), 'utf-8');
        summary.push({ file: rawName, action: 'data-pack-written', target: 'outputs/' + slug + '.data-pack.json', status: preview.status });
        continue;
      }

      if (isDocsImport(baseName, dirName)) {
        fs.mkdirSync(join(siteDir, 'docs'), { recursive: true });
        fs.writeFileSync(join(siteDir, 'docs', baseName), text, 'utf-8');
        summary.push({ file: rawName, action: 'docs-written', target: 'docs/' + baseName, status: preview.status });
        continue;
      }

      errors.push({ file: rawName, error: 'No matching importer for this file name.' });
    } catch (err) {
      errors.push({ file: file.name || file.relativePath || 'unknown', error: err.message });
    }
  }

  return { importedKeywords, skippedDuplicates, filesImported: summary.filter(item => item.action !== 'skipped-duplicate').length, summary, errors };
}

async function importKeywordsCsvDirect(siteId, csvText) {
  const siteDir = getSiteDir(siteId);
  const csvPath = join(siteDir, 'keywords.csv');
  const existingRows = readKeywordRows(fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '');
  const incomingRows = readKeywordRows(csvText);
  const existingSlugs = new Set(existingRows.map(r => String(r.urlslug || '').toLowerCase()));
  const existingKeywords = new Set(existingRows.map(r => String(r.keyword || '').trim().toLowerCase()).filter(Boolean));
  const merged = [...existingRows];
  let added = 0;
  let skipped = 0;
  for (const row of incomingRows) {
    const slug = String(row.urlslug || '').toLowerCase();
    const keyword = String(row.keyword || '').trim().toLowerCase();
    if (existingSlugs.has(slug) || (keyword && existingKeywords.has(keyword))) {
      skipped++;
      continue;
    }
    merged.push(row);
    existingSlugs.add(slug);
    if (keyword) existingKeywords.add(keyword);
    added++;
  }
  fs.writeFileSync(csvPath, keywordRowsToCsv(merged), 'utf-8');
  stores.delete(siteId);
  return { added, skipped, total: incomingRows.length };
}

function decodeImportFile(file) {
  if (file.encoding === 'base64') return Buffer.from(String(file.content || ''), 'base64');
  return Buffer.from(String(file.content ?? file.text ?? ''), 'utf-8');
}

function readKeywordRows(csvText) {
  try {
    return parse(csvText || '', { columns: true, skip_empty_lines: true, trim: true }).map(row => {
      const out = {};
      for (const [key, value] of Object.entries(row || {})) {
        out[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] = String(value || '').trim();
      }
      if (!out.urlslug) out.urlslug = slugify(out.keyword);
      return out;
    }).filter(row => row.keyword && !/^\[.*\]$/.test(row.keyword) && !/^field\s*guide$/i.test(row.keyword));
  } catch {
    return [];
  }
}

function keywordRowsToCsv(rows) {
  const columns = ['keyword','urlslug','priority','intent','articletype','targetwordcount','secondarykeywords','variants','direction','internallinkingurls','volume','kd','cannibalcheck','pillartarget','blogid'];
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(col => csvCell(row[col] || '')).join(','));
  return lines.join('\n') + '\n';
}

function isBinaryImport(name) {
  return /\.xlsx$/i.test(name);
}

async function workbookToCsv(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('XLSX has no worksheets');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    rows.push(row.values.slice(1).map(value => csvCell(value == null ? '' : String(value))).join(','));
  });
  return rows.join('\n') + '\n';
}

function csvCell(value) {
  const out = String(value ?? '');
  return /[",\n]/.test(out) ? '"' + out.replace(/"/g, '""') + '"' : out;
}

async function getStore(siteId) {
  if (!stores.has(siteId)) {
    const ctx = await loadSiteContext(siteId);
    const store = new KeywordStore(ctx);
    store.load();
    stores.set(siteId, store);
  }
  return stores.get(siteId);
}

async function makeQueue(siteId, store) {
  const ctx = await loadSiteContext(siteId);
  return new TaskQueue(ctx, store);
}

function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function makeSend(res) {
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function getSiteDir(siteId) {
  const safe = slugify(siteId);
  if (!safe || safe !== siteId) throw new Error('Invalid siteId');
  const siteDir = join(SITES_DIR, safe);
  if (!fs.existsSync(siteDir)) throw new Error(`Site not found: ${safe}`);
  return siteDir;
}

function getConfigPath(siteId, file) {
  const filename = CONFIG_FILES[file];
  if (!filename) throw new Error('Invalid config file');
  return join(getSiteDir(siteId), filename);
}

function getTemplateSpec(file) {
  const spec = TEMPLATE_FILES[file];
  if (!spec) throw new Error('Invalid template file');
  return spec;
}

function pickApiConfig(input = {}) {
  const out = {};
  for (const key of ['apiKey', 'endpoint', 'model', 'maxTokens', 'timeoutMs']) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') out[key] = input[key];
  }
  if (out.maxTokens) out.maxTokens = Number(out.maxTokens);
  if (out.timeoutMs) out.timeoutMs = Number(out.timeoutMs);
  return out;
}

function normalizeEndpoint(endpoint) {
  const raw = String(endpoint || '').replace(/\/+$/, '');
  if (/\/anthropic$/i.test(raw)) return `${raw}/v1/messages`;
  if (/\/anthropic\/v1$/i.test(raw)) return `${raw}/messages`;
  if (/\/v1$/i.test(raw)) return `${raw}/chat/completions`;
  return raw;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
}

function defaultKeywordsCsv() {
  return 'keyword,urlslug,priority,intent,articletype,targetwordcount,secondarykeywords,variants,direction,internallinkingurls,volume,kd,cannibalcheck,pillartarget,blogid\n';
}

function defaultProjectInstructions(input = {}) {
  const siteName = input.siteName || input.siteId || 'this site';
  const language = input.language || 'en';
  const positioning = input.positioning || '';
  return [
    `# Site Project Instructions 闂?${siteName}`,
    '',
    `Write reader-facing content in ${language}. Configuration notes may be written in Chinese or any internal working language.`,
    positioning ? `Site positioning: ${positioning}` : 'Site positioning: [fill in the audience, problem, and conversion goal].',
    '',
    'Use this file for site-specific writing rules that should behave like Claude Project instructions: brand voice, claim boundaries, product-line rules, EEAT requirements, internal-link rules, and output requirements.',
    '',
  ].join('\n');
}

function makeDefaultSite(input, siteId) {
  return {
    siteId,
    siteName: input.siteName || siteId,
    domain: input.domain || '',
    language: input.language || 'en',
    positioning: input.positioning || '',
    targetAudience: splitList(input.targetAudience || input.audience || ''),
    brandRole: input.brandRole || '',
    conversionGoal: input.conversionGoal || '',
    mustSay: splitList(input.mustSay || ''),
    mustNotSay: splitList(input.mustNotSay || ''),
    writingStyle: {
      tone: input.tone || '',
      sentenceStyle: '',
      avoidStyle: [],
    },
    internalLinkPriority: ['pillarPages', 'categoryPages', 'productPages', 'blogPosts'],
  };
}

function makeDefaultKnowledge() {
  return {
    terminology: [],
    authorityFacts: [],
    buyerFAQ: [],
    buyerQuestions: [],
    objections: [],
    sellingPoints: [],
    forbiddenClaims: [],
    requiredClaims: [],
    competitorContext: {},
  };
}

function makeDefaultAuthor(input) {
  return {
    name: input.authorName || '',
    title: input.authorTitle || '',
    background: '',
    writingStyleNotes: '',
    storyBank: [],
  };
}

function makeDefaultLinks() {
  return {
    pillarPages: [],
    categoryPages: [],
    blogPosts: [],
    productPages: [],
    trustPages: [],
  };
}

function makeDefaultStyleReference() {
  return {
    sourceUrl: '',
    sourceType: 'homepage',
    extractedDate: '',
    extractedStyle: {
      layout: '',
      articleContainer: '',
      typography: { h1: '', h2: '', h3: '', p: '', ul: '', ol: '', table: '' },
      components: [],
      cssConventions: '',
      articleStructure: '',
      do: [],
      dont: [],
    },
    htmlRulesForGeneration: [],
    sampleBlocks: {
      articleIntro: '',
      faqBlock: '',
      productCard: '',
      comparisonTable: '',
      ctaBlock: '',
      authorBlock: '',
      stepBlock: '',
      sectionGrid: '',
      relatedLinks: '',
      breadcrumb: '',
    },
  };
}

function siteFileRole(name) {
  return {
    'site.json': 'Core website variables used for brand positioning, domain, language, audience, tone and expression rules.',
    'knowledge.json': 'Category knowledge base used for terms, facts, FAQ, buyer concerns and compliance boundaries.',
    'author.json': 'Author identity, style, background and storyBank used for publish-ready first-hand experience.',
    'links.json': 'Internal link library used to choose topic hubs, product/category pages and related posts.',
    'keywords.csv': 'Keyword task table with article type, slug, target word count, direction and link targets.',
    'style-reference.json': 'HTML style brief used to guide article structure, components and brand-matched formatting.',
    'project-instructions.md': 'Site-level project instructions for writing workflow, SOP, compliance and output format.',
  }[name] || '';
}

async function generateOutline(ctx, row, apiConfig = {}) {
  const { systemPrompt, userPrompt, typeKey, typeConfig } = buildOutlinePrompt(ctx, row);

  const text = await callTextModel(systemPrompt, userPrompt, {
    maxTokens: 3500,
    ...apiConfig,
  });
  const parsed = parseJsonFromText(text);
  return normalizeOutline(parsed, row, typeKey, typeConfig);
}

async function generateArticleFromOutline(ctx, row, outline, apiConfig = {}) {
  const prompt = buildArticlePrompt(ctx, row, outline);

  const genResult = await generate(prompt.systemPrompt, prompt.userPrompt, {
    ...apiConfig,
    apiKey: apiConfig.apiKey || ctx.site.apiKey || process.env.ANTHROPIC_API_KEY,
  });

  if (!genResult.complete) {
    throw new Error(genResult.error || 'Generation incomplete - output may be truncated');
  }

  const html = clean(genResult.html);
  const qa = validate(html, genResult.meta, ctx, row);
  const dataPack = {
    slug: row.urlslug,
    keyword: row.keyword,
    outline,
    articleType: prompt.typeKey,
    relevantLinks: prompt.relevantLinks,
    generatedAt: new Date().toISOString(),
    prompts: {
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
    },
    meta: genResult.meta,
    qa,
    tokenCount: genResult.tokenCount,
    warnings: genResult.warnings || [],
  };

  return { html, meta: genResult.meta, qa, dataPack };
}

async function callTextModel(systemPrompt, userPrompt, cfg = {}) {
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('No API key found. Set ANTHROPIC_API_KEY or enter a key in the UI.');

  const endpoint = normalizeEndpoint(cfg.endpoint || 'https://api.anthropic.com/v1/messages');
  const model = cfg.model || 'claude-sonnet-4-20250514';
  const maxTokens = cfg.maxTokens || 3500;
  const isAnthropic = endpoint.includes('anthropic.com') || endpoint.includes('/anthropic');
  const isXiaomi = endpoint.includes('xiaomimimo.com');
  const headers = { 'Content-Type': 'application/json' };
  let body;

  if (isAnthropic) {
    if (isXiaomi) headers.Authorization = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${errText.slice(0, 500)}`);
  }
  const data = await response.json();
  const text =
    data.content?.map(part => part.text || '').join('') ||
    data.choices?.[0]?.message?.content ||
    data.output_text ||
    data.text ||
    '';
  if (!text.trim()) throw new Error('Empty outline response from API');
  return text;
}

function parseJsonFromText(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Outline response did not contain valid JSON');
    return JSON.parse(match[0]);
  }
}

function normalizeOutline(value, row, typeKey, typeConfig) {
  const outline = value && typeof value === 'object' ? value : {};
  const hasSections = Array.isArray(outline.sections) && outline.sections.length;
  if (hasSections) {
    return {
      slug: outline.slug || row.urlslug,
      keyword: outline.keyword || row.keyword,
      articleType: outline.articleType || typeKey,
      searchIntent: outline.searchIntent || row.intent || '',
      workingTitle: outline.workingTitle || outline.title || outline.schema?.headline || row.keyword,
      targetWordCount: outline.targetWordCount || row.targetwordcount || typeConfig?.wordRange?.join('-') || '',
      readerPromise: outline.readerPromise || '',
      sections: outline.sections,
      faq: outline.faq || [],
      cta: outline.cta || '',
      qaRisks: outline.qaRisks || [],
      rawModelOutline: outline,
    };
  }

  const headline = outline.schema?.headline || outline.seoTitles?.[0] || row.keyword;
  return {
    slug: row.urlslug,
    keyword: row.keyword,
    articleType: typeKey,
    searchIntent: row.intent || '',
    workingTitle: headline,
    targetWordCount: row.targetwordcount || typeConfig?.wordRange?.join('-') || '',
    readerPromise: outline.metaDescription || `Help the reader understand ${row.keyword} and choose the right next step.`,
    sections: fallbackOutlineSections(row, typeKey),
    faq: [
      { question: `What should I know before choosing ${row.keyword}?`, answerIntent: 'Answer with the site knowledge base, buyer concerns, and practical next-step guidance.' },
      { question: `How should I evaluate ${row.keyword} before making a decision?`, answerIntent: 'Use verified facts, brand rules, and relevant product/category context.' },
    ],
    cta: 'Guide the reader to the most relevant category, product, pillar page, or trust page.',
    qaRisks: outline.qaRisks || [
      'Confirm all claims are supported by the knowledge base.',
      'Check difficulty and time guidance against site rules.',
      'Use internal links naturally and accurately.',
    ],
    rawModelOutline: outline,
    normalizedFromMetadata: true,
  };
}

function fallbackOutlineSections(row, typeKey) {
  const kw = row.keyword || 'the topic';
  const direction = row.direction || '';
  const base = [
    {
      level: 'H2',
      heading: `What ${kw} means for this project`,
      purpose: 'Open with a direct answer and frame the reader decision.',
      keyPoints: [direction || 'Clarify the search intent.', 'Name the best use case and skill level.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'What to check before you decide',
      purpose: 'Set honest expectations before product or category consideration.',
      keyPoints: ['Use only verified facts from the knowledge base.', 'Address common buyer concerns.', 'Avoid unsupported or generic claims.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'How to choose the right next step',
      purpose: 'Move from education to buying criteria.',
      keyPoints: ['Compare the relevant options by use case, constraints, and trust signals.', 'Use concrete criteria instead of generic praise.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'Common mistakes to avoid',
      purpose: 'Add practical usefulness and reduce returns or frustration.',
      keyPoints: ['Avoid decisions based on vague claims.', 'Check source, fit, care limits, and buyer intent.', 'Use the site trust rules before recommending a conversion step.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'FAQ',
      purpose: 'Answer final purchase or assembly questions.',
      keyPoints: ['Cover the highest-risk buyer questions from the knowledge base.'],
      recommendedLinks: [],
    },
  ];
  if (typeKey === 'how-to') {
    base.splice(2, 0, {
      level: 'H2',
      heading: `Step-by-step plan for ${kw}`,
      purpose: 'Give the article a practical build sequence.',
      keyPoints: ['Start with the prerequisite check.', 'Give concrete steps that match the topic.', 'Close with care, trust, or conversion guidance.'],
      recommendedLinks: [],
    });
  }
  return base;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readFirstJsonFile(filePaths) {
  for (const filePath of filePaths) {
    const parsed = readJsonFile(filePath);
    if (parsed) return parsed;
  }
  return null;
}

async function buildPublishPack(siteId, slug) {
  const siteDir = getSiteDir(siteId);
  const htmlPath = join(siteDir, 'outputs', `${slug}.html`);
  if (!fs.existsSync(htmlPath)) throw new Error('Article not found');

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const meta = await readPublishMeta(siteDir, slug);
  const store = await getStore(siteId);
  const row = store.getOne(slug) || {};
  const focusKeyword = meta.focusKeyword || row.keyword || slug;
  const checklist = buildPublishChecklist(html, focusKeyword, meta.metaDescription, meta.schema);

  return {
    html,
    seoTitles: meta.seoTitles,
    metaDescription: meta.metaDescription,
    altTexts: meta.altTexts,
    schema: meta.schema,
    focusKeyword,
    publishChecklist: checklist,
  };
}

async function readPublishMeta(siteDir, slug) {
  const result = {
    seoTitles: [],
    metaDescription: '',
    altTexts: [],
    schema: {},
    focusKeyword: '',
  };
  const xlsxPath = join(siteDir, 'outputs', 'meta-table.xlsx');
  if (!fs.existsSync(xlsxPath)) return result;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);

  const seoSheet = workbook.getWorksheet('SEO Fields');
  const seoRow = findRowBySlug(seoSheet, slug);
  if (seoRow) {
    result.seoTitles = ['SEO Title 1', 'SEO Title 2', 'SEO Title 3'].map(k => textCell(seoRow[k])).filter(Boolean);
    result.metaDescription = textCell(seoRow['Meta Description']);
    result.focusKeyword = textCell(seoRow['Focus Keyword']);
  }

  const altSheet = workbook.getWorksheet('Image ALTs');
  if (altSheet) {
    for (const row of rowsToObjects(altSheet)) {
      if (textCell(row.Slug) !== slug) continue;
      result.altTexts.push({
        position: Number(row.Position || result.altTexts.length + 1),
        suggestion: textCell(row['ALT Suggestion']),
      });
    }
  }

  const schemaSheet = workbook.getWorksheet('Schema');
  const schemaRow = findRowBySlug(schemaSheet, slug);
  if (schemaRow) {
    const raw = textCell(schemaRow['JSON-LD']) || textCell(schemaRow.Schema);
    if (raw) {
      try {
        result.schema = JSON.parse(raw);
      } catch {
        result.schema = { raw };
      }
    } else if (schemaRow['Schema Type']) {
      result.schema = { '@context': 'https://schema.org', '@type': textCell(schemaRow['Schema Type']) };
    }
  }

  return result;
}

function rowsToObjects(sheet) {
  if (!sheet) return [];
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col] = textCell(cell.value); });
  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    headers.forEach((header, col) => {
      if (header) obj[header] = row.getCell(col).value;
    });
    rows.push(obj);
  });
  return rows;
}

function findRowBySlug(sheet, slug) {
  return rowsToObjects(sheet).find(row => textCell(row.Slug) === slug || textCell(row.URLSlug) === slug || textCell(row['URL Slug']) === slug);
}

function textCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.result) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (value.hyperlink) return String(value.hyperlink);
  }
  return String(value).trim();
}

function buildPublishChecklist(html, focusKeyword, metaDescription, schema) {
  const h1 = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const h1Done = focusKeyword ? h1.toLowerCase().includes(String(focusKeyword).toLowerCase()) : Boolean(h1);
  const linkCount = (html.match(/<a\b[^>]*href=/gi) || []).length;
  const authorDone = /author|byline|about this article|written by/i.test(html);
  const metaDone = Boolean(metaDescription) && metaDescription.length <= 155;
  const schemaDone = Boolean(schema && Object.keys(schema).length);

  return [
    { item: 'H1 includes the focus keyword', done: h1Done },
    { item: 'Internal link count is 2-5', done: linkCount >= 2 && linkCount <= 5 },
    { item: 'Author/byline module exists', done: authorDone },
    { item: 'Meta Description is 155 characters or less', done: metaDone },
    { item: 'Schema JSON-LD is prepared', done: schemaDone },
  ];
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function defaultArticleTypes() {
  return {
    'price-guide': {
      wordRange: [800, 1200],
      schemaType: 'Article',
      openingTemplates: ['Answer the price question immediately, then explain context and tradeoffs.'],
    },
    'buying-guide': {
      wordRange: [1000, 1600],
      schemaType: 'Article',
      openingTemplates: ['Start with the buying decision and the most important selection criteria.'],
    },
    comparison: {
      wordRange: [1200, 1800],
      schemaType: 'Article',
      openingTemplates: ['Compare the options by use case, cost, risk, and next step.'],
    },
    faq: {
      wordRange: [600, 900],
      schemaType: 'FAQPage',
      openingTemplates: ['Give a direct answer, then cover the most common follow-up questions.'],
    },
    'how-to': {
      wordRange: [1000, 1500],
      schemaType: 'HowTo',
      openingTemplates: ['Frame the task, prerequisites, steps, and common mistakes.'],
    },
    pillar: {
      wordRange: [2200, 3500],
      schemaType: 'Article',
      openingTemplates: ['Open with the category problem, map the topic, and guide readers by section.'],
    },
    listicle: {
      wordRange: [1200, 2000],
      schemaType: 'Article',
      openingTemplates: ['Open with the selection criteria, then explain the list by use case.'],
    },
  };
}

function defaultPromptSections() {
  return {
    authorDisclaimer: 'Written by {authorName}, {authorTitle} at {brandName}. Reviewed for clarity and practical usefulness in {reviewDate}.',
    observationalClaim: 'Use verified facts from the knowledge base. When making an editorial judgment, phrase it as practical guidance rather than an unsupported guarantee.',
    internalLinkRule: 'Use only the provided internal links. Insert links naturally where they help the reader.',
    ctaStyle: 'End with a practical next step that matches the site conversion goal.',
    styleReferenceRule: 'When style-reference.json is available, reuse its article container, typography classes, and sample blocks for CMS-embeddable article HTML.',
  };
}

function defaultQaRules() {
  return {
    hardFail: [
      { id: 'empty_article', check: 'article_tag_missing', message: 'Missing <article> root element' },
      { id: 'too_short', check: 'too_short', message: 'Article is shorter than the configured word range' },
      { id: 'forbidden_word', check: 'forbidden_word_found', message: 'Contains forbidden wording from site.json' },
      { id: 'editor_markers', check: 'editor_markers_found', message: 'Contains TODO/editor/placeholder markers' },
    ],
    warnings: [
      { id: 'cta_missing', check: 'cta_missing', message: 'No clear CTA detected' },
      { id: 'internal_links_zero', check: 'internal_links_zero', message: 'No internal links detected' },
      { id: 'author_block_missing', check: 'author_block_missing', message: 'Author block missing' },
    ],
    scoreWeights: {
      seoStructure: 20,
      brandFit: 20,
      helpfulness: 20,
      readability: 20,
      publishReadiness: 20,
    },
  };
}
