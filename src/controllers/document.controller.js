/**
 * Document Controller: List and get saved (generated) documents for the current user.
 */

import Document from '../models/Document.js';

/**
 * GET /documents
 * List all documents created by the current user (newest first).
 */
export async function listDocuments(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

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
 * GET /documents/:id
 * Get a single document by id (content included). Only allowed for the document owner.
 */
export async function getDocument(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const doc = await Document.findOne({ _id: req.params.id, userId }).lean();
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
 * GET /documents/:id/file
 * Return the DOCX file for preview/download. Only for documents that have fileBuffer (newer saves).
 */
export async function getDocumentFile(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const doc = await Document.findOne({ _id: req.params.id, userId }).select('fileBuffer actionSlug');
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
