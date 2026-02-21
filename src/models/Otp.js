import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    mobile: { type: String, trim: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpSchema.index({ email: 1 });
otpSchema.index({ mobile: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Otp = mongoose.model('Otp', otpSchema);

export default Otp;
