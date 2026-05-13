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
    missing_article_tag: !/<article\b/i.test(html || '') || !/<\/article>/i.test(html || ''),
    too_short: result.wordCount < minWords,
    word_count_below_minimum: result.wordCount < minWords,
    forbidden_word_found: hasForbiddenWord(html, site.mustNotSay || []),
    mustnot_say_match: hasForbiddenWord(html, site.mustNotSay || []),
    editor_markers_found: hasEditorMarkers(html),
    placeholder_detected: hasEditorMarkers(html),
    cta_missing: !hasCTA(html),
    cta_absent: !hasCTA(html),
    internal_links_zero: countInternalLinks(html) === 0,
    internal_link_count_zero: countInternalLinks(html) === 0,
    internal_link_count_below_minimum: countInternalLinks(html) < expectedInternalLinks(typeConf),
    pillar_link_absent: !hasAnyHref(html, ctx.links?.pillarPages || []),
    product_link_absent: !hasAnyHref(html, ctx.links?.productPages || []),
    author_block_missing: !/class=["'][^"']*author-block/i.test(html || ''),
    author_block_absent: !/author-block|about this article|written by/i.test(html || ''),
    h1_absent: !/<h1\b/i.test(html || ''),
    h1_keyword_mismatch: !h1ContainsKeyword(html, task.keyword),
    difficulty_not_disclosed: needsDifficulty(task) && !/intermediate|advanced|(?:\d+\s*[–-]\s*\d+|\d+)\s*(?:hours|hrs)/i.test(strip(html)),
    difficulty_not_on_first_product_mention: false,
    forbidden_adjective_detected: hasForbiddenProductAdjective(html),
    eeat_marker_present: /需要一手经验|E-E-A-T marker/i.test(html || ''),
    faq_section_absent: !/faq|frequently asked|<h[23][^>]*>[^<]*questions/i.test(html || ''),
    meta_description_absent: !meta?.metaDescription,
    meta_description_over_155: Boolean(meta?.metaDescription && meta.metaDescription.length > 155),
    schema_json_ld_absent: !meta?.schema || !Object.keys(meta.schema || {}).length,
    brand_voice_generic_detected: /furthermore|in conclusion|it's worth noting|dive in|game-changing|seamlessly|delve into/i.test(strip(html)),
    opening_does_not_match_template: false,
    cannibalcheck_field_not_empty: Boolean(task.cannibalcheck),
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

  const weights = normalizeWeights(qaRules.scoreWeights || {
    seoStructure: 20,
    brandFit: 20,
    helpfulness: 20,
    readability: 20,
    publishReadiness: 20,
  });

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

function expectedInternalLinks(typeConf) {
  const exp = typeConf?.internalLinkExpectations;
  if (!exp || typeof exp !== 'object') return 1;
  return Object.values(exp).reduce((sum, n) => sum + Number(n || 0), 0);
}

function hasAnyHref(html, pages) {
  const lower = String(html || '').toLowerCase();
  return (pages || []).some(page => page.url && lower.includes(String(page.url).toLowerCase()));
}

function h1ContainsKeyword(html, keyword) {
  const h1 = strip((String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const kw = String(keyword || '').toLowerCase().trim();
  if (!kw) return Boolean(h1);
  return h1.toLowerCase().includes(kw) || kw.split(/\s+/).filter(w => w.length > 3).some(w => h1.toLowerCase().includes(w));
}

function needsDifficulty(task) {
  return ['buying-guide', 'how-to', 'comparison', 'listicle', 'pillar'].includes(normaliseType(task.articletype || task.type || ''));
}

function hasForbiddenProductAdjective(html) {
  return /\b(easy|simple|beginner-friendly|premium craftsmanship|high quality|magical experience|stunning|beautiful|life-changing|perfect for everyone|handmade|ethically sourced)\b/i.test(strip(html));
}

function normalizeWeights(weights) {
  const out = {};
  for (const [key, value] of Object.entries(weights || {})) {
    out[key] = Number(value?.maxScore ?? value ?? 0);
  }
  const total = Object.values(out).reduce((sum, n) => sum + n, 0);
  if (!total) return { seoStructure: 20, brandFit: 20, helpfulness: 20, readability: 20, publishReadiness: 20 };
  return out;
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
    listicle: 'listicle',
    list: 'listicle',
    comparison: 'comparison',
    pillar: 'pillar',
  };
  return map[key] || key || 'buying-guide';
}

function clamp(n) {
  return Math.max(0, Math.min(1, n));
}
