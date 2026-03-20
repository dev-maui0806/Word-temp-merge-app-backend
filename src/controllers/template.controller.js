/**
 * Template Controller: Metadata + unified document generation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTemplateMetadata } from '../services/templateMetadata.service.js';
import { extractVariablesFromDocx } from '../services/templateMetadata.service.js';
import { runAutomation } from '../services/automationRunner.service.js';
import { DocxGenerator } from '../services/docxGenerator.service.js';
import { previewMaskingService } from '../services/previewMasking.service.js';
import { applyDocumentFontFormat } from '../services/docxFontFormatter.service.js';
import { canDownloadFullDocx, isAdmin } from '../utils/subscriptionUtils.js';
import { getTemplatePath } from '../templates/templateRegistry.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import { extractTextFromDocx } from '../utils/docxTextExtract.js';
import HTMLToDOCX from 'html-to-docx';
import { normalizeImagePlaceholdersToTemp } from '../utils/normalizeImagePlaceholders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function slugToTitle(slug = '') {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildFolderName(eventDateIso, claimantName) {
  if (!eventDateIso) return '';
  const d = new Date(eventDateIso);
  if (Number.isNaN(d.getTime())) return '';
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const month = monthNames[d.getMonth()];
  const day = d.getDate(); // 1–31, no leading zero
  const year = d.getFullYear();
  const name = (claimantName || '').trim() || 'Unknown';
  return `${month} ${day} ${name} ${year}`;
}

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

    // Normalize legacy `{%logo}` style image placeholders to `{{%logo}}`
    // so images render consistently with {{ }} delimiters.
    const effectiveTemplatePath = normalizeImagePlaceholdersToTemp(templatePath);

    // Extract and sanitize images - EXACT same logic as arrange-venue controller (line-by-line match)
    // CRITICAL: Normalize image keys by stripping '%' prefix to match ImageModule behavior
    // ImageModule strips '%' when parsing {{%logo}}, so it looks for "logo" not "%logo"
    // This ensures consistent image insertion across ALL action types (arrange-venue, cancel-venue, etc.)
    const { images = {}, imageLayout = {}, ...variables } = req.body;
    const sanitizedImages = {};
    const base64Regex = /^data:image\/[\w.+.-]+;base64,/;

    const shouldDebugImages =
      process.env.DEBUG_IMAGES === '1' ||
      Object.values(images || {}).some((v) => Array.isArray(v) && v.length > 1);
    if (shouldDebugImages) {
      const summary = Object.fromEntries(
        Object.entries(images || {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? `array(${v.length})` : typeof v,
        ])
      );
      console.log('[images] actionSlug=', actionSlug, 'preview=', previewOnly, 'keys=', summary);
      try {
        const vars = extractVariablesFromDocx(templatePath);
        const hasLogo2 = vars.includes('logo_2');
        const hasLogo3 = vars.includes('logo_3');
        const hasLogo4 = vars.includes('logo_4');
        const hasLogo5 = vars.includes('logo_5');
        console.log('[images] template tags:', {
          has_logo: vars.includes('logo'),
          has_logo_2: hasLogo2,
          has_logo_3: hasLogo3,
          has_logo_4: hasLogo4,
          has_logo_5: hasLogo5,
        });
      } catch (e) {
        console.log('[images] template tag scan failed:', e?.message || String(e));
      }
    }

    for (const [key, val] of Object.entries(images)) {
      if (!key || typeof key !== 'string') continue;
      
      // Normalize image key: remove '%' prefix if present (ImageModule strips it)
      // Frontend may send "%logo" but ImageModule parses {{%logo}} as "logo"
      // This normalization ensures keys match what ImageModule expects
      const normalizedKey = key.startsWith('%') ? key.substring(1) : key;
      
      const pushOne = (imgVal, idx) => {
        const outKey = idx === 0 ? normalizedKey : `${normalizedKey}_${idx + 1}`;
        if (Buffer.isBuffer(imgVal)) {
          sanitizedImages[outKey] = imgVal;
          return;
        }
        if (typeof imgVal === 'string' && base64Regex.test(imgVal)) {
          const base64 = imgVal.replace(base64Regex, '');
          const buffer = Buffer.from(base64, 'base64');
          if (buffer.length > 0) sanitizedImages[outKey] = buffer;
        }
      };

      if (Array.isArray(val)) {
        val.slice(0, 5).forEach((v, idx) => pushOne(v, idx));
      } else {
        pushOne(val, 0);
      }
    }

    if (shouldDebugImages) {
      console.log('[images] sanitized keys=', Object.keys(sanitizedImages));
    }

    // Sanitize imageLayout (optional): { [imageKey]: { widthPercent?: number, widthPx?: number, heightPx?: number } }
    const sanitizedImageLayout = {};
    if (imageLayout && typeof imageLayout === 'object') {
      for (const [key, val] of Object.entries(imageLayout)) {
        if (!key || typeof key !== 'string' || !val || typeof val !== 'object') continue;
        const normalizedKey = key.startsWith('%') ? key.substring(1) : key;
        const widthPercent = Number(val.widthPercent);
        const widthPx = Number(val.widthPx);
        const heightPx = Number(val.heightPx);
        sanitizedImageLayout[normalizedKey] = {
          ...(Number.isFinite(widthPercent) ? { widthPercent } : {}),
          ...(Number.isFinite(widthPx) ? { widthPx } : {}),
          ...(Number.isFinite(heightPx) ? { heightPx } : {}),
        };
      }
    }

    // Run automation to get processed data
    // IMPORTANT:
    // - Images are handled separately and passed directly to DocxGenerator.
    // - For preview we relax automation rules so missing/empty fields do not
    //   block rendering; for final generation we keep strict validation.
    const data = await runAutomation(actionSlug, variables, { previewOnly });

    // Generate document - EXACT same logic as arrange-venue controller (line-by-line match)
    // Pass sanitizedImages directly to DocxGenerator - this is the key to image insertion
    // Image keys are normalized (without % prefix) to match ImageModule's expectations
    // Admins: full document and preview, no masking, no trial count increment
    const adminUser = isAdmin(user);
    const isTrialUser = user.subscriptionStatus === 'trial';
    const shouldMask = !adminUser && isTrialUser && (previewOnly || !downloadCheck.allowed);

    let buffer;
    if (shouldMask) {
      const maskedData = previewMaskingService.maskData(data);
      const generator = new DocxGenerator(effectiveTemplatePath, maskedData, sanitizedImages, sanitizedImageLayout);
      buffer = generator.generate();
      buffer = previewMaskingService.injectBanner(buffer);
    } else {
      const generator = new DocxGenerator(effectiveTemplatePath, data, sanitizedImages, sanitizedImageLayout);
      buffer = generator.generate();
      if (!adminUser && user.subscriptionStatus === 'trial') {
        await User.findByIdAndUpdate(userId, {
          $inc: { trialDocCount: 1 },
        });
      }
    }

    buffer = applyDocumentFontFormat(buffer);

    // Store document in history with merged text and DOCX file (for File Storage preview/download)
    if (!previewOnly && downloadCheck.allowed) {
      const contentText = extractTextFromDocx(buffer);

      // Enriched metadata for File Manager:
      // - claimantName from data.Claimant_Name
      // - eventDate/eventDateDisplay from original Event_Date input (ISO) when available
      const claimantName = (data.Claimant_Name || variables.Claimant_Name || '').trim() || undefined;
      const eventDateIso = typeof variables.Event_Date === 'string' ? variables.Event_Date : undefined;
      const eventDate = eventDateIso ? new Date(eventDateIso) : undefined;
      const folderName = buildFolderName(eventDateIso, claimantName);
      const eventDateDisplay =
        eventDate && !Number.isNaN(eventDate.getTime())
          ? `${eventDate.toLocaleString('en-US', { month: 'long' })} ${eventDate.getDate()} ${eventDate.getFullYear()}`
          : undefined;
      const eventType = slugToTitle(actionSlug);

      await Document.create({
        userId: user._id,
        actionSlug,
        content: contentText,
        fileBuffer: buffer,
        folderName: folderName || undefined,
        claimantName,
        eventDate: eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : undefined,
        eventDateDisplay,
        eventType,
      });
    }

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

/**
 * POST /generate/:actionSlug/edited-docx
 * Convert edited preview HTML to DOCX (Aptos 13pt) for download.
 * This avoids "fake DOCX" downloads and keeps formatting consistent.
 */
export async function generateEditedDocx(req, res) {
  try {
    const { actionSlug } = req.params;
    const userId = req.user?.id ?? req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const { html } = req.body || {};
    if (!html || typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    // Convert HTML to DOCX. Use Aptos 13pt base settings, then enforce via style patcher.
    // html-to-docx expects fontSize in half-points.
    let buffer = await HTMLToDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      font: 'Aptos',
      fontSize: 26, // 13pt
    });

    buffer = applyDocumentFontFormat(buffer);

    const safeSlug = String(actionSlug || 'document').replace(/[^a-z0-9-]/gi, '-');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeSlug}-edited.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
