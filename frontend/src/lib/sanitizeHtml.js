import DOMPurify from 'dompurify';

const RICH_TEXT_TAGS = ['b', 'strong', 'em', 'i', 'br', 'p', 'ul', 'ol', 'li', 'span'];

/** Sanitiza texto enriquecido procedente del API o de modelos de IA. */
export function sanitizeRichText(value) {
  return DOMPurify.sanitize(String(value ?? ''), {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: [],
  });
}
