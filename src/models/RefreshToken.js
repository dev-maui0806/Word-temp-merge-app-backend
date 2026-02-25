import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    deviceId: { type: String },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    // Track how the user authenticated for this refresh token.
    // Include 'password' for email+password logins.
    authMethod: { type: String, enum: ['otp', 'google', 'pin', 'password'], default: 'otp' },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ token: 1 });
refreshTokenSchema.index({ userId: 1, deviceId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
