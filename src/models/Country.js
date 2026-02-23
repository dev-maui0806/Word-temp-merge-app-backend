import mongoose from 'mongoose';

const countrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    label: { type: String, required: true, trim: true },
    standardTime: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, trim: true },
    timeShort: { type: String, required: true, trim: true },
    currency: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Country = mongoose.model('Country', countrySchema);

export default Country;
