import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      enum: ['monthly', 'quarterly', 'yearly'],
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    amountRupees: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    months: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionPlanSchema.index({ planId: 1 }, { unique: true });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;

