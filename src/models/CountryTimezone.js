import mongoose from 'mongoose';

const countryTimezoneSchema = new mongoose.Schema(
  {
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Country',
      required: true,
      index: true,
    },
    cityName: { type: String, required: true, trim: true },
    standardTime: { type: String, required: true, trim: true },
    timeShort: { type: String, required: true, trim: true },
    countryCode: { type: String, trim: true },
    currency: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

countryTimezoneSchema.index({ country: 1, order: 1 });

const CountryTimezone = mongoose.model('CountryTimezone', countryTimezoneSchema);

export default CountryTimezone;
