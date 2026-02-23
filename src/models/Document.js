import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Document type / template slug (e.g. 'arrange-venue') */
    actionSlug: {
      type: String,
      required: true,
    },
    /** Extracted text from merged doc (for search/fallback) */
    content: {
      type: String,
      required: true,
    },
    /** Generated DOCX file for preview and download */
    fileBuffer: {
      type: Buffer,
    },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, createdAt: -1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
