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
 * Applies document-wide font formatting to a generated DOCX buffer.
 * - Font: Aptos
 * - Size: 13pt
 * - Color: Black
 */
export function applyDocumentFontFormat(buffer) {
  const zip = new PizZip(buffer);

  for (const path of ['word/styles.xml', 'word/stylesWithEffects.xml']) {
    const file = zip.file(path);
    if (file) {
      const xml = applyFontToStylesXml(file.asText());
      zip.file(path, xml, { binary: false });
    }
  }

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
