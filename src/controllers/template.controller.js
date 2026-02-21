/**
 * Template Controller: Metadata + unified document generation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTemplateMetadata } from '../services/templateMetadata.service.js';
import { runAutomation } from '../services/automationRunner.service.js';
import { DocxGenerator } from '../services/docxGenerator.service.js';
import { previewMaskingService } from '../services/previewMasking.service.js';
import { applyDocumentFontFormat } from '../services/docxFontFormatter.service.js';
import { canDownloadFullDocx } from '../utils/subscriptionUtils.js';
import { getTemplatePath } from '../templates/templateRegistry.js';
import User from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * GET /templates/:actionSlug/metadata
 * Returns form field definitions for the given action.
 */
export async function getTemplateMetadataHandler(req, res) {
  try {
    const { actionSlug } = req.params;
    const meta = getTemplateMetadata(actionSlug);
    if (!meta.ok) {
      return res.status(404).json({ error: meta.error });
    }
    res.json(meta);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * POST /generate/:actionSlug
 * Unified document generation for any action type.
 * Uses EXACT same logic as arrange-venue controller to ensure image insertion works consistently.
 */
export async function generateDocument(req, res) {
  try {
    const { actionSlug } = req.params;
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

    const templatePath = getTemplatePath(actionSlug);
    if (!templatePath) {
      return res.status(404).json({ error: `Unknown action: ${actionSlug}` });
    }

    // Extract and sanitize images - EXACT same logic as arrange-venue controller (line-by-line match)
    // CRITICAL: Normalize image keys by stripping '%' prefix to match ImageModule behavior
    // ImageModule strips '%' when parsing {{%logo}}, so it looks for "logo" not "%logo"
    // This ensures consistent image insertion across ALL action types (arrange-venue, cancel-venue, etc.)
    const { images = {}, ...variables } = req.body;
    const sanitizedImages = {};
    const base64Regex = /^data:image\/[\w.+.-]+;base64,/;
    for (const [key, val] of Object.entries(images)) {
      if (!key || typeof key !== 'string') continue;
      
      // Normalize image key: remove '%' prefix if present (ImageModule strips it)
      // Frontend may send "%logo" but ImageModule parses {{%logo}} as "logo"
      // This normalization ensures keys match what ImageModule expects
      const normalizedKey = key.startsWith('%') ? key.substring(1) : key;
      
      if (Buffer.isBuffer(val)) {
        sanitizedImages[normalizedKey] = val;
      } else if (typeof val === 'string' && base64Regex.test(val)) {
        const base64 = val.replace(base64Regex, '');
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length > 0) {
          sanitizedImages[normalizedKey] = buffer;
        }
      }
    }

    // Run automation to get processed data - uses same flow as arrange-venue
    // IMPORTANT: Images are handled separately and passed directly to DocxGenerator
    // Automation only processes text variables, not images
    const data = runAutomation(actionSlug, variables);

    // Generate document - EXACT same logic as arrange-venue controller (line-by-line match)
    // Pass sanitizedImages directly to DocxGenerator - this is the key to image insertion
    // Image keys are normalized (without % prefix) to match ImageModule's expectations
    let buffer;
    if (previewOnly || !downloadCheck.allowed) {
      const maskedData = previewMaskingService.maskData(data);
      const generator = new DocxGenerator(templatePath, maskedData, sanitizedImages);
      buffer = generator.generate();
      buffer = previewMaskingService.injectBanner(buffer);
    } else {
      const generator = new DocxGenerator(templatePath, data, sanitizedImages);
      buffer = generator.generate();
      if (user.subscriptionStatus === 'trial') {
        await User.findByIdAndUpdate(userId, {
          $inc: { trialDocCount: 1 },
        });
      }
    }

    buffer = applyDocumentFontFormat(buffer);

    const safeSlug = actionSlug.replace(/[^a-z0-9-]/gi, '-');
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeSlug}${previewOnly ? '-preview' : ''}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
