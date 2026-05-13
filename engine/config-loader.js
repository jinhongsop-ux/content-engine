import fs from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_DIR = join(__dirname, '..', 'sites');
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const REQUIRED = {
  'site.json': ['siteId', 'domain', 'language'],
  'author.json': ['name'],
};

const REQUIRED_CSV_COLS = ['keyword', 'urlslug'];

export async function loadSiteContext(siteId) {
  const siteDir = join(SITES_DIR, siteId);
  if (!fs.existsSync(siteDir)) throw new Error(`Site directory not found: ${siteDir}`);

  const errors = [];
  const readJson = filename => {
    const filePath = join(siteDir, filename);
    if (!fs.existsSync(filePath)) {
      if (REQUIRED[filename]?.length) errors.push(`Missing required file: sites/${siteId}/${filename}`);
      return {};
    }

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      for (const field of REQUIRED[filename] || []) {
        if (raw[field] === undefined || raw[field] === null || raw[field] === '') {
          errors.push(`${filename}: missing required field "${field}"`);
        }
      }
      return raw;
    } catch (err) {
      errors.push(`${filename}: invalid JSON - ${err.message}`);
      return {};
    }
  };

  const site = readJson('site.json');
  const knowledge = readJson('knowledge.json');
  const author = readJson('author.json');
  const links = readJson('links.json');
  const styleReference = readJson('style-reference.json');

  const keywords = readKeywords(siteDir, errors);
  const articleTypes = loadTemplate('article-types.json', defaultArticleTypes());
  const promptSections = loadTemplate('prompt-sections.json', defaultPromptSections());
  const qaRules = loadTemplate('qa-rules.json', defaultQaRules());

  if (errors.length) {
    throw new Error(`Config validation failed for site "${siteId}":\n- ${errors.join('\n- ')}`);
  }

  return {
    siteId,
    siteDir,
    outputDir: join(siteDir, 'outputs'),
    site,
    knowledge,
    author,
    links,
    styleReference,
    keywords,
    linkIndex: buildLinkIndex(links),
    articleTypes,
    promptSections,
    qaRules,
  };
}

export function listSites() {
  if (!fs.existsSync(SITES_DIR)) return [];
  return fs.readdirSync(SITES_DIR).filter(name => {
    const full = join(SITES_DIR, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(join(full, 'site.json'));
  });
}

function readKeywords(siteDir, errors) {
  const csvPath = join(siteDir, 'keywords.csv');
  if (!fs.existsSync(csvPath)) {
    errors.push('Missing required file: keywords.csv');
    return [];
  }

  try {
    const records = parse(fs.readFileSync(csvPath, 'utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    const keywords = records.map(row => {
      const out = {};
      for (const [key, value] of Object.entries(row)) {
        out[key.toLowerCase().replace(/\s+/g, '')] = value;
      }
      return out;
    }).filter(row => {
      const kw = String(row.keyword || '').trim();
      return Boolean(kw) && !/^\[.*字段.*\]/i.test(kw) && !/^field\s*guide$/i.test(kw);
    });

    if (keywords.length) {
      const cols = Object.keys(keywords[0]);
      for (const col of REQUIRED_CSV_COLS) {
        if (!cols.includes(col)) errors.push(`keywords.csv: missing required column "${col}"`);
      }
    }

    return keywords;
  } catch (err) {
    errors.push(`keywords.csv: parse error - ${err.message}`);
    return [];
  }
}

function buildLinkIndex(links) {
  const index = [];
  const addGroup = (group, type) => {
    if (!Array.isArray(group)) return;
    for (const item of group) {
      if (!item.url) continue;
      index.push({
        anchor: item.anchor || item.title || item.name || item.url,
        url: item.url,
        topic: item.topic || item.category || '',
        keywords: Array.isArray(item.keywords)
          ? item.keywords
          : typeof item.keywords === 'string'
            ? item.keywords.split(',').map(s => s.trim()).filter(Boolean)
            : [],
        type,
      });
    }
  };

  addGroup(links.pillarPages || links.pillar_pages || links.topicHubs, 'pillar');
  addGroup(links.categoryPages || links.category_pages || links.collections, 'category');
  addGroup(links.blogPosts || links.blog_posts || links.blogs, 'blog');
  addGroup(links.productPages || links.product_pages || links.products, 'product');
  addGroup(links.trustPages || links.trust_pages, 'trust');
  return index;
}

function loadTemplate(filename, defaults) {
  const filePath = join(TEMPLATES_DIR, filename);
  if (!fs.existsSync(filePath)) return defaults;
  try {
    return deepMerge(defaults, JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch (err) {
    console.warn(`[config-loader] ${filename} is invalid; using defaults. ${err.message}`);
    return defaults;
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(base[key] || {}, value)
      : value;
  }
  return out;
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
    authorDisclaimer:
      'Written by {authorName}, {authorTitle} at {brandName}. Reviewed for clarity and practical usefulness in {reviewDate}.',
    observationalClaim:
      'Use verified facts from the knowledge base. When making an editorial judgment, phrase it as practical guidance rather than an unsupported guarantee.',
    internalLinkRule:
      'Use only the provided internal links. Insert links naturally where they help the reader.',
    ctaStyle:
      'End with a practical next step that matches the site conversion goal.',
    styleReferenceRule:
      'When style-reference.json is available, reuse its article container, typography classes, and sample blocks for CMS-embeddable article HTML.',
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
