/** Extrait le contenu affichable (sans DOCTYPE / html / head). */
function extractVerificationBodyFragment(fullHtml) {
  if (!fullHtml || typeof fullHtml !== 'string') return '';
  const trimmed = fullHtml.trim();
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();
  if (/<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)) {
    return trimmed
      .replace(/<!DOCTYPE[\s\S]*?>/i, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/i, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim();
  }
  return trimmed;
}

function plainTextFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  extractVerificationBodyFragment,
  plainTextFromHtml,
};
