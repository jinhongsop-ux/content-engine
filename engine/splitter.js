/**
 * splitter.js
 *
 * Splits raw model output into:
 *   - html:     the clean <article> block
 *   - meta:     the parsed metadata JSON object
 *   - complete: boolean — true only if both blocks were found and parsed
 *   - error:    string | null
 *
 * Expected input format:
 *
 *   ===HTML_START===
 *   <article>...</article>
 *   ===HTML_END===
 *   ===META_START===
 *   { ...valid JSON... }
 *   ===META_END===
 *
 * Defensive handling:
 *   - Markdown code fences around JSON are stripped
 *   - Whitespace/newlines around delimiters are tolerated
 *   - If HTML block is missing closing </article>, flags for continuation
 *   - If JSON block is malformed, returns partial result with error
 */

const HTML_START = '===HTML_START===';
const HTML_END   = '===HTML_END===';
const META_START = '===META_START===';
const META_END   = '===META_END===';

export function split(rawOutput) {
  const result = {
    html:         null,
    meta:         null,
    complete:     false,
    truncated:    false,
    error:        null,
    warnings:     [],
  };

  if (!rawOutput || typeof rawOutput !== 'string') {
    result.error = 'Empty or non-string model output';
    return result;
  }

  // ── Extract HTML block ────────────────────────────────────────────────────
  const htmlStartIdx = rawOutput.indexOf(HTML_START);
  const htmlEndIdx   = rawOutput.indexOf(HTML_END);

  if (htmlStartIdx === -1) {
    result.error = 'Missing ===HTML_START=== delimiter';
    return result;
  }

  let htmlRaw = '';
  if (htmlEndIdx > htmlStartIdx) {
    htmlRaw = rawOutput.slice(htmlStartIdx + HTML_START.length, htmlEndIdx).trim();
  } else {
    // HTML_END is missing — output was truncated
    htmlRaw = rawOutput.slice(htmlStartIdx + HTML_START.length).trim();
    result.truncated = true;
    result.warnings.push('HTML block not closed — output may be truncated');
  }

  result.html = htmlRaw;

  // Validate HTML block basics
  if (!htmlRaw.includes('<article')) {
    result.error = 'HTML block missing <article> opening tag';
    return result;
  }

  if (!htmlRaw.includes('</article>')) {
    result.truncated = true;
    result.warnings.push('HTML block missing </article> closing tag — continuation may be needed');
  }

  // ── Extract META block ────────────────────────────────────────────────────
  const metaStartIdx = rawOutput.indexOf(META_START, htmlEndIdx > -1 ? htmlEndIdx : htmlStartIdx);
  const metaEndIdx   = rawOutput.indexOf(META_END,   metaStartIdx);

  if (metaStartIdx === -1) {
    result.error = result.truncated
      ? 'Output truncated before metadata block'
      : 'Missing ===META_START=== delimiter';
    return result;
  }

  let metaRaw = '';
  if (metaEndIdx > metaStartIdx) {
    metaRaw = rawOutput.slice(metaStartIdx + META_START.length, metaEndIdx).trim();
  } else {
    metaRaw = rawOutput.slice(metaStartIdx + META_START.length).trim();
    result.warnings.push('META block not closed');
  }

  // Strip markdown code fences if model wrapped JSON in ```json ... ```
  metaRaw = metaRaw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/,      '')
    .replace(/\s*```$/,      '')
    .trim();

  // Parse JSON
  try {
    result.meta = JSON.parse(metaRaw);
  } catch (e) {
    result.warnings.push(`Metadata JSON parse failed: ${e.message}`);
    result.meta = null;
    // Don't return early — HTML may still be usable
  }

  // ── Mark complete ─────────────────────────────────────────────────────────
  result.complete = (
    result.html &&
    result.html.includes('<article') &&
    result.html.includes('</article>') &&
    result.meta !== null
  );

  return result;
}

/**
 * buildContinuationPrompt
 *
 * If the model output was truncated, this builds a prompt to continue it.
 * Should be passed as a new user message in the same conversation.
 */
export function buildContinuationPrompt(partialHtml) {
  // Find the last complete tag in the partial HTML
  const lastTagMatch = partialHtml.match(/<\/\w+>\s*$/);
  const cutPoint = lastTagMatch
    ? partialHtml.slice(partialHtml.lastIndexOf(lastTagMatch[0]) + lastTagMatch[0].length).trim()
    : '(no clean cut point found)';

  return `Your previous response was cut off. Continue from exactly where you left off.

The last complete content in your HTML was:
"...${partialHtml.slice(-300)}"

Continue the article HTML from that point, then close the </article> tag and output the complete ===META_START=== JSON block.

Do not repeat any content from before the cut-off point. Do not rewrite sections already written. Just continue and complete.`;
}
