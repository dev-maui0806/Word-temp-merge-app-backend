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
    paragraph.replace(/<w:br\s*\/>|<w:cr\s*\/>/g, '<w:t xml:space="preserve"> </w:t>')
  );
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
    zip.file(relPath, xml, { binary: false });
  }

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
