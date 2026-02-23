/**
 * Admin Controller: Template management (CRUD, upload, edit) + admin user tools.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import HTMLToDOCX from 'html-to-docx';
import { TEMPLATE_REGISTRY, getTemplatePath } from '../templates/templateRegistry.js';
import User from '../models/User.js';
import Document from '../models/Document.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../templates');

const storage = multer.memoryStorage();
export const uploadTemplate = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.docx')) {
      return cb(new Error('Only .docx files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

/**
 * GET /admin/templates
 * List all action types and their template status.
 */
export async function listTemplates(req, res) {
  try {
    const actionSlugs = Object.keys(TEMPLATE_REGISTRY);
    const list = actionSlugs.map((slug) => {
      const config = TEMPLATE_REGISTRY[slug];
      const templatePath = getTemplatePath(slug);
      const exists = templatePath ? fs.existsSync(templatePath) : false;
      return {
        actionSlug: slug,
        templateFile: config?.template ?? null,
        exists,
        automation: config?.automation ?? null,
      };
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/templates/:actionSlug/upload
 * Upload a template file for the given action. Replaces existing if present.
 */
export async function uploadTemplateFile(req, res) {
  try {
    const { actionSlug } = req.params;
    const config = TEMPLATE_REGISTRY[actionSlug];
    if (!config) {
      return res.status(404).json({ error: `Unknown action: ${actionSlug}` });
    }

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "file".' });
    }

    const targetPath = path.join(TEMPLATES_DIR, config.template);
    fs.writeFileSync(targetPath, file.buffer);

    res.json({
      success: true,
      actionSlug,
      templateFile: config.template,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * GET /admin/templates/:actionSlug/file
 * Return the template DOCX file for editing (or 404 if missing).
 */
export async function getTemplateFile(req, res) {
  try {
    const { actionSlug } = req.params;
    const config = TEMPLATE_REGISTRY[actionSlug];
    if (!config) {
      return res.status(404).json({ error: `Unknown action: ${actionSlug}` });
    }

    const templatePath = path.join(TEMPLATES_DIR, config.template);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template file not found' });
    }

    const buffer = fs.readFileSync(templatePath);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${config.template}"`,
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/templates/:actionSlug/save
 * Save template from HTML content. Converts HTML to DOCX and writes to file.
 */
export async function saveTemplateFromHtml(req, res) {
  try {
    const { actionSlug } = req.params;
    const config = TEMPLATE_REGISTRY[actionSlug];
    if (!config) {
      return res.status(404).json({ error: `Unknown action: ${actionSlug}` });
    }

    const { html } = req.body;
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    const fileBuffer = await HTMLToDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      font: 'Calibri',
      fontSize: 22,
    });

    const targetPath = path.join(TEMPLATES_DIR, config.template);
    fs.writeFileSync(targetPath, fileBuffer);

    res.json({
      success: true,
      actionSlug,
      templateFile: config.template,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * DELETE /admin/templates/:actionSlug
 * Delete the template file for the given action.
 */
export async function deleteTemplate(req, res) {
  try {
    const { actionSlug } = req.params;
    const config = TEMPLATE_REGISTRY[actionSlug];
    if (!config) {
      return res.status(404).json({ error: `Unknown action: ${actionSlug}` });
    }

    const templatePath = path.join(TEMPLATES_DIR, config.template);
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }

    res.json({ success: true, actionSlug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/users
 * List all registered users for admin view.
 */
export async function listUsers(req, res) {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select(
        'email name role subscriptionStatus subscriptionPlan subscriptionExpiry trialDocCount trialStartDate createdAt'
      )
      .lean();

    const list = users.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name || '',
      role: u.role,
      subscriptionStatus: u.subscriptionStatus,
      subscriptionPlan: u.subscriptionPlan || null,
      subscriptionExpiry: u.subscriptionExpiry || null,
      trialDocCount: u.trialDocCount ?? 0,
      trialStartDate: u.trialStartDate || u.createdAt,
      createdAt: u.createdAt,
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/users/:userId/documents
 * List documents created by a specific user (newest first).
 */
export async function listUserDocuments(req, res) {
  try {
    const { userId } = req.params;
    const docs = await Document.find({ userId })
      .sort({ createdAt: -1 })
      .select('actionSlug createdAt')
      .lean();

    const list = docs.map((d) => ({
      id: d._id,
      actionSlug: d.actionSlug,
      createdAt: d.createdAt,
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/users/:userId/documents/:id
 * Get a single document's archived text for the specified user.
 */
export async function getUserDocument(req, res) {
  try {
    const { userId, id } = req.params;
    const doc = await Document.findOne({ _id: id, userId }).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: doc._id,
      actionSlug: doc.actionSlug,
      createdAt: doc.createdAt,
      content: doc.content,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/users/:userId/documents/:id/file
 * Return DOCX file for a user's document (if stored).
 */
export async function getUserDocumentFile(req, res) {
  try {
    const { userId, id } = req.params;
    const doc = await Document.findOne({ _id: id, userId }).select('fileBuffer actionSlug');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const buf = doc.fileBuffer;
    if (!buf || !Buffer.isBuffer(buf)) {
      return res.status(404).json({ error: 'File not available for this document' });
    }

    const safeSlug = (doc.actionSlug || 'document').replace(/[^a-z0-9-]/gi, '-');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeSlug}.docx"`,
    });
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
