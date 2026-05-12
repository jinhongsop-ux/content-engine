export function validate(html, meta, ctx, task) {
  const { site, qaRules } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || 'buying-guide');
  const typeConf = ctx.articleTypes[typeKey] || ctx.articleTypes['buying-guide'];
  const minWords = Number(task.targetwordcount || typeConf?.wordRange?.[0] || 600) * 0.75;

  const result = {
    pass: true,
    score: 0,
    hardFails: [],
    warnings: [],
    scores: {},
    wordCount: wordCount(html),
    internalLinkCount: countInternalLinks(html),
  };

  const checks = {
    article_tag_missing: !/<article\b/i.test(html || '') || !/<\/article>/i.test(html || ''),
    too_short: result.wordCount < minWords,
    forbidden_word_found: hasForbiddenWord(html, site.mustNotSay || []),
    editor_markers_found: hasEditorMarkers(html),
    cta_missing: !hasCTA(html),
    internal_links_zero: countInternalLinks(html) === 0,
    author_block_missing: !/class=["'][^"']*author-block/i.test(html || ''),
    meta_missing: !meta || typeof meta !== 'object',
  };

  for (const rule of qaRules.hardFail || []) {
    if (checks[rule.check]) {
      result.hardFails.push({ id: rule.id, message: rule.message });
      result.pass = false;
    }
  }

  for (const rule of qaRules.warnings || []) {
    if (checks[rule.check]) result.warnings.push({ id: rule.id, message: rule.message });
  }

  const weights = qaRules.scoreWeights || {
    seoStructure: 20,
    brandFit: 20,
    helpfulness: 20,
    readability: 20,
    publishReadiness: 20,
  };

  result.scores.seoStructure = scoreSEO(html, task);
  result.scores.brandFit = scoreBrand(html, site);
  result.scores.helpfulness = scoreHelpfulness(html, typeConf);
  result.scores.readability = scoreReadability(html);
  result.scores.publishReadiness = scorePublishReadiness(html, meta);
  result.score = Math.round(Object.entries(weights).reduce((total, [key, weight]) => {
    return total + ((result.scores[key] || 0) * weight);
  }, 0));

  return result;
}

function scoreSEO(html, task) {
  let score = 0;
  const kw = String(task.keyword || '').toLowerCase();
  const lower = String(html || '').toLowerCase();
  if (/<h1[^>]*>/i.test(html)) score += 0.25;
  if ((html.match(/<h2[^>]*>/gi) || []).length >= 2) score += 0.25;
  if (kw && lower.includes(kw)) score += 0.25;
  const first100 = strip(html).split(/\s+/).slice(0, 100).join(' ').toLowerCase();
  if (kw && first100.includes(kw)) score += 0.25;
  return Math.min(score, 1);
}

function scoreBrand(html, site) {
  let score = 0.6;
  const lower = String(html || '').toLowerCase();
  const forbidden = (site.mustNotSay || []).filter(w => lower.includes(String(w).toLowerCase()));
  score -= forbidden.length * 0.2;
  const required = site.mustSay || [];
  if (required.length) {
    const present = required.filter(w => lower.includes(String(w).toLowerCase()));
    score += (present.length / required.length) * 0.4;
  } else {
    score += 0.2;
  }
  return clamp(score);
}

function scoreHelpfulness(html, typeConf) {
  const wc = wordCount(html);
  const [min, max] = typeConf?.wordRange || [600, 1200];
  let score = 0;
  if (wc >= min * 0.75) score += 0.35;
  if (wc >= min && wc <= max * 1.35) score += 0.25;
  if (/<ul|<ol|<table/i.test(html)) score += 0.2;
  if (/<h[23][^>]*>[^<]*(what|how|why|when|where|can|is|are|should)/i.test(html)) score += 0.2;
  return clamp(score);
}

function scoreReadability(html) {
  const text = strip(html);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const avgWords = sentences.length
    ? sentences.reduce((sum, s) => sum + s.split(/\s+/).filter(Boolean).length, 0) / sentences.length
    : 30;
  let score = avgWords < 22 ? 0.45 : avgWords < 28 ? 0.3 : 0.15;
  if ((html.match(/<p[^>]*>/gi) || []).length >= 5) score += 0.3;
  if (/<h[23]/i.test(html)) score += 0.25;
  return clamp(score);
}

function scorePublishReadiness(html, meta) {
  let score = 0;
  if (/<\/article>/i.test(html || '')) score += 0.25;
  if (/author-block/i.test(html || '')) score += 0.2;
  if (!hasEditorMarkers(html)) score += 0.2;
  if (meta?.seoTitles?.length) score += 0.2;
  if (meta?.metaDescription?.length > 50) score += 0.15;
  return clamp(score);
}

function wordCount(html) {
  return strip(html).split(/\s+/).filter(Boolean).length;
}

function strip(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasForbiddenWord(html, list) {
  const lower = String(html || '').toLowerCase();
  return list.some(w => lower.includes(String(w).toLowerCase()));
}

function hasEditorMarkers(html) {
  return /\[TODO|\[EDIT|\[INSERT|\[PLACEHOLDER|TODO|needs verification|verify this|note to editor/i.test(html || '');
}

function hasCTA(html) {
  return /shop|buy|order|purchase|visit|browse|explore|learn more|check out|get started|contact|request|compare/i.test(String(html || '').toLowerCase());
}

function countInternalLinks(html) {
  return (html || '').match(/<a\s[^>]*href/gi)?.length || 0;
}

function normaliseType(raw) {
  const key = String(raw || '').toLowerCase().trim();
  const map = {
    'price guide': 'price-guide',
    priceguide: 'price-guide',
    'buying guide': 'buying-guide',
    buyingguide: 'buying-guide',
    'how to': 'how-to',
    howto: 'how-to',
  };
  return map[key] || key || 'buying-guide';
}

function clamp(n) {
  return Math.max(0, Math.min(1, n));
}
