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
      .select('actionSlug createdAt folderName claimantName eventDate eventDateDisplay eventType')
      .lean();

    const list = docs.map((d) => ({
      id: d._id,
      actionSlug: d.actionSlug,
      createdAt: d.createdAt,
      folderName: d.folderName || null,
      claimantName: d.claimantName || null,
      eventDate: d.eventDate || null,
      eventDateDisplay: d.eventDateDisplay || null,
      eventType: d.eventType || null,
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
      folderName: doc.folderName || null,
      claimantName: doc.claimantName || null,
      eventDate: doc.eventDate || null,
      eventDateDisplay: doc.eventDateDisplay || null,
      eventType: doc.eventType || null,
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

    const doc = await Document.findOne({ _id: req.params.id, userId }).select('fileBuffer actionSlug eventType');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const buf = doc.fileBuffer;
    if (!buf || !Buffer.isBuffer(buf)) {
      return res.status(404).json({ error: 'File not available for this document' });
    }

    const baseName = doc.eventType || doc.actionSlug || 'document';
    const safeSlug = baseName.replace(/[^a-z0-9-]/gi, '-');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeSlug}.docx"`,
    });
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /documents/claimants
 * Return distinct claimant names for the current user (for autosuggest).
 */
export async function listClaimantNames(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { q } = req.query;
    const filter = { userId, claimantName: { $ne: null } };
    if (typeof q === 'string' && q.trim()) {
      filter.claimantName = { $regex: q.trim(), $options: 'i' };
    }

    const names = await Document.distinct('claimantName', filter);
    names.sort((a, b) => String(a).localeCompare(String(b)));
    res.json({ ok: true, claimants: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
