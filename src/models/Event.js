import mongoose from 'mongoose';

const STATUSES = ['COMPLETED', 'NOT_COMPLETED'];

const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    caseDetails: { type: String, trim: true, default: '' },
    venue: { type: String, trim: true, default: '' },
    caseManager: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: STATUSES,
      default: 'NOT_COMPLETED',
    },
    issue: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

eventSchema.index({ userId: 1, date: 1 });

const Event = mongoose.model('Event', eventSchema);

export default Event;
export { STATUSES };
