import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';

const require = createRequire(import.meta.url);
const imageSize = require('image-size');

/**
 * DocxGenerator: Load template, inject data, embed images, return Buffer.
 * Uses docxtemplater + pizzip. Throws if any placeholder remains unresolved.
 */
export class DocxGenerator {
  /**
   * @param {string} templatePath - Absolute or relative path to .docx template
   * @param {Object} data - Variable data for placeholders
   * @param {Object} [images] - Map of placeholder names to Buffers, e.g. { logo: Buffer }
   */
  constructor(templatePath, data = {}, images = {}) {
    this.templatePath = path.resolve(templatePath);
    this.data = { ...data };
    this.images = { ...images };
  }

  /**
   * Generate the document. Replaces placeholders strictly, embeds images without resizing.
   * @returns {Buffer} Generated docx as Buffer
   */
  generate() {
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Template not found: ${this.templatePath}`);
    }

    const content = fs.readFileSync(this.templatePath, 'binary');
    const zip = new PizZip(content);

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
        // This matches exactly how arrange-venue works - unified logic for all action types
        const imageKey = tagName || tagValue;
        const buffer = this.images[imageKey];
        
        if (!buffer || !Buffer.isBuffer(buffer)) {
          const availableKeys = Object.keys(this.images).join(', ') || '(none)';
          // Enhanced error message to help debug image insertion issues
          throw new Error(
            `Unresolved image placeholder: {%${tagName || 'unknown'}}. ` +
            `Looking for key: "${imageKey}" (tagValue="${tagValue}", tagName="${tagName}"). ` +
            `Available image keys: ${availableKeys}`
          );
        }
        
        return buffer;
      },
      getSize: (img) => {
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
        return [w, h];
      },
    });

    const nullGetter = (part) => {
      const tagName = part.module ? part.value : (part.raw ?? part.value);
      throw new Error(`Unresolved placeholder: {{${tagName}}}`);
    };

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Templates in this project use {{variable}} placeholders (not {variable})
      delimiters: { start: '{{', end: '}}' },
      nullGetter,
      modules: [imageModule],
    });

    // Use tag names (not Buffers) for image placeholders so the image module calls getImage.
    // Passing Buffer makes the module treat it as pre-rendered { rId, sizePixel } and access undefined[0].
    // This matches the exact logic used in arrange-venue for consistency across all action types.
    const mergedData = { ...this.data };
    
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
