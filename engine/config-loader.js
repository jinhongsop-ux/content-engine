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
      const raw = JSON.parse(stripBom(fs.readFileSync(filePath, 'utf-8')));
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
  site.siteType = normalizeSiteType(site.siteType);
  const knowledge = readJson('knowledge.json');
  const author = readJson('author.json');
  const links = readJson('links.json');
  const styleReference = readJson('style-reference.json');
  const projectInstructions = readText(join(siteDir, 'project-instructions.md'));

  const keywords = readKeywords(siteDir, errors);
  validateAuthorProfile(author, site.siteType, errors);
  const articleTypes = loadTemplate(siteDir, 'article-types.json', defaultArticleTypes(site.siteType), site.siteType);
  const promptSections = loadTemplate(siteDir, 'prompt-sections.json', defaultPromptSections(site.siteType), site.siteType);
  const qaRules = loadTemplate(siteDir, 'qa-rules.json', defaultQaRules(site.siteType), site.siteType);

  if (errors.length) {
    throw new Error(`Config validation failed for site "${siteId}":\n- ${errors.join('\n- ')}`);
  }

  return {
    siteId,
    siteType: site.siteType,
    siteDir,
    outputDir: join(siteDir, 'outputs'),
    site,
    knowledge,
    author,
    links,
    styleReference,
    projectInstructions,
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
  addGroup(links.solutionPages || links.solution_pages || links.solutions, 'solution');
  addGroup(links.industryPages || links.industry_pages || links.industries, 'industry');
  addGroup(links.applicationPages || links.application_pages || links.applications, 'application');
  addGroup(links.caseStudies || links.case_studies || links.cases, 'case');
  addGroup(links.certificationPages || links.certification_pages || links.certifications, 'certification');
  addGroup(links.capabilityPages || links.capability_pages || links.capabilities, 'capability');
  addGroup(links.contactPages || links.contact_pages || links.rfqPages, 'contact');
  addGroup(links.downloadPages || links.download_pages || links.downloads, 'download');
  return index;
}

function normalizeSiteType(value) {
  return String(value || '').toLowerCase() === 'b2b' ? 'b2b' : 'b2c';
}

function validateAuthorProfile(author, siteType, errors) {
  if (siteType === 'b2b') {
    if (!author.teamName && !author.companyName && !author.name) {
      errors.push('author.json: missing required field "teamName" or "companyName" for b2b site');
    }
    return;
  }
  if (!author.name) errors.push('author.json: missing required field "name"');
}

function loadTemplate(siteDir, filename, defaults, siteType = 'b2c') {
  const globalPath = join(TEMPLATES_DIR, filename);
  const commonPath = join(TEMPLATES_DIR, 'common', filename);
  const typedPath = join(TEMPLATES_DIR, normalizeSiteType(siteType), filename);
  const sitePath = join(siteDir, 'templates', filename);
  let out = defaults;
  if (fs.existsSync(commonPath)) {
    try {
      out = deepMerge(out, JSON.parse(stripBom(fs.readFileSync(commonPath, 'utf-8'))));
    } catch (err) {
      console.warn(`[config-loader] templates/common/${filename} is invalid; using defaults. ${err.message}`);
    }
  }
  if (fs.existsSync(typedPath)) {
    try {
      out = deepMerge(out, JSON.parse(stripBom(fs.readFileSync(typedPath, 'utf-8'))));
    } catch (err) {
      console.warn(`[config-loader] templates/${normalizeSiteType(siteType)}/${filename} is invalid; using common/default. ${err.message}`);
    }
  } else if (fs.existsSync(globalPath)) {
    try {
      out = deepMerge(out, JSON.parse(stripBom(fs.readFileSync(globalPath, 'utf-8'))));
    } catch (err) {
      console.warn(`[config-loader] ${filename} is invalid; using common/default. ${err.message}`);
    }
  }
  if (!fs.existsSync(sitePath)) return out;
  try {
    return deepMerge(out, JSON.parse(stripBom(fs.readFileSync(sitePath, 'utf-8'))));
  } catch (err) {
    console.warn(`[config-loader] site templates/${filename} is invalid; using global/default. ${err.message}`);
    return out;
  }
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return '';
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
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

function defaultArticleTypes(siteType = 'b2c') {
  if (normalizeSiteType(siteType) === 'b2b') return defaultB2BArticleTypes();
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

function defaultB2BArticleTypes() {
  return {
    'product-category-guide': {
      wordRange: [1200, 2000],
      schemaType: 'Article',
      strategy: 'Explain product types, specifications, material options, selection criteria, procurement risks, and RFQ next steps.',
    },
    'application-guide': {
      wordRange: [1200, 2200],
      schemaType: 'Article',
      strategy: 'Explain how the product is used in a specific application, which problems it solves, what specs matter, and what buyers should confirm before ordering.',
    },
    'industry-solution': {
      wordRange: [1500, 2500],
      schemaType: 'Article',
      strategy: 'Map industry pain points to product capabilities, compliance needs, documented examples, and consultation or RFQ CTA.',
    },
    'manufacturing-process': {
      wordRange: [1200, 2000],
      schemaType: 'Article',
      strategy: 'Explain production steps, materials, QC checkpoints, tolerances, documentation, and supplier questions.',
    },
    'materials-specs': {
      wordRange: [1000, 1800],
      schemaType: 'Article',
      strategy: 'Compare material or specification options by performance, cost drivers, application fit, and procurement risk.',
    },
    'standards-certification': {
      wordRange: [1000, 1800],
      schemaType: 'Article',
      strategy: 'Explain standards, certificates, testing documents, and compliance boundaries without unsupported claims.',
    },
    'supplier-comparison': {
      wordRange: [1400, 2400],
      schemaType: 'Article',
      strategy: 'Compare supplier types, capabilities, risk signals, qualification questions, and decision criteria.',
    },
    'case-study': {
      wordRange: [900, 1600],
      schemaType: 'Article',
      strategy: 'Describe project background, challenge, solution, product choice, and outcome only when documented.',
    },
    'procurement-faq': {
      wordRange: [800, 1400],
      schemaType: 'FAQPage',
      strategy: 'Answer MOQ, lead time, customization, samples, drawings, packaging, shipping, payment, and after-sales questions.',
    },
    pillar: {
      wordRange: [2500, 4200],
      schemaType: 'Article',
      strategy: 'Build a complete topic hub for a product category, application, or industry solution, then link to product, solution, case, certification, download, and contact pages.',
    },
  };
}

function defaultPromptSections(siteType = 'b2c') {
  if (normalizeSiteType(siteType) === 'b2b') {
    return {
      authorDisclaimer:
        'About this guide: This article was prepared by the {brandName} product and project support team using documented product specifications, manufacturing notes, buyer questions, and project experience. Last reviewed in {reviewDate}.',
      observationalClaim:
        'Use only documented company capabilities, product specs, QC notes, certifications, case studies, and buyer questions as source material. If evidence is missing, phrase guidance as a buyer consideration, not as a company claim.',
      internalLinkRule:
        'Prioritize solution pages, product pages, industry pages, case studies, certification pages, contact/RFQ pages, and catalog/download pages. Links must move the buyer toward supplier evaluation.',
      ctaStyle:
        'End with a procurement-oriented next step such as request a quote, send drawings, download a catalog, compare specifications, or talk to the technical team.',
      styleReferenceRule:
        'For B2B articles, use reference HTML to create spec tables, selection criteria blocks, case/solution blocks, procurement FAQ accordions, and RFQ CTA sections.',
    };
  }
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

function defaultQaRules(siteType = 'b2c') {
  if (normalizeSiteType(siteType) === 'b2b') {
    return {
      hardFail: [
        { id: 'empty_article', check: 'article_tag_missing', message: 'Missing <article> root element' },
        { id: 'too_short', check: 'too_short', message: 'Article is shorter than the configured word range' },
        { id: 'forbidden_word', check: 'forbidden_word_found', message: 'Contains forbidden wording from site.json' },
        { id: 'editor_markers', check: 'editor_markers_found', message: 'Contains TODO/editor/placeholder markers' },
        { id: 'unsupported_certification_claim', check: 'unsupported_certification_detected', message: 'Article mentions a certification, standard, lab test, or compliance claim not found in site.json or knowledge.json.' },
        { id: 'fake_factory_claim', check: 'factory_claim_without_source', message: 'Article claims factory scale, capacity, equipment, years of experience, or export markets without source data.' },
        { id: 'unsupported_case_study', check: 'case_study_without_source', message: 'Article includes a customer case, project result, client name, or metric not found in case study data.' },
        { id: 'unsupported_lead_time_or_moq', check: 'leadtime_moq_without_source', message: 'Article mentions exact lead time, MOQ, sample time, price, or shipping terms without source data.' },
        { id: 'missing_b2b_cta', check: 'b2b_cta_absent', message: 'B2B article must include a procurement-oriented CTA.' },
        { id: 'missing_company_block', check: 'company_credibility_block_absent', message: 'B2B article must end with a company/team credibility block.' },
        { id: 'consumer_tone_detected', check: 'consumer_hype_language', message: 'B2B article uses consumer hype, cheap/best/easy claims, or vague promotional language.' },
      ],
      warnings: [
        { id: 'internal_links_zero', check: 'internal_links_zero', message: 'No internal links detected' },
        { id: 'missing_buyer_role', check: 'buyer_role_absent', message: 'Article does not clearly address procurement, engineering, contractor, distributor, or business buyer concerns.' },
        { id: 'missing_specs_table', check: 'spec_table_absent', message: 'A B2B product or supplier article should include a specs, selection criteria, or comparison table when relevant.' },
        { id: 'missing_solution_link', check: 'solution_link_absent', message: 'No link to a product, solution, case study, certification, or contact/RFQ page.' },
        { id: 'missing_procurement_faq', check: 'procurement_faq_absent', message: 'No procurement FAQ detected for MOQ, lead time, customization, sample, drawing, packaging, or shipping.' },
      ],
      scoreWeights: {
        seoStructure: 18,
        brandFit: 22,
        helpfulness: 24,
        readability: 16,
        publishReadiness: 20,
      },
    };
  }
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
