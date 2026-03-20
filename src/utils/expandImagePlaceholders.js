import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';

/**
 * Duplicate the Word paragraph (<w:p>) that contains an image placeholder like {{%logo}}
 * for each additional uploaded image.
 *
 * This lets templates remain unchanged while still rendering N uploaded images:
 * - template contains only {{%logo}}
 * - user uploads [logo1, logo2, logo3]
 * - we expand DOCX XML to include {{%logo_2}} and {{%logo_3}} paragraphs
 *
 * @param {string} templatePath
 * @param {Record<string, number>} countsByBaseKey e.g. { logo: 3 }
 * @returns {string} path to temp expanded docx (or original templatePath when no changes)
 */
export function expandImagePlaceholdersToTemp(templatePath, countsByBaseKey) {
  const keys = Object.entries(countsByBaseKey || {}).filter(([, n]) => Number(n) > 1);
  if (keys.length === 0) return templatePath;

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  // Expand each XML file where placeholders might exist.
  for (const filePath of Object.keys(zip.files || {})) {
    if (!filePath.endsWith('.xml')) continue;
    const f = zip.file(filePath);
    if (!f) continue;
    let xml;
    try {
      xml = f.asText();
    } catch {
      continue;
    }
    if (!xml || typeof xml !== 'string') continue;

    let nextXml = xml;

    for (const [baseKey, count] of keys) {
      // We support wrapped and standalone image placeholder syntaxes used in this app.
      // Most templates use {{%logo}}.
      const wrapped = `{{%${baseKey}}}`;
      const standalone = `{%${baseKey}}`;

      // Find the first paragraph that contains the placeholder.
      // Word paragraphs are <w:p> ... </w:p>.
      const findParagraphContaining = (needle) => {
        const idx = nextXml.indexOf(needle);
        if (idx === -1) return null;
        const pStart = nextXml.lastIndexOf('<w:p', idx);
        if (pStart === -1) return null;
        const pEnd = nextXml.indexOf('</w:p>', idx);
        if (pEnd === -1) return null;
        return { pStart, pEnd: pEnd + '</w:p>'.length };
      };

      let match = findParagraphContaining(wrapped) || findParagraphContaining(standalone);
      if (!match) continue;

      const para = nextXml.slice(match.pStart, match.pEnd);
      const insertAt = match.pEnd;

      // Build duplicates for 2..N replacing the placeholder tag with baseKey_#
      let dup = '';
      for (let i = 2; i <= count; i++) {
        const k = `${baseKey}_${i}`;
        const replaced = para
          .replaceAll(`{{%${baseKey}}}`, `{{%${k}}}`)
          .replaceAll(`{%${baseKey}}`, `{%${k}}`);
        dup += replaced;
      }

      nextXml = nextXml.slice(0, insertAt) + dup + nextXml.slice(insertAt);
    }

    if (nextXml !== xml) {
      zip.file(filePath, nextXml);
    }
  }

  const outBuf = zip.generate({ type: 'nodebuffer' });
  const tmpName = `expanded-${crypto.randomBytes(8).toString('hex')}.docx`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(tmpPath, outBuf);
  return tmpPath;
}

