export function clean(html) {
  if (!html || typeof html !== 'string') return '';
  let out = html.trim();

  out = out.replace(/<!DOCTYPE[^>]*>/gi, '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<meta\b[^>]*\/?>/gi, '');
  out = out.replace(/<link\b[^>]*\/?>/gi, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/```(?:html|json)?/gi, '').replace(/```/g, '');

  for (const tag of ['html', 'head', 'body', 'nav', 'footer', 'header']) {
    out = out.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '');
    out = out.replace(new RegExp(`</${tag}>`, 'gi'), '');
  }

  out = out.replace(/\s+on\w+="[^"]*"/gi, '');
  out = out.replace(/\s+on\w+='[^']*'/gi, '');
  out = out.replace(/\s+style="[^"]*"/gi, '');
  out = out.replace(/^#{1,6}\s+(.+)$/gm, '<p>$1</p>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const markerPatterns = [
    /\[TODO[^\]]*\]/gi,
    /\[EDIT[^\]]*\]/gi,
    /\[INSERT[^\]]*\]/gi,
    /\[PLACEHOLDER[^\]]*\]/gi,
    /\[IMAGE[^\]]*\]/gi,
    /\bTODO\b/gi,
    /\bneeds verification\b/gi,
    /\bverify this\b/gi,
    /\bnote to editor\b/gi,
  ];
  for (const pattern of markerPatterns) out = out.replace(pattern, '');

  out = out.replace(/<p[^>]*>\s*(Last updated|Published|Last reviewed):.*?<\/p>/gi, '');
  out = out.replace(/<p[^>]*>\s*(?:&nbsp;|\s)*<\/p>/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  const articleStart = out.search(/<article\b/i);
  if (articleStart > 0) out = out.slice(articleStart);
  if (articleStart < 0) out = `<article>\n${out}\n</article>`;
  if (!/<\/article>\s*$/i.test(out)) out += '\n</article>';

  return out.trim();
}
