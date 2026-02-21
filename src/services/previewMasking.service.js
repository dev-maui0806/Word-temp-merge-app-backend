import PizZip from 'pizzip';

const MASK = '•••••';

/**
 * Sensitive variables to mask for trial preview.
 * Personal/identifiable data that must not be exposed in trial.
 */
const SENSITIVE_VARIABLES = [
  'Claimant_Name',
  'Reception_Person_Name',
  'Venue_Address',
  'Venue_Name',
  'Venue_Number',
];

const PREVIEW_BANNER = `Trial Preview – Limited View
Some details are hidden during the free trial.
Download the DOCX to get the complete document.`;

/**
 * Escapes text for safe use in XML.
 */
function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds the banner paragraph XML for docx.
 */
function buildBannerParagraphXml() {
  const lines = PREVIEW_BANNER.split('\n');
  const runs = lines
    .flatMap((line, i) => {
      const text = escapeXml(line);
      const parts = [`<w:t xml:space="preserve">${text}</w:t>`];
      if (i < lines.length - 1) {
        parts.push('<w:br/>');
      }
      return parts;
    })
    .join('');

  return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r>${runs}</w:r></w:p>`;
}

const BANNER_XML = buildBannerParagraphXml();

/**
 * Preview Masking Service for trial users.
 * Replaces sensitive variables with •••••, enforces server-side masking,
 * ensures copy-paste cannot reconstruct content, injects mandatory preview banner.
 */
export const previewMaskingService = {
  /**
   * Returns list of variable keys that are masked in trial preview.
   */
  getSensitiveVariables() {
    return [...SENSITIVE_VARIABLES];
  },

  /**
   * Masks sensitive variables in data. Server-side only.
   * Copy-paste returns only •••••, original content is never in the output.
   * @param {Object} data - Full variable data
   * @param {string[]} [sensitiveKeys] - Override sensitive keys (default: SENSITIVE_VARIABLES)
   * @returns {Object} Shallow copy with sensitive values replaced by •••••
   */
  maskData(data, sensitiveKeys = SENSITIVE_VARIABLES) {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const masked = { ...data };
    const keysToMask = new Set(sensitiveKeys);

    for (const key of Object.keys(masked)) {
      if (keysToMask.has(key) && masked[key] != null && masked[key] !== '') {
        masked[key] = MASK;
      }
    }

    return masked;
  },

  /**
   * Injects the mandatory trial preview banner at the top of the docx.
   * @param {Buffer} docxBuffer - Generated docx buffer
   * @returns {Buffer} Buffer with banner injected
   */
  injectBanner(docxBuffer) {
    const zip = new PizZip(docxBuffer);
    const docPath = 'word/document.xml';

    const docFile = zip.file(docPath);
    if (!docFile) {
      throw new Error('Invalid docx: word/document.xml not found');
    }

    let xml = docFile.asText();
    const bodyMatch = xml.match(/<w:body[^>]*>/);
    if (!bodyMatch) {
      throw new Error('Invalid docx: could not find w:body');
    }

    const insertAfter = bodyMatch[0];
    const insertion = insertAfter + BANNER_XML;
    xml = xml.replace(insertAfter, insertion);

    zip.file(docPath, xml, { binary: false });
    return zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  },

};
