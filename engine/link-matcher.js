/**
 * link-matcher.js
 *
 * Given a keyword and the site's link index, returns the most relevant
 * internal links to inject into the prompt.
 *
 * Matching strategy (in order):
 *  1. Exact keyword match in link.keywords[]
 *  2. Partial word overlap between keyword and link.keywords[] or link.topic
 *  3. Manual overrides from the task's internalLinkTargets field (comma-separated URLs)
 *
 * Priority order is preserved from config-loader linkIndex:
 *   pillar > blog > product
 *
 * Returns at most 5 links (hard cap from SEO best practice).
 */

export function matchInternalLinks(linkIndex, keyword, manualTargets = '') {
  const MAX_LINKS = 5;
  const results = new Map(); // url → link object (dedup)

  // --- Manual targets from task row (comma-separated URLs) ---
  if (manualTargets) {
    const urls = manualTargets.split(',').map(s => s.trim()).filter(Boolean);
    for (const url of urls) {
      const found = linkIndex.find(l => l.url === url || l.url.includes(url));
      if (found) {
        results.set(found.url, found);
      } else {
        // URL in the task but not in links.json — include it as-is with a generic anchor
        results.set(url, {
          anchor: urlToAnchor(url),
          url,
          topic: '',
          keywords: [],
          type: 'manual',
        });
      }
    }
  }

  if (results.size >= MAX_LINKS) return [...results.values()].slice(0, MAX_LINKS);

  // --- Score each link by keyword relevance ---
  const kwWords = tokenise(keyword);

  const scored = linkIndex
    .filter(l => !results.has(l.url)) // skip already-added
    .map(l => {
      let score = 0;

      // Exact keyword match in link.keywords[]
      if (l.keywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
        score += 10;
      }

      // Word overlap with link.keywords[]
      for (const lkw of l.keywords) {
        const overlap = tokenise(lkw).filter(w => kwWords.includes(w)).length;
        score += overlap * 2;
      }

      // Word overlap with link.topic
      const topicOverlap = tokenise(l.topic).filter(w => kwWords.includes(w)).length;
      score += topicOverlap;

      // Word overlap with link.anchor
      const anchorOverlap = tokenise(l.anchor).filter(w => kwWords.includes(w)).length;
      score += anchorOverlap;

      // Pillar pages get a priority bonus
      if (l.type === 'pillar') score += 5;

      return { link: l, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { link } of scored) {
    if (results.size >= MAX_LINKS) break;
    results.set(link.url, link);
  }

  return [...results.values()].slice(0, MAX_LINKS);
}

function tokenise(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2); // ignore very short words
}

function urlToAnchor(url) {
  // Convert URL slug to readable text: /blog/forever-stamps-price/ → "forever stamps price"
  try {
    const path = new URL(url).pathname;
    return path
      .replace(/\//g, ' ')
      .replace(/-/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || url;
  }
}
