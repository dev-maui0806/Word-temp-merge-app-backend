import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';

/**
 * This project renders templates with Docxtemplater delimiters {{ ... }}.
 * Some templates may contain legacy image placeholders using the single-brace syntax:
 *   {%logo} or {%logo_2}
 *
 * Docxtemplater will NOT parse those when delimiters are {{ }}.
 *
 * This function rewrites DOCX XML so any `{%name}` is converted to `{{%name}}`,
 * ensuring images render consistently in both preview and final DOCX.
 *
 * @param {string} templatePath
 * @returns {string} path to a temp docx (or original path if no changes)
 */
export function normalizeImagePlaceholdersToTemp(templatePath) {
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

    // Convert `{%name}` to `{{%name}}` (only image placeholders).
    // We avoid touching `{{...}}` placeholders or other braces.
    let nextXml = xml.replace(/\{%([^}#/]+)\}/g, (_m, name) => `{{%${String(name).trim()}}}`);

    // IMPORTANT:
    // Docxtemplater-image-module-free can fail to render multiple image tags that appear
    // within the SAME Word paragraph (<w:p>), often resulting in only the first image showing.
    // Many templates place tags on one line like: {{%logo}} {{%logo_2}} {{%logo_3}}
    //
    // To make rendering reliable, split any paragraph containing multiple image tags into
    // multiple paragraphs, each containing exactly one tag.
    const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
    const imageTagRegex = /\{\{%[^}#/]+\}\}/g; // matches {{%logo}} / {{%logo_2}} etc.

    nextXml = nextXml.replace(paragraphRegex, (para) => {
      const tags = para.match(imageTagRegex) || [];
      if (tags.length <= 1) return para;
      changed = true;

      // Build one paragraph per tag by cloning the original paragraph
      // and keeping only that tag (remove all other image tags).
      return tags
        .map((keepTag) => {
          let p = para;
          for (const t of tags) {
            if (t !== keepTag) p = p.split(t).join('');
          }
          // If the paragraph became empty of visible text except tag artifacts,
          // ensure the kept tag remains.
          if (!p.includes(keepTag)) {
            // Insert the tag near where the first tag was.
            const insertAt = p.indexOf('</w:p>');
            if (insertAt !== -1) {
              p = p.slice(0, insertAt) + keepTag + p.slice(insertAt);
            }
          }
          return p;
        })
        .join('');
    });

    if (nextXml !== xml) {
      changed = true;
      zip.file(filePath, nextXml);
    }
  }

  if (!changed) return templatePath;

  const outBuf = zip.generate({ type: 'nodebuffer' });
  const tmpName = `normalized-${crypto.randomBytes(8).toString('hex')}.docx`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(tmpPath, outBuf);
  return tmpPath;
}

