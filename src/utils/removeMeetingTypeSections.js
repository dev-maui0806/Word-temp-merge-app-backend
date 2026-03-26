import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import PizZip from 'pizzip';

/**
 * When Meeting_Type is "None" (empty string), templates often render the
 * placeholder as empty string, leaving behind punctuation/brackets and
 * fragments of the sentence.
 *
 * Requirement: hide the entire text that contains the Meeting_Type field.
 *
 * This removes any <w:p> paragraph that contains the Meeting_Type placeholder
 * token in template XML. It's a pragmatic approach that matches how these
 * templates are authored (Meeting_Type usually lives within a single paragraph).
 *
 * @param {string} templatePath - DOCX file path
 * @returns {string} A (possibly) temp docx path to use for rendering
 */
export function removeMeetingTypeSectionsFromDocx(templatePath) {
  if (!templatePath) return templatePath;

  if (!fs.existsSync(templatePath)) return templatePath;

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  let changed = false;

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

    // Remove entire paragraphs containing the Meeting_Type placeholder.
    // Important: avoid crossing paragraph boundaries (docx XML is flat text).
    // We do this by forbidding any closing </w:p> before/after the token within
    // the match. This prevents accidental deletion from the beginning of the
    // document up to the first later occurrence of Meeting_Type.
    const paragraphWithTokenRegex = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*Meeting_Type(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g;
    const nextXml = xml.replace(paragraphWithTokenRegex, '');
    if (nextXml !== xml) {
      changed = true;
      zip.file(filePath, nextXml, { binary: false });
    }
  }

  if (!changed) return templatePath;

  const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const tmpName = `meetingtype-${crypto.randomBytes(8).toString('hex')}.docx`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(tmpPath, outBuf);
  return tmpPath;
}

