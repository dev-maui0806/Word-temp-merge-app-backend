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
    /** Logical folder name in File Manager (e.g. 'November 4 Raheem 2026') */
    folderName: {
      type: String,
      index: true,
    },
    /** Claimant name (for search & autosuggest) */
    claimantName: {
      type: String,
      index: true,
    },
    /** Event date as Date (for filtering/sorting) */
    eventDate: {
      type: Date,
      index: true,
    },
    /** Event date display string (e.g. 'November 4 2026') */
    eventDateDisplay: {
      type: String,
    },
    /** Human-readable event type (e.g. 'Arrange Venue', 'FA Attend') */
    eventType: {
      type: String,
      index: true,
    },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, folderName: 1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
