import PizZip from 'pizzip';

const NEW_RPR_DEFAULT = `<w:rPrDefault>
    <w:rPr>
      <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos" w:eastAsia="Aptos"/>
      <w:sz w:val="26"/>
      <w:szCs w:val="26"/>
      <w:color w:val="000000"/>
      <w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>
    </w:rPr>
  </w:rPrDefault>`;

const RPR_DEFAULT_RE = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/;

function applyFontToStylesXml(xml) {
  if (RPR_DEFAULT_RE.test(xml)) {
    return xml.replace(RPR_DEFAULT_RE, NEW_RPR_DEFAULT);
  }
  return xml;
}

/**
 * Merged text keeps the template run's w:color (e.g. red placeholders). Force black everywhere.
 */
function normalizeRunColorsToBlack(xml) {
  if (!xml || typeof xml !== 'string') return xml;
  let out = xml.replace(/<w:color\b[^>]*\/>/g, '<w:color w:val="000000"/>');
  out = out.replace(/<w:highlight\b[^>]*\/>/g, '');
  return out;
}

/**
 * After merge, manual line breaks inside paragraphs can leave awkward gaps; use a normal space.
 * (Template-time relaxation only runs while `{{` tags exist; this runs on the final document.xml.)
 */
function relaxForcedBreaksInAllParagraphs(xml) {
  if (!xml || typeof xml !== 'string') return xml;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) =>
    paragraph.replace(/<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g, '<w:t xml:space="preserve"> </w:t>')
  );
}

/**
 * Some templates keep image placeholders malformed/split across Word runs.
 * When Docxtemplater-image-module fails to fully consume them, you can end up
 * with leftover placeholder text (e.g. `%logo_4` or `{{%logo2}}`) rendered as
 * plain text near/below images.
 *
 * This strips only logo-placeholder-like tokens to avoid showing stray digits.
 */
function stripLeftoverLogoPlaceholderTokens(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  let out = xml;

  // Braced/wrapped placeholders still present
  out = out.replace(/\{\{%\s*logo_?\d*\s*\}\}/gi, '');

  // Legacy single-brace placeholders
  out = out.replace(/\{%\s*logo_?\d*\s*%\}/gi, '');
  out = out.replace(/\{%\s*logo_?\d*\s*\}/gi, '');

  // Unbraced tokens (common in HTML conversions / partial consumption)
  // Examples: %logo4, %logo_3, %logo2, %logo
  out = out.replace(/%logo_?\d*/gi, '');

  // Sometimes `%` can be lost during conversion, leaving bare tokens like `logo_4`.
  out = out.replace(/\blogo_?\d+\b/gi, '');

  // If docxtemplater-image-module inserted an image but left behind a standalone
  // digit run right after the drawing, remove that digit run.
  out = out.replace(
    /(<w:drawing\b[\s\S]*?<\/w:drawing>\s*)<w:r\b[^>]*>\s*<w:t\b[^>]*>\s*\(?\d+\)?\s*<\/w:t>\s*<\/w:r>/g,
    '$1'
  );

  return out;
}

/**
 * Applies document-wide font formatting to a generated DOCX buffer.
 * - Font: Aptos
 * - Size: 13pt
 * - Color: Black (including merged values that inherited placeholder coloring)
 * - document.xml: softens hard line breaks inside paragraphs for continuous body text
 */
export function applyDocumentFontFormat(buffer) {
  const zip = new PizZip(buffer);

  for (const relPath of Object.keys(zip.files || {})) {
    if (!/^word\/.*\.xml$/.test(relPath)) continue;
    const file = zip.file(relPath);
    if (!file || file.dir) continue;
    let xml = file.asText();
    if (relPath === 'word/styles.xml' || relPath === 'word/stylesWithEffects.xml') {
      xml = applyFontToStylesXml(xml);
    }
    xml = normalizeRunColorsToBlack(xml);
    if (relPath === 'word/document.xml') {
      xml = relaxForcedBreaksInAllParagraphs(xml);
    }

    // Strip any leftover placeholder tokens near/below images.
    // Do this for document + headers/footers as well.
    if (
      relPath === 'word/document.xml' ||
      /^word\/(header\d+|footer\d+)\.xml$/.test(relPath)
    ) {
      xml = stripLeftoverLogoPlaceholderTokens(xml);
    }
    zip.file(relPath, xml, { binary: false });
  }

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
