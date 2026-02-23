import PizZip from 'pizzip';

/**
 * Extract plain text from a DOCX buffer (final merged document).
 * Reads word/document.xml and strips OOXML to get readable text.
 * @param {Buffer} docxBuffer - Generated .docx file buffer
 * @returns {string} Extracted plain text
 */
export function extractTextFromDocx(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    return '';
  }

  let xml = docFile.asText();

  // Line breaks within paragraphs
  xml = xml.replace(/<w:br\s*\/?>/gi, '\n');
  // Paragraph breaks
  xml = xml.replace(/<\/w:p\s*>/gi, '\n');

  // Remove all XML tags so we keep only text content
  xml = xml.replace(/<[^>]+>/g, '');

  // Decode common XML entities
  xml = xml
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Optional: decode numeric entities &#x1A; and &#26;
  xml = xml.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
  xml = xml.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  // Collapse multiple spaces/newlines and trim
  return xml.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}
