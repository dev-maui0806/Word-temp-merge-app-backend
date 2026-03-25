import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    // Idempotency key from our PaymentTransaction (Razorpay order_id)
    paymentTransactionId: { type: String, required: true, unique: true, index: true },

    invoiceNumber: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    plan: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR', trim: true },

    // Razorpay identifiers for reference on the invoice
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },

    status: { type: String, enum: ['DRAFT', 'SENT', 'FAILED'], default: 'DRAFT' },
    issuedAt: { type: Date, default: () => new Date() },
    sentAt: { type: Date },

    rawData: { type: Object },
  },
  { timestamps: true }
);

export default mongoose.model('Invoice', invoiceSchema);

