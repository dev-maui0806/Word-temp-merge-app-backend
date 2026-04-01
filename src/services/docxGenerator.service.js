import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';
import { removeMeetingTypeSectionsFromDocx } from '../utils/removeMeetingTypeSections.js';

const require = createRequire(import.meta.url);
const imageSize = require('image-size');

// Tiny 1x1 transparent PNG used as a safe fallback when an image
// placeholder is present in the template but no image was provided.
// This keeps image fields effectively optional and prevents generation errors.
const EMPTY_IMAGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z3XQAAAAASUVORK5CYII=',
  'base64'
);

function normalizeImageKey(key) {
  if (key == null) return '';
  // Word sometimes introduces NBSP or stray whitespace into tags when editing.
  return String(key).replace(/\u00A0/g, ' ').trim();
}

function normalizeInlineText(value) {
  if (typeof value !== 'string') return value;
  // Prevent accidental hard line breaks in inline placeholders.
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function relaxForcedBreaksInVariableParagraphs(xml) {
  if (!xml || typeof xml !== 'string') return xml;

  // If a paragraph contains template placeholders, hard breaks (<w:br/> / <w:cr/>)
  // can leave large blank areas after merge when real values are shorter.
  // Replace those forced breaks with a normal space so Word can wrap naturally.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!paragraph.includes('{{')) return paragraph;
    return paragraph.replace(/<w:br\s*\/>|<w:cr\s*\/>/g, '<w:t xml:space="preserve"> </w:t>');
  });
}

/**
 * DocxGenerator: Load template, inject data, embed images, return Buffer.
 * Uses docxtemplater + pizzip. Missing placeholders are rendered as blank.
 */
export class DocxGenerator {
  /**
   * @param {string} templatePath - Absolute or relative path to .docx template
   * @param {Object} data - Variable data for placeholders
   * @param {Object} [images] - Map of placeholder names to Buffers, e.g. { logo: Buffer }
   * @param {Object} [imageLayout] - Optional per-image layout config, e.g. { logo: { widthPercent: 60 } }
   */
  constructor(templatePath, data = {}, images = {}, imageLayout = {}) {
    this.templatePath = path.resolve(templatePath);
    this.data = { ...data };
    this.images = { ...images };
    this.imageLayout = imageLayout && typeof imageLayout === 'object' ? { ...imageLayout } : {};
  }

  /**
   * Generate the document. Replaces placeholders strictly, embeds images without resizing.
   * @returns {Buffer} Generated docx as Buffer
   */
  generate() {
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Template not found: ${this.templatePath}`);
    }

    // If Meeting_Type is "None", hide any template text block containing the
    // Meeting_Type placeholder to avoid leaving empty brackets/punctuation.
    let templatePathToUse = this.templatePath;
    if (
      this.data &&
      typeof this.data.Meeting_Type === 'string' &&
      (this.data.Meeting_Type.trim() === '' || this.data.Meeting_Type.trim().toLowerCase() === 'none')
    ) {
      templatePathToUse = removeMeetingTypeSectionsFromDocx(templatePathToUse);
    }

    const content = fs.readFileSync(templatePathToUse, 'binary');
    const zip = new PizZip(content);

    // Normalize variable paragraphs before templating to avoid fixed wrap points
    // from author-time manual line breaks.
    for (const filePath of Object.keys(zip.files || {})) {
      if (!/^word\/.*\.xml$/.test(filePath)) continue;
      const f = zip.file(filePath);
      if (!f) continue;
      let xml;
      try {
        xml = f.asText();
      } catch {
        continue;
      }
      const nextXml = relaxForcedBreaksInVariableParagraphs(xml);
      if (nextXml !== xml) {
        zip.file(filePath, nextXml, { binary: false });
      }
    }

    // Default "fit within margins" sizing.
    // NOTE: docxtemplater-image-module expects pixel sizes.
    // We pick conservative defaults that prevent oversized images in typical Word docs.
    const DEFAULT_MAX_WIDTH_PX = 600;
    const DEFAULT_MAX_HEIGHT_PX = 750;

    const imageModule = new ImageModule({
      fileType: 'docx',
      centered: false,
      getImage: (tagValue, tagName) => {
        // For {{%logo}} syntax:
        // - Docxtemplater parses {{%logo}} and extracts "%logo" as content
        // - ImageModule.parse sees "%logo" starts with "%", extracts "logo" as part.value
        // - During render, ImageModule calls scopeManager.getValue("logo", ...) which returns mergedData["logo"]
        // - We set mergedData.logo = "logo" (string), so tagValue = "logo"
        // - ImageModule calls getImage("logo", "logo") where both are "logo"
        // - We look up this.images["logo"] to get the Buffer

        // Use tagName as primary key (this is the extracted name from the template)
        // ImageModule strips '%' prefix when parsing {{%logo}}, so tagName is "logo" (not "%logo")
        // We normalize image keys in the controller, so this.images has "logo" (not "%logo")
        // This matches exactly how arrange-venue works - unified logic for all action types.
        const imageKey = normalizeImageKey(tagName || tagValue);
        const buffer = this.images[imageKey];

        // If no image was uploaded for this placeholder, fall back to a tiny
        // transparent PNG so that image fields behave as optional and do not
        // block preview or document generation.
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
          return EMPTY_IMAGE_PNG;
        }

        return buffer;
      },
      getSize: (img, tagValue, tagName) => {
        let w = 300;
        let h = 200;
        try {
          const dimensions = imageSize(img);
          if (dimensions && typeof dimensions.width === 'number' && typeof dimensions.height === 'number') {
            w = Math.max(1, Math.min(6000, dimensions.width));
            h = Math.max(1, Math.min(6000, dimensions.height));
          }
        } catch {
          /* image-size may fail for some formats */
        }

        const key = normalizeImageKey(tagName || tagValue);
        const layout = key && this.imageLayout ? this.imageLayout[key] : undefined;

        // User-provided sizing (optional). We accept widthPercent (preferred) and widthPx/heightPx.
        // - widthPercent is interpreted as % of the default max width (content width proxy).
        // - We keep aspect ratio unless both width and height are provided.
        if (layout && typeof layout === 'object') {
          const widthPercent = Number(layout.widthPercent);
          const widthPx = Number(layout.widthPx);
          const heightPx = Number(layout.heightPx);

          // widthPercent: 1..100
          if (Number.isFinite(widthPercent) && widthPercent > 0) {
            const maxW = DEFAULT_MAX_WIDTH_PX;
            const targetW = Math.max(1, Math.round((Math.min(100, widthPercent) / 100) * maxW));
            const ratio = targetW / w;
            return [targetW, Math.max(1, Math.round(h * ratio))];
          }

          // Explicit px sizing (rare). If only one dimension provided, preserve aspect ratio.
          if (Number.isFinite(widthPx) && widthPx > 0 && Number.isFinite(heightPx) && heightPx > 0) {
            return [Math.max(1, Math.round(widthPx)), Math.max(1, Math.round(heightPx))];
          }
          if (Number.isFinite(widthPx) && widthPx > 0) {
            const ratio = widthPx / w;
            return [Math.max(1, Math.round(widthPx)), Math.max(1, Math.round(h * ratio))];
          }
          if (Number.isFinite(heightPx) && heightPx > 0) {
            const ratio = heightPx / h;
            return [Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(heightPx))];
          }
        }

        // Default: fit within max bounds, preserve aspect ratio (prevents "excessive zoom").
        const maxW = DEFAULT_MAX_WIDTH_PX;
        const maxH = DEFAULT_MAX_HEIGHT_PX;
        const scale = Math.min(maxW / w, maxH / h, 1);
        return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
      },
    });

    const nullGetter = () => {
      // Treat missing or null variables as empty strings so that:
      // - Preview works even when some fields are left blank
      // - Typos/mismatches in template placeholders do not crash generation
      return '';
    };

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      // Keep paragraph flow controlled by template layout only.
      linebreaks: false,
      // Templates in this project use {{variable}} placeholders (not {variable})
      delimiters: { start: '{{', end: '}}' },
      nullGetter,
      modules: [imageModule],
    });

    // Use tag names (not Buffers) for image placeholders so the image module calls getImage.
    // Passing Buffer makes the module treat it as pre-rendered { rId, sizePixel } and access undefined[0].
    // This matches the exact logic used in arrange-venue for consistency across all action types.
    const mergedData = Object.fromEntries(
      Object.entries(this.data || {}).map(([k, v]) => [k, normalizeInlineText(v)])
    );
    
    // Set image keys in mergedData so ImageModule can resolve them
    // IMPORTANT: Set image keys AFTER spreading this.data to ensure they're not overwritten by automation
    // This is EXACTLY the same logic as arrange-venue uses - unified for all action types
    // For {{%logo}} syntax:
    // - Docxtemplater parses {{%logo}} and extracts "%logo" as content
    // - ImageModule.parse sees "%logo" starts with "%", extracts "logo" as part.value (strips %)
    // - During render, ImageModule calls scopeManager.getValue("logo", ...) which returns mergedData["logo"]
    // - We set mergedData.logo = "logo" (the string key name, normalized without %)
    // - ImageModule calls getImage("logo", "logo") and we look up this.images["logo"]
    // Image keys are normalized in the controller (stripped of % prefix), so they match ImageModule's expectations
    for (const key of Object.keys(this.images)) {
      if (key && typeof key === 'string') {
        // Set the key name as the value (string) so ImageModule can resolve it
        // This ensures ImageModule's render method gets a truthy string value
        // This is the EXACT same approach used in arrange-venue - unified logic
        mergedData[key] = String(key);
      }
    }
    
    doc.render(mergedData);

    return doc.toBuffer();
  }
}
