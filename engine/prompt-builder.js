import { matchInternalLinks } from './link-matcher.js';

export function buildPrompt(ctx, task) {
  return buildArticlePrompt(ctx, task);
}

export function buildArticlePrompt(ctx, task, outline = null) {
  const { site, knowledge, author, promptSections, articleTypes, linkIndex, styleReference } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || '');
  const typeConfig = articleTypes[typeKey] || articleTypes['buying-guide'];
  const [minWords, maxWords] = typeConfig.wordRange || [900, 1400];
  const manualLinks = [task.pillartarget, task.internallinkingurls].filter(Boolean).join(',');
  const relevantLinks = matchInternalLinks(linkIndex, task.keyword, manualLinks);
  const brandName = site.brandName || site.siteName || site.siteId;
  const reviewDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const authorBlock = (promptSections.authorDisclaimer || '')
    .replace('{authorName}', author.name || 'the author')
    .replace('{authorTitle}', author.title || author.role || '')
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
  const typeConfig = articleTypes[typeKey] || articleTypes['buying-guide'];
  const [minWords, maxWords] = typeConfig.wordRange || [900, 1400];
  const manualLinks = [task.pillartarget, task.internallinkingurls].filter(Boolean).join(',');
  const relevantLinks = matchInternalLinks(linkIndex, task.keyword, manualLinks);
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
  const userPrompt = buildOutlineUserPrompt({ task, typeKey, typeConfig, relevantLinks, minWords, maxWords });
  return { systemPrompt, userPrompt, typeKey, typeConfig, relevantLinks };
}

function buildSystemPrompt({ site, knowledge, author, promptSections, typeConfig, minWords, maxWords, authorBlock, brandName, styleReference, projectInstructions = '', outputMode = 'article' }) {
  const required = toArray(site.mustSay).map(s => `- ${s}`).join('\n');
  const forbidden = toArray(site.mustNotSay).map(s => `- ${s}`).join('\n');
  const style = site.writingStyle || {};

  return [
    `# Role
You are the blog content writer for ${brandName}. Write as ${author.name || 'the site author'}${author.title ? ', ' + author.title : ''}.

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
Target audience: ${Array.isArray(site.targetAudience) ? site.targetAudience.join(', ') : site.targetAudience || ''}
Brand role: ${site.brandRole || ''}
Conversion goal: ${site.conversionGoal || ''}
${required ? `\nRequired claims or phrases:\n${required}` : ''}
${forbidden ? `\nForbidden claims or phrases:\n${forbidden}` : ''}`,

    `# Writing Style
Tone: ${style.tone || 'clear, practical, specific'}
Sentence style: ${style.sentenceStyle || 'short explanatory paragraphs'}
Avoid: ${Array.isArray(style.avoidStyle) ? style.avoidStyle.join('; ') : style.avoidStyle || 'unsupported hype, vague filler, fake first-hand claims'}
${author.writingStyleNotes || ''}`,

    `# Author Identity
Author: ${author.name || 'Author'}
Title: ${author.title || author.role || ''}
Background: ${author.background || ''}
Story bank: ${summarize(author.storyBank || author.stories || [], 3200)}

Every article must end with this block before </article>:
<div class="author-block">
  <p>${escapeHtml(authorBlock).replace(/\n/g, '<br>')}</p>
</div>`,

    `# Knowledge Base
Use this as the source of truth. Do not invent unsupported details.
${summarize(knowledge, 5000)}`,

    `# First-Hand Experience and Claim Standards
${promptSections.observationalClaim || ''}
Do not invent statistics, certifications, tests, prices, partnerships, guarantees, reviews, or personal experiences.
Use the author's Story bank as approved first-hand source material. When the outline, project instructions, or article topic calls for first-hand experience, choose the most relevant story-bank detail and rewrite it naturally as publish-ready article prose in the author's voice.
Do not output editor placeholders or request markers such as "【需要一手经验】", "[needs first-hand experience]", "E-E-A-T marker", "TODO", or "insert anecdote here".
If no story-bank detail fits the exact point, write a more general evidence-aware sentence instead of leaving a placeholder.`,

    `# Internal Links
${promptSections.internalLinkRule || ''}
Use <a href="URL">anchor text</a> directly in the article body. Do not list links separately.`,

    `# HTML Style Reference and Component Rules
${styleReference && Object.keys(styleReference).length ? `
Use this site-level style reference when choosing article HTML structure, class names, and content blocks:
${styleReference.styleBrief ? summarize(styleReference.styleBrief, 5000) : summarize(styleReference, 5000)}

${promptSections.styleReferenceRule || ''}
` : 'No site style-reference.json is available. Use clean semantic article HTML and avoid full-page markup.'}

The article must not look like plain unstyled text. Use publish-ready CMS-embeddable semantic HTML:
- Use the configured article root class when available, such as <article class="...">.
- Use section wrappers with site-specific classes for major blocks.
- Use <blockquote> for sourced or reflective quotes when appropriate.
- Use <aside> or a site-specific note/warning class for care notes, cautions, or key takeaways.
- Use <ul>, <ol>, and <table> when they improve scanning.
- Use FAQ accordion markup with <details><summary>Question</summary><p>Answer</p></details> when the article includes FAQ content.
- Use CTA and related-link blocks with classes from the style reference when available.
- Do not emit <style>, <script>, <head>, <body>, nav, footer, or full-page layout markup.
- Do not use inline CSS unless the style reference explicitly says to do so.`,

    `# ${outputMode === 'article' ? 'Article' : 'Outline'} Requirements
Target length: ${minWords}-${maxWords} words.
Schema type for metadata: ${typeConfig.schemaType || 'Article'}.
${outputMode === 'article'
  ? 'Use one H1, useful H2/H3 sections, paragraphs, lists, and tables only when they help the reader.\nNo Markdown. No HTML/head/body/nav/footer/script/style/meta tags. No date stamps. No image tags. No editor notes.'
  : 'Create a practical outline only. Include H1/H2 plan, section purpose, key points, recommended links, FAQ plan, CTA, SEO metadata plan, and QA risks. Do not draft paragraphs.'}
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
    "author": {"@type": "Person", "name": "${author.name || 'Author'}"}
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
  "faq": [{"question": "question", "answerIntent": "what to answer"}],
  "cta": {"copy": "CTA copy", "targetUrl": "/target/", "targetType": "pillarPage|categoryPage|productPage"},
  "qaRisks": [{"ruleId": "id", "risk": "risk", "mitigation": "how to avoid it"}],
  "publishChecklist": [{"item": "check item", "done": false}]
}`,
  ].join('\n\n---\n\n');
}

function buildUserPrompt({ task, typeKey, typeConfig, relevantLinks, minWords, maxWords, outline }) {
  const linkBlock = relevantLinks.length
    ? relevantLinks.map(link => `- <a href="${link.url}">${link.anchor}</a> (${link.topic || link.type})`).join('\n')
    : '- No required internal links were matched. Use none unless supplied in the task.';

  const opening = typeConfig.openingTemplates?.length
    ? typeConfig.openingTemplates.map(t => `- ${t}`).join('\n')
    : '- Answer the search intent directly in the opening.';

  return `Write a ${typeKey} article for this keyword task.

## Keyword Task
- Primary keyword: ${task.keyword}
- Secondary keywords: ${task.secondarykeywords || task.secondary || '(none)'}
- Variants / long-tail terms: ${task.variants || task.longtail || '(none)'}
- Search intent: ${task.intent || '(infer from keyword)'}
- Article direction: ${task.direction || task.notes || task.editorialnotes || ''}
- Target URL slug: ${task.urlslug || ''}
- Target word count: ${task.targetwordcount || `${minWords}-${maxWords}`}
- Search volume: ${task.volume || '(not provided)'}
- KD / difficulty score: ${task.kd || '(not provided)'}
- Cannibalization check: ${task.cannibalcheck || '(none)'}
- Required pillar target: ${task.pillartarget || '(none)'}
- Blog ID: ${task.blogid || '(none)'}

## Internal Links To Use Naturally
${linkBlock}

## Structure Guidance
${opening}
- Put the primary keyword in the H1 and first 100 words.
- Use secondary keywords naturally in H2s and body copy.
- Include practical examples, objections, comparison points, or FAQ when useful.
${outline ? `\n## Approved Outline\nFollow this outline. Do not add unrelated sections. If a section conflicts with site rules, correct it while preserving the intent.\n${JSON.stringify(outline, null, 2)}` : ''}

Now write the article. Output only the two required delimited blocks.`;
}

function buildOutlineUserPrompt({ task, typeKey, typeConfig, relevantLinks, minWords, maxWords }) {
  const linkBlock = relevantLinks.length
    ? relevantLinks.map(link => `- ${link.anchor}: ${link.url} (${link.topic || link.type})`).join('\n')
    : '- No required internal links were matched. Recommend only links supported by links.json or the keyword row.';
  return `Create the pre-writing outline for this keyword task. Do not draft the article body.

## Keyword Task
- Primary keyword: ${task.keyword}
- Secondary keywords: ${task.secondarykeywords || task.secondary || '(none)'}
- Variants / long-tail terms: ${task.variants || task.longtail || '(none)'}
- Search intent: ${task.intent || '(infer from keyword)'}
- Article direction: ${task.direction || task.notes || task.editorialnotes || ''}
- Article type: ${typeKey}
- Target URL slug: ${task.urlslug || ''}
- Target word count: ${task.targetwordcount || `${minWords}-${maxWords}`}
- Search volume: ${task.volume || '(not provided)'}
- KD / difficulty score: ${task.kd || '(not provided)'}
- Cannibalization check: ${task.cannibalcheck || '(none)'}
- Required pillar target: ${task.pillartarget || '(none)'}
- Blog ID: ${task.blogid || '(none)'}

## Matched Internal Links
${linkBlock}

## Article Type Strategy
${summarize(typeConfig, 2500)}

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
  };
  return map[key] || key || 'buying-guide';
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function summarize(value, maxLen = 2000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2);
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n...[truncated]` : text;
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
