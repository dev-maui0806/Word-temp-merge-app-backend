import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArrangeVenueAutomations } from '../services/arrangeVenue.service.js';
import { DocxGenerator } from '../services/docxGenerator.service.js';
import { previewMaskingService } from '../services/previewMasking.service.js';
import { applyDocumentFontFormat } from '../services/docxFontFormatter.service.js';
import { canDownloadFullDocx } from '../utils/subscriptionUtils.js';
import User from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/arrangeVenue.docx');

/**
 * POST /generate-arrange-venue
 * Flow: validate subscription → run automations → validate vars → generate → increment count → return buffer
 * Trial: blocked at 5 docs or 7 days. Hard block prevents full DOCX; preview always allowed.
 */
export async function generateArrangeVenue(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previewOnly = req.body.preview === true;

    const downloadCheck = canDownloadFullDocx(user);
    if (!previewOnly && !downloadCheck.allowed) {
      return res.status(403).json({
        error: 'Full document download blocked',
        code: 'TRIAL_LIMIT',
        reason: downloadCheck.reason,
        message: 'Preview is still available. Upgrade to download the complete document.',
      });
    }

    const { images = {}, ...variables } = req.body;
    const sanitizedImages = {};
    const base64Regex = /^data:image\/[\w.+.-]+;base64,/;
    for (const [key, val] of Object.entries(images)) {
      if (!key || typeof key !== 'string') continue;
      if (Buffer.isBuffer(val)) {
        sanitizedImages[key] = val;
      } else if (typeof val === 'string' && base64Regex.test(val)) {
        const base64 = val.replace(base64Regex, '');
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length > 0) {
          sanitizedImages[key] = buffer;
        }
      }
    }

    const data = runArrangeVenueAutomations(variables);

    let buffer;
    if (previewOnly || !downloadCheck.allowed) {
      const maskedData = previewMaskingService.maskData(data);
      const generator = new DocxGenerator(TEMPLATE_PATH, maskedData, sanitizedImages);
      buffer = generator.generate();
      buffer = previewMaskingService.injectBanner(buffer);
    } else {
      const generator = new DocxGenerator(TEMPLATE_PATH, data, sanitizedImages);
      buffer = generator.generate();
      if (user.subscriptionStatus === 'trial') {
        await User.findByIdAndUpdate(userId, {
          $inc: { trialDocCount: 1 },
        });
      }
    }

    buffer = applyDocumentFontFormat(buffer);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="arrange-venue${previewOnly ? '-preview' : ''}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
