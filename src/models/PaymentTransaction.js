import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['phonepe'], required: true },
    transactionId: { type: String, required: true, unique: true }, // merchant generated
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: ['INITIATED', 'SUCCESS', 'FAILED'], default: 'INITIATED' },
    providerReferenceId: { type: String },
    paymentState: { type: String },
    payResponseCode: { type: String },
    rawCallback: { type: Object },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ provider: 1, transactionId: 1 });
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

export default PaymentTransaction;

