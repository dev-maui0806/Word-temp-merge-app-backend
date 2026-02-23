import mongoose from 'mongoose';

const CATEGORIES = ['CAB', 'HOTEL', 'NOTARY', 'DOCTOR', 'CUSTOM'];

const contactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    number: { type: String, trim: true },
    mail: { type: String, trim: true },
    city: { type: String, trim: true },
    category: {
      type: String,
      enum: CATEGORIES,
      default: 'CUSTOM',
    },
  },
  { timestamps: true }
);

contactSchema.index({ userId: 1, category: 1 });

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;
export { CATEGORIES };
