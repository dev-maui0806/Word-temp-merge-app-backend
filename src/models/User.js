import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    lastLogin: { type: Date, default: Date.now },
    userAgent: { type: String, default: '' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** For manual (Gmail + password) accounts. */
    passwordHash: {
      type: String,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    /**
     * Trial tracking (7 days OR 5 documents, whichever comes first).
     */
    trialStartDate: {
      type: Date,
    },
    trialDocCount: {
      type: Number,
      default: 0,
    },
    /**
     * Subscription lifecycle.
     * - subscriptionStatus: 'trial' | 'active' | 'expired'
     * - subscriptionExpiry: end of paid period (used with grace period)
     * - subscriptionPlan: 'monthly' | 'quarterly' | 'yearly' (for UI badges)
     */
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'expired'],
      default: 'trial',
    },
    subscriptionExpiry: {
      type: Date,
    },
    subscriptionPlan: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
    },
    stripeCustomerId: {
      type: String,
      sparse: true,
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true,
    },
    pinHash: {
      type: String,
    },
    pinFailedAttempts: {
      type: Number,
      default: 0,
    },
    pinLockedUntil: {
      type: Date,
    },
    devices: {
      type: [deviceSchema],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobile: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ subscriptionStatus: 1, subscriptionExpiry: 1 });
userSchema.index({ stripeCustomerId: 1 }, { sparse: true });
userSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
userSchema.index({ 'devices.deviceId': 1 });

const User = mongoose.model('User', userSchema);

export default User;
