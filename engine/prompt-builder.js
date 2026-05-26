import { matchInternalLinks } from './link-matcher.js';

export function buildPrompt(ctx, task) {
  return buildArticlePrompt(ctx, task);
}

export function buildArticlePrompt(ctx, task, outline = null) {
  const { site, knowledge, author, promptSections, articleTypes, linkIndex, styleReference } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || '');
  const typeConfig = selectTypeConfig(articleTypes, typeKey, site);
  const [minWords, maxWords] = typeConfig.wordRange || [900, 1400];
  const manualLinks = [task.pillartarget, task.internallinkingurls].filter(Boolean).join(',');
  const relevantLinks = canonicalizeLinks(matchInternalLinks(linkIndex, task.keyword, manualLinks), site);
  const brandName = site.brandName || site.siteName || site.siteId;
  const reviewDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const authorBlock = (promptSections.authorDisclaimer || '')
    .replace('{authorName}', author.name || author.teamName || author.companyName || 'the editorial team')
    .replace('{authorTitle}', author.title || author.role || author.teamRole || '')
    .replace('{brandName}', brandName)
    .replace('{reviewDate}', reviewDate);

  return {
    systemPrompt: buildSystemPrompt({
      site,
      knowledge,
      author,
      promptSections,
      typeConfig,
      minWords,
      maxWords,
      authorBlock,
      brandName,
      styleReference,
      projectInstructions: ctx.projectInstructions,
      outputMode: 'article',
    }),
    userPrompt: buildUserPrompt({
      site,
      task,
      typeKey,
      typeConfig,
      relevantLinks,
      minWords,
      maxWords,
      outline,
    }),
    typeKey,
    typeConfig,
    relevantLinks,
  };
}

export function buildOutlinePrompt(ctx, task) {
  const { site, promptSections, articleTypes, linkIndex } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || '');
  const typeConfig = selectTypeConfig(articleTypes, typeKey, site);
  const [minWords, maxWords] = typeConfig.wordRange || [900, 1400];
  const manualLinks = [task.pillartarget, task.internallinkingurls].filter(Boolean).join(',');
  const relevantLinks = canonicalizeLinks(matchInternalLinks(linkIndex, task.keyword, manualLinks), site);
  const brandName = site.brandName || site.siteName || site.siteId;
  const systemPrompt = buildSystemPrompt({
    site,
    knowledge: ctx.knowledge,
    author: ctx.author,
    promptSections,
    typeConfig,
    minWords,
    maxWords,
    authorBlock: '',
    brandName,
    styleReference: ctx.styleReference,
    projectInstructions: ctx.projectInstructions,
    outputMode: 'outline',
  });
  const userPrompt = buildOutlineUserPrompt({ site, task, typeKey, typeConfig, relevantLinks, minWords, maxWords });
  return { systemPrompt, userPrompt, typeKey, typeConfig, relevantLinks };
}

function buildSystemPrompt({ site, knowledge, author, promptSections, typeConfig, minWords, maxWords, authorBlock, brandName, styleReference, projectInstructions = '', outputMode = 'article' }) {
  const isB2B = normalizeSiteType(site.siteType) === 'b2b';
  const required = toArray(site.mustSay).map(s => `- ${s}`).join('\n');
  const forbidden = toArray(site.mustNotSay).map(s => `- ${s}`).join('\n');
  const style = site.writingStyle || {};
  const profileBlock = isB2B
    ? buildCompanyProfileBlock(site, author)
    : buildAuthorProfileBlock(author, authorBlock);
  const schemaAuthor = isB2B
    ? `"author": {"@type": "Organization", "name": "${escapeJson(author.companyName || brandName)}"}`
    : `"author": {"@type": "Person", "name": "${escapeJson(author.name || 'Author')}"}`;

  return [
    `# Role
${isB2B
  ? `You are the B2B technical content strategist for ${brandName}. Write as the company's technical editorial and product/project support team, not as a personal influencer.`
  : `You are the blog content writer for ${brandName}. Write as ${author.name || 'the site author'}${author.title ? ', ' + author.title : ''}.`}

All reader-facing output must be written in ${site.language || 'en'}, even when configuration data is written in another language.
Configuration and project instructions may be Chinese or English; interpret them, but write the article assets in ${site.language || 'en'}.

${projectInstructions ? `# Site Project Instructions\nThese are the site-level project instructions. They override global templates when they are more specific, but they must not override the machine-readable output format required by this task.\n${summarize(projectInstructions, 6000)}` : ''}

${outputMode === 'article' ? `
CRITICAL: Your entire response MUST start with exactly ===HTML_START=== on its own line.
Return exactly two delimited blocks and nothing else:

===HTML_START===
<article>
  full article HTML here
</article>
===HTML_END===
===META_START===
valid JSON object here
===META_END===` : `
CRITICAL: Return only one valid JSON object. No markdown fences, no commentary, and do not write the article body.`}`,

    `# Site and Brand
Site: ${brandName}
Domain: ${site.domain || ''}
Language: ${site.language || 'en'}
Positioning: ${site.positioning || ''}
${isB2B
  ? `Business model: ${site.businessModel || 'B2B supplier / manufacturer / service provider'}
Target markets: ${toArray(site.targetMarkets).join(', ')}
Target industries: ${toArray(site.targetIndustries).join(', ')}
Buyer roles: ${toArray(site.buyerRoles).join(', ')}
Core products: ${toArray(site.coreProducts).join(', ')}
Capabilities: ${toArray(site.capabilities).join(', ')}
Certifications: ${toArray(site.certifications).join(', ')}
Lead time policy: ${site.leadTimePolicy || ''}
MOQ policy: ${site.moqPolicy || ''}`
  : `Target audience: ${Array.isArray(site.targetAudience) ? site.targetAudience.join(', ') : site.targetAudience || ''}
Brand role: ${site.brandRole || ''}`}
Conversion goal: ${site.conversionGoal || ''}
${required ? `\nRequired claims or phrases:\n${required}` : ''}
${forbidden ? `\nForbidden claims or phrases:\n${forbidden}` : ''}`,

    `# Writing Style
Tone: ${style.tone || 'clear, practical, specific'}
Sentence style: ${style.sentenceStyle || 'short explanatory paragraphs'}
Avoid: ${Array.isArray(style.avoidStyle) ? style.avoidStyle.join('; ') : style.avoidStyle || 'unsupported hype, vague filler, fake first-hand claims'}
${author.writingStyleNotes || author.writingNotes || ''}`,

    profileBlock,

    `# Knowledge Base
Use this as the source of truth. Do not invent unsupported details.
${summarize(knowledge, 5000)}`,

    `# First-Hand Experience and Claim Standards
${promptSections.observationalClaim || ''}
${isB2B
  ? `Do not invent certifications, factory size, production capacity, equipment lists, years of experience, export markets, client names, case results, test data, exact lead times, MOQ, prices, warranties, or performance guarantees.
Use company capabilities, product specs, manufacturing notes, QC process, certifications, case studies, buyer questions, and project experience only when they exist in the knowledge base, team profile, or site settings.
When evidence is missing, say what buyers should confirm with the supplier instead of claiming the company has it.`
  : `Do not invent statistics, certifications, tests, prices, partnerships, guarantees, reviews, or personal experiences.
Use the author's Story bank as approved first-hand source material. When the outline, project instructions, or article topic calls for first-hand experience, choose the most relevant story-bank detail and rewrite it naturally as publish-ready article prose in the author's voice.`}
Do not output editor placeholders or request markers such as "needs first-hand experience", "E-E-A-T marker", "TODO", or "insert anecdote here".
If no story-bank detail fits the exact point, write a more general evidence-aware sentence instead of leaving a placeholder.`,

    `# Internal Links
${promptSections.internalLinkRule || ''}
Use <a href="URL">anchor text</a> directly in the article body. Do not list links separately.
Use only full canonical site URLs. Never output root-relative links like href="/path/" and never output file:// links.`,

    `# Base HTML Output Rules
This generation step is for content quality, not advanced visual formatting. Produce clean, stable, CMS-embeddable base article HTML:
- Use <article>, one <h1>, useful <h2>/<h3>, <p>, <ul>/<ol>, <table>, <blockquote>, <aside>, and <details>/<summary> only when they help the reader.
- Keep class names minimal and semantic. Do not try to imitate the full site visual system in this step.
- Do not use style-reference.json, pasted homepage HTML, or visual design snippets to reshape the article during base generation.
- Do not emit <style>, <script>, <head>, <body>, nav, footer, or full-page layout markup.
- Do not use inline CSS.
- The separate "polish formatting" step will apply site-specific HTML structure, classes, accordions, cards, CTA blocks, and visual hierarchy later.
${promptSections.styleReferenceRule ? `Style reference note for later polish step only: ${summarize(promptSections.styleReferenceRule, 800)}` : ''}`,

    `# ${outputMode === 'article' ? 'Article' : 'Outline'} Requirements
Target length: ${minWords}-${maxWords} words.
Schema type for metadata: ${typeConfig.schemaType || 'Article'}.
${outputMode === 'article'
  ? 'Use one H1, useful H2/H3 sections, paragraphs, lists, and tables only when they help the reader.\nNo Markdown. No HTML/head/body/nav/footer/script/style/meta tags. No date stamps. No image tags. No editor notes.'
  : 'Create a practical outline only. Include H1/H2 plan, section purpose, key points, recommended links, FAQ plan, CTA, SEO metadata plan, and QA risks. Do not draft paragraphs.'}
${isB2B ? 'Every B2B article must help procurement managers, engineers, contractors, distributors, or business buyers move one step closer to supplier evaluation, RFQ, drawing submission, catalog download, or technical consultation.' : ''}
${promptSections.ctaStyle || ''}`,

    outputMode === 'article' ? `# Metadata JSON Schema
The META block must be one valid JSON object:
{
  "seoTitles": ["option 1 under 60 chars", "option 2 under 60 chars", "option 3 under 60 chars"],
  "metaDescription": "140-155 character meta description with the primary keyword",
  "altTexts": [
    {"position": 1, "suggestion": "descriptive alt text suggestion"}
  ],
  "schema": {
    "@context": "https://schema.org",
    "@type": "${typeConfig.schemaType || 'Article'}",
    "headline": "article headline",
    ${schemaAuthor}
  },
  "wordCount": 0,
  "qaFlags": []
}` : `# Outline JSON Schema
Return this shape exactly:
{
  "slug": "${site.siteId || ''}-slug",
  "keyword": "primary keyword",
  "articleType": "article type key",
  "searchIntent": "search intent",
  "workingTitle": "H1 title containing the primary keyword",
  "targetWordCount": "number or range",
  "readerPromise": "what the reader can decide or do after reading",
  "seoTitles": ["title option 1", "title option 2", "title option 3"],
  "metaDescription": "draft meta description under 155 characters",
  "sections": [
    {
      "level": "H2",
      "heading": "section heading",
      "purpose": "why this section exists",
      "targetKeyword": "primary or secondary keyword",
      "keyPoints": ["point 1", "point 2"],
      "requiredEvidence": ["knowledge/story/source needed"],
      "recommendedLinks": [{"anchor": "anchor text", "url": "/example/"}],
      "styleBlock": "sampleBlocks key when relevant"
    }
  ],
  "keywordCoveragePlan": {
    "primary": [{"term": "primary keyword", "plannedPlacement": "H1 and opening paragraph", "sectionHeading": "section heading"}],
    "secondary": [{"term": "secondary keyword", "plannedPlacement": "H2 or body", "sectionHeading": "section heading", "required": true}],
    "variants": [{"term": "long-tail variant", "plannedPlacement": "body or FAQ", "sectionHeading": "section heading", "required": false}]
  },
  "faq": [{"question": "question", "answerIntent": "what to answer"}],
  "cta": {"copy": "CTA copy", "targetUrl": "/target/", "targetType": "pillarPage|categoryPage|productPage"},
  "qaRisks": [{"ruleId": "id", "risk": "risk", "mitigation": "how to avoid it"}],
  "publishChecklist": [{"item": "check item", "done": false}]
}`,
  ].join('\n\n---\n\n');
}

function buildUserPrompt({ site, task, typeKey, typeConfig, relevantLinks, minWords, maxWords, outline }) {
  const isB2B = normalizeSiteType(site.siteType) === 'b2b';
  const linkBlock = relevantLinks.length
    ? relevantLinks.map(link => `- <a href="${link.url}">${link.anchor}</a> (${link.topic || link.type})`).join('\n')
    : '- No required internal links were matched. Use none unless supplied in the task.';

  const opening = typeConfig.openingTemplates?.length
    ? typeConfig.openingTemplates.map(t => `- ${t}`).join('\n')
    : '- Answer the search intent directly in the opening.';

  const targetUrl = buildBlogUrl(site, task.urlslug);
  return `Write a ${typeKey} article for this keyword task.

## Keyword Task
- Primary keyword: ${task.keyword}
- Secondary keywords: ${task.secondarykeywords || task.secondary || '(none)'}
- Variants / long-tail terms: ${task.variants || task.longtail || '(none)'}
- Search intent: ${task.intent || '(infer from keyword)'}
- Article direction: ${task.direction || task.notes || task.editorialnotes || ''}
- Target URL slug: ${task.urlslug || ''}
- Target article URL: ${targetUrl}
- Target word count: ${task.targetwordcount || `${minWords}-${maxWords}`}
- Search volume: ${task.volume || '(not provided)'}
- KD / difficulty score: ${task.kd || '(not provided)'}
- Cannibalization check: ${task.cannibalcheck || '(none)'}
- Required pillar target: ${task.pillartarget || '(none)'}
- Blog ID: ${task.blogid || '(none)'}
${isB2B ? `- Buyer role: ${task.buyerrole || '(infer from keyword)'}
- Funnel stage: ${task.funnelstage || '(infer from keyword)'}
- Industry: ${task.industry || '(not provided)'}
- Application: ${task.application || '(not provided)'}
- Product line: ${task.productline || '(not provided)'}
- Geo target: ${task.geotarget || '(not provided)'}
- CTA type: ${task.ctatype || '(choose procurement-oriented CTA)'}
- Evidence needed: ${task.evidenceneeded || '(infer from article type)'}
- Case target: ${task.casetarget || '(none)'}
- Solution target: ${task.solutiontarget || '(none)'}
- RFQ target: ${task.rfqtarget || '(none)'}
- Compliance risk: ${task.compliancerisk || '(none)'}` : ''}

## Internal Links To Use Naturally
${linkBlock}

## Structure Guidance
${opening}
- Put the primary keyword in the H1 and first 100 words.
- Follow the outline's keywordCoveragePlan. Use secondary keywords and variants naturally in the planned sections; do not keyword-stuff, but do not silently ignore provided terms.
- If the outline has no keywordCoveragePlan, create an internal plan: primary keyword in H1/opening, important secondary keywords in H2/H3 or section body, variants/long-tail terms in body copy or FAQ where natural.
- Include practical examples, objections, comparison points, or FAQ when useful.
${isB2B ? '- Include procurement decision criteria, specification or selection guidance, buyer questions, evidence boundaries, and an RFQ/contact/catalog next step when relevant.' : ''}
${outline ? `\n## Approved Outline\nFollow this outline. Do not add unrelated sections. If a section conflicts with site rules, correct it while preserving the intent.\n${JSON.stringify(outline, null, 2)}` : ''}

Now write the article. Output only the two required delimited blocks.`;
}

function buildOutlineUserPrompt({ site, task, typeKey, typeConfig, relevantLinks, minWords, maxWords }) {
  const isB2B = normalizeSiteType(site.siteType) === 'b2b';
  const linkBlock = relevantLinks.length
    ? relevantLinks.map(link => `- ${link.anchor}: ${link.url} (${link.topic || link.type})`).join('\n')
    : '- No required internal links were matched. Recommend only links supported by links.json or the keyword row.';
  const targetUrl = buildBlogUrl(site, task.urlslug);
  return `Create the pre-writing outline for this keyword task. Do not draft the article body.

## Keyword Task
- Primary keyword: ${task.keyword}
- Secondary keywords: ${task.secondarykeywords || task.secondary || '(none)'}
- Variants / long-tail terms: ${task.variants || task.longtail || '(none)'}
- Search intent: ${task.intent || '(infer from keyword)'}
- Article direction: ${task.direction || task.notes || task.editorialnotes || ''}
- Article type: ${typeKey}
- Target URL slug: ${task.urlslug || ''}
- Target article URL: ${targetUrl}
- Target word count: ${task.targetwordcount || `${minWords}-${maxWords}`}
- Search volume: ${task.volume || '(not provided)'}
- KD / difficulty score: ${task.kd || '(not provided)'}
- Cannibalization check: ${task.cannibalcheck || '(none)'}
- Required pillar target: ${task.pillartarget || '(none)'}
- Blog ID: ${task.blogid || '(none)'}
${isB2B ? `- Buyer role: ${task.buyerrole || '(infer from keyword)'}
- Funnel stage: ${task.funnelstage || '(infer from keyword)'}
- Industry: ${task.industry || '(not provided)'}
- Application: ${task.application || '(not provided)'}
- Product line: ${task.productline || '(not provided)'}
- Geo target: ${task.geotarget || '(not provided)'}
- CTA type: ${task.ctatype || '(choose procurement-oriented CTA)'}
- Evidence needed: ${task.evidenceneeded || '(infer from article type)'}
- Case target: ${task.casetarget || '(none)'}
- Solution target: ${task.solutiontarget || '(none)'}
- RFQ target: ${task.rfqtarget || '(none)'}
- Compliance risk: ${task.compliancerisk || '(none)'}` : ''}

## Matched Internal Links
${linkBlock}

## Article Type Strategy
${summarize(typeConfig, 2500)}

${isB2B ? 'B2B outline requirements: include buyer role, funnel stage, evidence needed, procurement FAQ plan, recommended product/solution/contact links, and risks for unsupported claims.' : ''}

## Keyword Coverage Planning
Create a keywordCoveragePlan in the JSON output:
- Primary keyword: plan H1 and first 100 words.
- Secondary keywords: split the provided list, assign each meaningful term to one H2/H3 or body section.
- Variants / long-tail terms: assign each useful term to a body section or FAQ answer where it can appear naturally.
- Mark terms as required only when they are relevant and safe to use. If a term is awkward or duplicate, still include it in the plan with a note such as "optional / duplicate".
- The plan is for natural editorial coverage, not density stuffing.

Return only valid JSON matching the outline schema.`;
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
    faq: 'faq',
    comparison: 'comparison',
    compare: 'comparison',
    vs: 'comparison',
    pillar: 'pillar',
    hub: 'pillar',
    listicle: 'listicle',
    list: 'listicle',
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

function selectTypeConfig(articleTypes = {}, typeKey, site = {}) {
  if (articleTypes[typeKey]) return articleTypes[typeKey];
  if (normalizeSiteType(site.siteType) === 'b2b') {
    return articleTypes['product-category-guide'] || articleTypes['application-guide'] || articleTypes.pillar || articleTypes['buying-guide'] || {};
  }
  return articleTypes['buying-guide'] || articleTypes.pillar || {};
}

function normalizeSiteType(value) {
  return String(value || '').toLowerCase() === 'b2b' ? 'b2b' : 'b2c';
}

function buildAuthorProfileBlock(author = {}, authorBlock = '') {
  return `# Author Identity
Author: ${author.name || 'Author'}
Title: ${author.title || author.role || ''}
Background: ${author.background || ''}
Story bank: ${summarize(author.storyBank || author.stories || [], 3200)}

Every article must end with this block before </article>:
<div class="author-block">
  <p>${escapeHtml(authorBlock).replace(/\n/g, '<br>')}</p>
</div>`;
}

function buildCompanyProfileBlock(site = {}, author = {}) {
  const company = author.companyName || site.siteName || site.siteId || 'the company';
  return `# Company / Team Credibility Profile
Company: ${company}
Team: ${author.teamName || 'Product & Project Support Team'}
Team role: ${author.teamRole || 'Technical editorial and product support team'}
Background: ${author.background || ''}
Factory / company story: ${author.factoryStory || ''}
Engineering experience: ${summarize(author.engineeringExperience || [], 1600)}
Quality control experience: ${summarize(author.qualityControlExperience || [], 1600)}
Export / project experience: ${summarize(author.exportExperience || [], 1600)}
Case story bank: ${summarize(author.caseStoryBank || author.storyBank || [], 2400)}

Every B2B article must end with this block before </article>:
<div class="company-credibility-block">
  <p><strong>About this guide:</strong> This article was prepared by the ${escapeHtml(company)} product and project support team using documented product specifications, manufacturing notes, buyer questions, and project experience.</p>
</div>`;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function summarize(value, maxLen = 2000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2);
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n...[truncated]` : text;
}

function canonicalizeLinks(links = [], site = {}) {
  return links.map(link => ({
    ...link,
    url: canonicalSiteUrl(site, link.url, link.type === 'blog'),
  }));
}

function buildBlogUrl(site = {}, slug = '') {
  const cleanSlug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  return canonicalSiteUrl(site, cleanSlug ? `/blog/${cleanSlug}/` : '/blog/');
}

function canonicalSiteUrl(site = {}, rawUrl = '', preferBlog = false) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(site.domain || '').trim().replace(/\/+$/, '');
  if (!base) return url.startsWith('/') ? url : `/${url}`;
  let path = url.startsWith('/') ? url : `/${url}`;
  if (preferBlog && !path.startsWith('/blog/')) path = `/blog/${path.replace(/^\/+/, '')}`;
  if (!path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path)) path += '/';
  return `${base}${path}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeJson(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
