import { matchInternalLinks } from './link-matcher.js';

export function buildPrompt(ctx, task) {
  const { site, knowledge, author, promptSections, articleTypes, linkIndex } = ctx;
  const typeKey = normaliseType(task.articletype || task.type || '');
  const typeConfig = articleTypes[typeKey] || articleTypes['buying-guide'];
  const [minWords, maxWords] = typeConfig.wordRange || [900, 1400];
  const relevantLinks = matchInternalLinks(linkIndex, task.keyword, task.internallinkingurls || '');
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
    }),
    userPrompt: buildUserPrompt({
      task,
      typeKey,
      typeConfig,
      relevantLinks,
      minWords,
      maxWords,
    }),
    typeKey,
    typeConfig,
    relevantLinks,
  };
}

function buildSystemPrompt({ site, knowledge, author, promptSections, typeConfig, minWords, maxWords, authorBlock, brandName }) {
  const required = toArray(site.mustSay).map(s => `- ${s}`).join('\n');
  const forbidden = toArray(site.mustNotSay).map(s => `- ${s}`).join('\n');
  const style = site.writingStyle || {};

  return [
    `# Role
You are the blog content writer for ${brandName}. Write as ${author.name || 'the site author'}${author.title ? ', ' + author.title : ''}.

CRITICAL: Your entire response MUST start with exactly ===HTML_START=== on its own line.
Return exactly two delimited blocks and nothing else:

===HTML_START===
<article>
  full article HTML here
</article>
===HTML_END===
===META_START===
valid JSON object here
===META_END===`,

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
Story bank: ${summarize(author.storyBank || author.stories || [], 1200)}

Every article must end with this block before </article>:
<div class="author-block">
  <p>${escapeHtml(authorBlock).replace(/\n/g, '<br>')}</p>
</div>`,

    `# Knowledge Base
Use this as the source of truth. Do not invent unsupported details.
${summarize(knowledge, 5000)}`,

    `# Claim Standards
${promptSections.observationalClaim || ''}
Do not invent statistics, certifications, tests, prices, partnerships, guarantees, reviews, or personal experiences.
If a useful detail is missing, write around it rather than leaving placeholders.`,

    `# Internal Links
${promptSections.internalLinkRule || ''}
Use <a href="URL">anchor text</a> directly in the article body. Do not list links separately.`,

    `# Article Requirements
Target length: ${minWords}-${maxWords} words.
Schema type for metadata: ${typeConfig.schemaType || 'Article'}.
Use one H1, useful H2/H3 sections, paragraphs, lists, and tables only when they help the reader.
No Markdown. No HTML/head/body/nav/footer/script/style/meta tags. No date stamps. No image tags. No editor notes.
${promptSections.ctaStyle || ''}`,

    `# Metadata JSON Schema
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
}`,
  ].join('\n\n---\n\n');
}

function buildUserPrompt({ task, typeKey, typeConfig, relevantLinks, minWords, maxWords }) {
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

## Internal Links To Use Naturally
${linkBlock}

## Structure Guidance
${opening}
- Put the primary keyword in the H1 and first 100 words.
- Use secondary keywords naturally in H2s and body copy.
- Include practical examples, objections, comparison points, or FAQ when useful.

Now write the article. Output only the two required delimited blocks.`;
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
