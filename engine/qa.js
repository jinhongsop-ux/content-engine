export function validate(html, meta, ctx, task) {
  const { site, qaRules } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || 'buying-guide');
  const typeConf = ctx.articleTypes[typeKey] || ctx.articleTypes['buying-guide'];
  const minWords = Number(task.targetwordcount || typeConf?.wordRange?.[0] || 600) * 0.75;
  const isB2B = normalizeSiteType(site.siteType) === 'b2b';

  const result = {
    pass: true,
    score: 0,
    hardFails: [],
    warnings: [],
    scores: {},
    wordCount: wordCount(html),
    internalLinkCount: countInternalLinks(html),
  };
  result.keywordCoverage = buildKeywordCoverage(html, task);

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
    company_credibility_block_absent: !/company-credibility-block|about this guide|product and project support team|technical review by/i.test(html || ''),
    h1_absent: !/<h1\b/i.test(html || ''),
    h1_keyword_mismatch: !h1ContainsKeyword(html, task.keyword),
    difficulty_not_disclosed: needsDifficulty(task) && !/intermediate|advanced|(?:\d+\s*[–-]\s*\d+|\d+)\s*(?:hours|hrs)/i.test(strip(html)),
    difficulty_not_on_first_product_mention: false,
    forbidden_adjective_detected: hasForbiddenProductAdjective(html),
    eeat_marker_present: /【需要一手经验|E-E-A-T marker/i.test(html || ''),
    faq_section_absent: !/faq|frequently asked|<h[23][^>]*>[^<]*questions/i.test(html || ''),
    meta_description_absent: !meta?.metaDescription,
    meta_description_over_155: Boolean(meta?.metaDescription && meta.metaDescription.length > 155),
    schema_json_ld_absent: !meta?.schema || !Object.keys(meta.schema || {}).length,
    brand_voice_generic_detected: /furthermore|in conclusion|it's worth noting|dive in|game-changing|seamlessly|delve into/i.test(strip(html)),
    opening_does_not_match_template: false,
    cannibalcheck_field_not_empty: Boolean(task.cannibalcheck),
    meta_missing: !meta || typeof meta !== 'object',
    unsupported_certification_detected: isB2B && hasUnsupportedCertificationClaim(html, ctx),
    factory_claim_without_source: isB2B && hasFactoryClaimWithoutSource(html, ctx),
    case_study_without_source: isB2B && hasCaseStudyWithoutSource(html, ctx),
    leadtime_moq_without_source: isB2B && hasLeadTimeOrMoqWithoutSource(html, ctx),
    b2b_cta_absent: isB2B && !hasB2BCTA(html),
    consumer_hype_language: isB2B && hasConsumerHypeLanguage(html),
    buyer_role_absent: isB2B && !hasBuyerRoleLanguage(html),
    spec_table_absent: isB2B && isSpecHeavyArticle(task, typeKey) && !/<table\b|specification|selection criteria|procurement checklist|comparison matrix/i.test(html || ''),
    solution_link_absent: isB2B && !hasAnyHref(html, [
      ...(ctx.links?.solutionPages || []),
      ...(ctx.links?.productPages || []),
      ...(ctx.links?.industryPages || []),
      ...(ctx.links?.applicationPages || []),
      ...(ctx.links?.caseStudies || []),
      ...(ctx.links?.certificationPages || []),
      ...(ctx.links?.contactPages || []),
      ...(ctx.links?.downloadPages || []),
    ]),
    procurement_faq_absent: isB2B && !/MOQ|lead time|sample|drawing|customi[sz]ation|packaging|shipping|payment|after-sales|procurement|RFQ|request a quote/i.test(strip(html)),
    keyword_coverage_missing: result.keywordCoverage.missingRequired.length > 0,
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
  if (result.keywordCoverage.missingRequired.length) {
    result.warnings.push({
      id: 'keyword_coverage_missing',
      message: `Keyword coverage missing: ${result.keywordCoverage.missingRequired.map(item => item.term).join(', ')}`,
      terms: result.keywordCoverage.missingRequired,
    });
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
  result.scores.publishReadiness = scorePublishReadiness(html, meta, site);
  result.score = Math.round(Object.entries(weights).reduce((total, [key, weight]) => {
    return total + ((result.scores[key] || 0) * weight);
  }, 0));

  const warningRules = new Map((qaRules.warnings || []).map(rule => [rule.id, rule]));
  const warningPenalty = result.warnings.reduce((sum, warning) => {
    const rule = warningRules.get(warning.id) || {};
    return sum + Number(rule.scorePenalty ?? rule.penalty ?? 0);
  }, 0);
  if (warningPenalty) result.score = Math.max(0, result.score - warningPenalty);
  result.status = result.hardFails.length ? 'blocked' : result.warnings.length ? 'review' : 'pass';

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
  const coverage = buildKeywordCoverage(html, task);
  if (coverage.requiredTotal && coverage.requiredCovered / coverage.requiredTotal >= 0.8) score += 0.1;
  return Math.min(score, 1);
}

function buildKeywordCoverage(html, task = {}) {
  const text = normalizeText(strip(html));
  const primary = splitKeywordTerms(task.keyword).map(term => coverageItem(term, 'primary', text, true));
  const secondary = splitKeywordTerms(task.secondarykeywords || task.secondary).map(term => coverageItem(term, 'secondary', text, true));
  const variants = splitKeywordTerms(task.variants || task.longtail).map(term => coverageItem(term, 'variant', text, false));
  const all = dedupeCoverage([...primary, ...secondary, ...variants]);
  const required = all.filter(item => item.required);
  const missingRequired = required.filter(item => !item.found);
  const missingOptional = all.filter(item => !item.required && !item.found);
  return {
    primary: all.filter(item => item.type === 'primary'),
    secondary: all.filter(item => item.type === 'secondary'),
    variants: all.filter(item => item.type === 'variant'),
    requiredTotal: required.length,
    requiredCovered: required.filter(item => item.found).length,
    optionalTotal: all.length - required.length,
    optionalCovered: all.filter(item => !item.required && item.found).length,
    missingRequired,
    missingOptional,
  };
}

function coverageItem(term, type, normalizedText, required) {
  const normalizedTerm = normalizeText(term);
  const found = Boolean(normalizedTerm && normalizedText.includes(normalizedTerm));
  return { term, type, required, found };
}

function dedupeCoverage(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeText(item.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function splitKeywordTerms(value = '') {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '')
    .split(/[,;，；\n|]/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter(v => !/^\(none\)$/i.test(v));
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function scorePublishReadiness(html, meta, site = {}) {
  let score = 0;
  if (/<\/article>/i.test(html || '')) score += 0.25;
  if (normalizeSiteType(site.siteType) === 'b2b') {
    if (/company-credibility-block|about this guide|product and project support team/i.test(html || '')) score += 0.2;
  } else if (/author-block/i.test(html || '')) {
    score += 0.2;
  }
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

function hasUnsupportedCertificationClaim(html, ctx = {}) {
  const text = strip(html);
  const mentions = text.match(/\b(ISO\s*\d{3,5}|CE\b|RoHS\b|REACH\b|FDA\b|UL\b|ETL\b|EN\s*\d+|ASTM\b|SGS\b|TUV\b|TÜV\b|Intertek\b|BSCI\b|Sedex\b|FSC\b|OEKO[- ]?TEX\b)\b/gi) || [];
  if (!mentions.length) return false;
  const source = sourceText(ctx);
  return mentions.some(item => !source.includes(String(item).toLowerCase().replace(/\s+/g, '')));
}

function hasFactoryClaimWithoutSource(html, ctx = {}) {
  const text = strip(html);
  if (!/\b(factory|manufacturing facility|production line|monthly capacity|annual capacity|workers?|engineers?|machines?|equipment|export(?:ed|s)? to|years of experience)\b/i.test(text)) return false;
  const source = sourceText(ctx);
  return !/(factory|manufacturing|production|capacity|equipment|export|engineering|experience|quality control)/i.test(source);
}

function hasCaseStudyWithoutSource(html, ctx = {}) {
  const text = strip(html);
  if (!/\b(case study|project result|client|customer project|installed for|helped a|delivered to|reduced by|increased by|saved\b)\b/i.test(text)) return false;
  const source = sourceText(ctx);
  return !/(case|project|customer|client|result|outcome)/i.test(source);
}

function hasLeadTimeOrMoqWithoutSource(html, ctx = {}) {
  const text = strip(html);
  if (!/\b(MOQ|minimum order|lead time|sample time|delivery time|shipping terms?|FOB|EXW|CIF|\$\d+|USD\s*\d+|(?:\d+\s*[–-]\s*\d+|\d+)\s*(?:days?|weeks?))\b/i.test(text)) return false;
  const source = sourceText(ctx);
  return !/(moq|minimum order|lead time|sample time|delivery|shipping|fob|exw|cif|price|payment)/i.test(source);
}

function hasB2BCTA(html) {
  return /\b(request (?:a )?quote|RFQ|send (?:your )?drawings?|download (?:the )?catalog|talk to (?:an )?(?:engineer|technical team)|contact (?:our )?(?:team|sales|engineer)|get a project consultation|submit (?:your )?specs?)\b/i.test(strip(html));
}

function hasConsumerHypeLanguage(html) {
  return /\b(best in the world|cheap(?:est)?|premium quality|high quality|perfect solution|game-changing|life-changing|easy for everyone|guaranteed results|no\.?\s*1|top-rated|amazing|stunning|beautiful)\b/i.test(strip(html));
}

function hasBuyerRoleLanguage(html) {
  return /\b(procurement|purchasing|buyer|engineer|contractor|distributor|architect|project manager|project owner|specifier|installer|OEM|ODM|RFQ|supplier evaluation)\b/i.test(strip(html));
}

function isSpecHeavyArticle(task = {}, typeKey = '') {
  const key = normaliseType(typeKey || task.articletype || task.type || '');
  return ['product-category-guide', 'application-guide', 'industry-solution', 'manufacturing-process', 'materials-specs', 'standards-certification', 'supplier-comparison', 'pillar'].includes(key);
}

function sourceText(ctx = {}) {
  return JSON.stringify({
    site: ctx.site || {},
    knowledge: ctx.knowledge || {},
    author: ctx.author || {},
    links: ctx.links || {},
  }).toLowerCase().replace(/\s+/g, '');
}

function normalizeSiteType(value) {
  return String(value || '').toLowerCase() === 'b2b' ? 'b2b' : 'b2c';
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
    compare: 'comparison',
    pillar: 'pillar',
    hub: 'pillar',
    'product category guide': 'product-category-guide',
    productcategoryguide: 'product-category-guide',
    'application guide': 'application-guide',
    applicationguide: 'application-guide',
    'industry solution': 'industry-solution',
    industrysolution: 'industry-solution',
    'manufacturing process': 'manufacturing-process',
    manufacturingprocess: 'manufacturing-process',
    'materials specs': 'materials-specs',
    'materials/specs': 'materials-specs',
    materialsspecs: 'materials-specs',
    'standards certification': 'standards-certification',
    standardscertification: 'standards-certification',
    'supplier comparison': 'supplier-comparison',
    suppliercomparison: 'supplier-comparison',
    'case study': 'case-study',
    casestudy: 'case-study',
    'procurement faq': 'procurement-faq',
    procurementfaq: 'procurement-faq',
  };
  return map[key] || key || 'buying-guide';
}

function clamp(n) {
  return Math.max(0, Math.min(1, n));
}
