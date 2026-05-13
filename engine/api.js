/**
 * Express API router for the content engine UI.
 */

import { Router } from 'express';
import { join } from 'path';
import fs from 'fs';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { loadSiteContext, listSites } from './config-loader.js';
import { TaskQueue } from './task-queue.js';
import { KeywordStore } from './keyword-store.js';
import { buildPrompt } from './prompt-builder.js';
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

const EDITABLE_SITE_FILES = new Set(['site.json', 'knowledge.json', 'author.json', 'links.json', 'style-reference.json', 'keywords.csv']);
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
        title: '1. 读取站点配置',
        reads: ['sites/<siteId>/site.json', 'sites/<siteId>/knowledge.json', 'sites/<siteId>/author.json', 'sites/<siteId>/links.json'],
        code: ['engine/config-loader.js'],
        output: '统一的 ctx 上下文，供后续模块引用',
      },
      {
        id: 'keyword-store',
        title: '2. 读取关键词规划',
        reads: ['sites/<siteId>/keywords.csv', 'sites/<siteId>/outputs/queue-state.json'],
        code: ['engine/keyword-store.js'],
        output: '合并后的关键词行，包含规划字段和状态字段',
      },
      {
        id: 'prompt',
        title: '3. 组装 Prompt',
        reads: ['ctx.site', 'ctx.knowledge', 'ctx.author', 'ctx.linkIndex', 'templates/*.json', '当前 keyword row'],
        code: ['engine/prompt-builder.js', 'engine/link-matcher.js'],
        output: 'systemPrompt + userPrompt',
      },
      {
        id: 'generate',
        title: '4. 调用模型生成',
        reads: ['systemPrompt', 'userPrompt', 'API Key'],
        code: ['engine/generator.js'],
        output: '带分隔符的 HTML + META 原始输出',
      },
      {
        id: 'split-clean-qa',
        title: '5. 拆分、清洗、质检',
        reads: ['模型原始输出', '站点规则', '文章类型规则'],
        code: ['engine/splitter.js', 'engine/cleaner.js', 'engine/qa.js'],
        output: '干净 article HTML + QA 分数 + metadata',
      },
      {
        id: 'write',
        title: '6. 写入输出文件',
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
      'templates/article-types.json': '文章类型策略：字数范围、Schema 类型、结构倾向',
      'templates/prompt-sections.json': '通用 Prompt 片段：作者声明、事实标准、内链规则、CTA 风格',
      'templates/qa-rules.json': '质检规则：硬性拦截、警告、评分权重',
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
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
    fs.writeFileSync(join(siteDir, 'keywords.csv'), defaultKeywordsCsv(), 'utf-8');
    stores.delete(siteId);
    res.json({ ok: true, siteId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
    'site.json': '网站基础资料：站点 ID、域名、语言、定位、受众、必须表达、禁止表达、写作风格。',
    'knowledge.json': '知识库：术语、事实、FAQ、异议、卖点。生成文章时作为事实来源。',
    'author.json': '作者资料：姓名、职位、背景、写作口吻、故事素材。用于 E-E-A-T 和作者模块。',
    'links.json': '内链库：支柱页、博客页、产品页。系统会按关键词匹配并插入文章。',
    'keywords.csv': '关键词规划表：每一行是一篇文章任务，包含关键词、slug、类型、字数、方向、内链。',
  }[name] || '';
}

async function generateOutline(ctx, row, apiConfig = {}) {
  const { systemPrompt, userPrompt, relevantLinks, typeKey, typeConfig } = buildPrompt(ctx, row);
  const prompt = `Create a detailed article outline before article drafting.

Return only valid JSON. No markdown fences. No commentary.

JSON shape:
{
  "slug": "${row.urlslug}",
  "keyword": "${row.keyword}",
  "articleType": "${typeKey}",
  "searchIntent": "short intent summary",
  "workingTitle": "draft H1 title containing the primary keyword",
  "targetWordCount": "${row.targetwordcount || typeConfig?.wordRange?.join('-') || ''}",
  "readerPromise": "what the reader will learn or decide",
  "sections": [
    {
      "level": "H2",
      "heading": "section heading",
      "purpose": "why this section exists",
      "keyPoints": ["point 1", "point 2"],
      "recommendedLinks": [{"anchor": "anchor text", "url": "/example/"}]
    }
  ],
  "faq": [{"question": "question", "answerIntent": "what to answer"}],
  "cta": "recommended CTA",
  "qaRisks": ["possible risk to check before publishing"]
}

Context from the article prompt:

${userPrompt}

Matched internal links:
${relevantLinks.map(link => `- ${link.anchor}: ${link.url} (${link.topic || link.type})`).join('\n') || '- none'}`;

  const text = await callTextModel(systemPrompt, prompt, {
    maxTokens: 3500,
    ...apiConfig,
  });
  const parsed = parseJsonFromText(text);
  return normalizeOutline(parsed, row, typeKey, typeConfig);
}

async function generateArticleFromOutline(ctx, row, outline, apiConfig = {}) {
  const prompt = buildPrompt(ctx, row);
  const outlineText = JSON.stringify(outline, null, 2);
  const userPrompt = `${prompt.userPrompt}

## Approved Outline
Use this outline as the article plan. Preserve the intent, headings, key points, internal link guidance, CTA, and QA risks unless the site rules require a correction.

${outlineText}

Now write the full article from the approved outline. Output only the two required delimited blocks.`;

  const genResult = await generate(prompt.systemPrompt, userPrompt, {
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
      userPrompt,
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
      { question: `What should I know before choosing ${row.keyword}?`, answerIntent: 'Answer with difficulty, materials, time, and fit.' },
      { question: `How long does this type of kit usually take?`, answerIntent: 'Use Nookcraft difficulty and session guidance.' },
    ],
    cta: 'Guide the reader to compare the relevant Nookcraft kit or collection.',
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
      heading: 'Difficulty, time, and what comes in the kit',
      purpose: 'Set honest expectations before product consideration.',
      keyPoints: ['Mention full-color English photo instructions.', 'Disclose Intermediate or Advanced difficulty and realistic session planning.', 'Mention LED string and replacement parts only when relevant.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'How to choose the right Nookcraft kit',
      purpose: 'Move from education to buying criteria.',
      keyPoints: ['Compare scene type, display space, patience level, and gift fit.', 'Use concrete criteria instead of generic praise.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'Common mistakes to avoid',
      purpose: 'Add practical usefulness and reduce returns or frustration.',
      keyPoints: ['Do not rush small parts.', 'Test-fit before gluing.', 'Plan LED placement before final assembly.'],
      recommendedLinks: [],
    },
    {
      level: 'H2',
      heading: 'FAQ',
      purpose: 'Answer final purchase or assembly questions.',
      keyPoints: ['Cover time, difficulty, missing parts, and gifting suitability.'],
      recommendedLinks: [],
    },
  ];
  if (typeKey === 'how-to') {
    base.splice(2, 0, {
      level: 'H2',
      heading: `Step-by-step plan for ${kw}`,
      purpose: 'Give the article a practical build sequence.',
      keyPoints: ['Prepare tools and parts.', 'Sort pieces by stage.', 'Assemble structure, details, and LED lighting.', 'Finish and display.'],
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
  const authorDone = /author|byline|署名|作者/i.test(html);
  const metaDone = Boolean(metaDescription) && metaDescription.length <= 155;
  const schemaDone = Boolean(schema && Object.keys(schema).length);

  return [
    { item: 'H1 包含核心关键词', done: h1Done },
    { item: '内链数量 2-5 个', done: linkCount >= 2 && linkCount <= 5 },
    { item: '作者署名模块存在', done: authorDone },
    { item: 'Meta Description 不超过155字符', done: metaDone },
    { item: 'Schema JSON-LD 已准备', done: schemaDone },
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
