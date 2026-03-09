import mongoose from 'mongoose';

const countrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    label: { type: String, required: true, trim: true },
    /** When false, use standardTime/countryCode/timeShort/currency on this document. When true, user must pick a city from CountryTimezone. */
    hasMultipleTimezones: { type: Boolean, default: false },
    /** Default timezone fields (used when hasMultipleTimezones is false). */
    standardTime: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    timeShort: { type: String, trim: true },
    currency: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Country = mongoose.model('Country', countrySchema);

export default Country;
