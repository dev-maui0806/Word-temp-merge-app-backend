import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import PizZip from 'pizzip';

/**
 * Placeholders that indicate a multi-field narrative paragraph (e.g. arrange-venue
 * body: booking times + venue + meeting type in one <w:p>). If we removed every
 * paragraph containing `Meeting_Type`, that whole block would disappear when
 * Meeting_Type is "None", not just the meeting-type clause.
 */
const COMPOUND_PARAGRAPH_MARKERS = [
  'Start_Time_For_Booking_Venue',
  'End_Time_For_Booking_Venue',
  'Venue_Name',
  'Country_Code',
  'Venue_Number',
];

function isStandaloneMeetingTypeParagraph(paragraphXml) {
  for (const marker of COMPOUND_PARAGRAPH_MARKERS) {
    if (paragraphXml.includes(marker)) return false;
  }
  return true;
}

/**
 * When Meeting_Type is "None" (empty string), templates often render the
 * placeholder as empty string, leaving behind punctuation/brackets and
 * fragments of the sentence.
 *
 * Standalone paragraphs that only exist to show Meeting_Type can be removed
 * entirely. Paragraphs that also contain booking times, venue, etc. must stay
 * so the rest of the letter still merges; only `{{Meeting_Type}}` becomes blank.
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

    // Remove only standalone paragraphs whose main content is Meeting_Type.
    // Important: avoid crossing paragraph boundaries (docx XML is flat text).
    const paragraphWithTokenRegex = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*Meeting_Type(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g;
    const nextXml = xml.replace(paragraphWithTokenRegex, (fullPara) =>
      isStandaloneMeetingTypeParagraph(fullPara) ? '' : fullPara
    );
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

