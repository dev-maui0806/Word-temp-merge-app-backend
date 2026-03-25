import dayjs from 'dayjs';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import { getEffectivePlanConfig } from './subscriptionPlan.service.js';
import { sendInvoiceEmail } from './email.service.js';

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatINRFromPaise(amountPaise) {
  const rupees = Number(amountPaise) / 100;
  if (!Number.isFinite(rupees)) return '';
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function generateInvoiceNumber(txn) {
  const tail = String(txn.transactionId || '').slice(-8).toUpperCase();
  const datePart = dayjs(txn.createdAt || undefined).format('YYYYMMDD');
  return `INV-${datePart}-${tail}`;
}

function buildInvoiceHtml({ appName, invoiceNumber, user, planCfg, txn }) {
  const issuedAt = dayjs().format('DD MMM YYYY');
  const paymentId = txn.providerReferenceId || txn.rawCallback?.verifyRequest?.paymentId || '';
  const orderId = txn.transactionId;

  const amount = formatINRFromPaise(txn.amountPaise);

  const companyName = escapeHtml(appName || 'FA doc');
  const userName = escapeHtml(user?.name || user?.email || '');
  const userEmail = escapeHtml(user?.email || '');
  const userMobile = escapeHtml(user?.mobile || '');

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.55; color: #111;">
      <div style="margin-bottom: 18px;">
        <div style="font-size: 18px; font-weight: 700;">${companyName}</div>
        <div style="color: #666; font-size: 13px;">Subscription Invoice</div>
      </div>

      <div style="border: 1px solid #eee; border-radius: 10px; padding: 16px; margin-bottom: 18px;">
        <div style="display: flex; gap: 18px; flex-wrap: wrap;">
          <div style="min-width: 200px;">
            <div style="color:#666; font-size: 12px; margin-bottom: 4px;">Invoice Number</div>
            <div style="font-weight: 700;">${escapeHtml(invoiceNumber)}</div>
          </div>
          <div style="min-width: 200px;">
            <div style="color:#666; font-size: 12px; margin-bottom: 4px;">Issued On</div>
            <div>${escapeHtml(issuedAt)}</div>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 14px 0;" />

        <div style="display: flex; gap: 18px; flex-wrap: wrap;">
          <div style="min-width: 240px;">
            <div style="color:#666; font-size: 12px; margin-bottom: 4px;">Bill To</div>
            <div style="font-weight: 600;">${userName || 'Customer'}</div>
            <div style="color:#444; font-size: 13px;">${userEmail}</div>
            ${userMobile ? `<div style="color:#444; font-size: 13px;">${userMobile}</div>` : ''}
          </div>
          <div style="min-width: 240px;">
            <div style="color:#666; font-size: 12px; margin-bottom: 4px;">Payment</div>
            <div style="color:#444; font-size: 13px;"><b>Order:</b> ${escapeHtml(orderId || '')}</div>
            <div style="color:#444; font-size: 13px;"><b>Payment:</b> ${escapeHtml(paymentId || '')}</div>
          </div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        <thead>
          <tr>
            <th align="left" style="border-bottom: 1px solid #eee; padding: 10px 0; font-size: 12px; color: #666;">Item</th>
            <th align="right" style="border-bottom: 1px solid #eee; padding: 10px 0; font-size: 12px; color: #666;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px 0; font-size: 13px;">
              ${escapeHtml(planCfg.name)} Plan (${planCfg.months} month${planCfg.months === 1 ? '' : 's'})
            </td>
            <td align="right" style="padding: 10px 0; font-size: 13px; font-weight: 700;">${amount}</td>
          </tr>
        </tbody>
      </table>

      <div style="border-top: 1px solid #eee; padding-top: 12px; display: flex; justify-content: space-between; flex-wrap: wrap;">
        <div style="color:#666; font-size: 13px;">Total Due</div>
        <div style="font-weight: 800; font-size: 16px;">${amount}</div>
      </div>

      <div style="margin-top: 18px; color:#666; font-size: 12px;">
        This invoice is generated automatically from your Razorpay payment confirmation.
      </div>
    </div>
  `;
}

export const invoiceService = {
  async sendInvoiceForSuccessfulPayment(txn) {
    // Only for successful payments
    if (!txn || txn.status !== 'SUCCESS') return null;

    // Idempotency: send once per paymentTransactionId
    const existing = await Invoice.findOne({ paymentTransactionId: txn.transactionId });
    if (existing?.status === 'SENT') return existing;
    if (existing?.status === 'FAILED') {
      // Retry sending
    }

    const user = await User.findById(txn.userId).select('_id email name mobile');
    if (!user) throw new Error('Invoice: user not found');

    const planCfg = await getEffectivePlanConfig(txn.plan);
    const invoiceNumber = existing?.invoiceNumber || generateInvoiceNumber(txn);

    const html = buildInvoiceHtml({
      appName: process.env.APP_NAME,
      invoiceNumber,
      user,
      planCfg,
      txn,
    });

    const subject = `Your Invoice ${invoiceNumber}`;

    const invoice = existing || (await Invoice.create({
      paymentTransactionId: txn.transactionId,
      invoiceNumber,
      userId: user._id,
      plan: txn.plan,
      amountPaise: txn.amountPaise,
      currency: txn.currency || 'INR',
      razorpayOrderId: txn.transactionId,
      razorpayPaymentId: txn.providerReferenceId,
      status: 'DRAFT',
      issuedAt: new Date(),
      rawData: {
        orderId: txn.transactionId,
        paymentId: txn.providerReferenceId,
        plan: txn.plan,
        amountPaise: txn.amountPaise,
        providerStatus: txn.status,
      },
    }));

    try {
      await sendInvoiceEmail({ toEmail: user.email, subject, html });
      invoice.status = 'SENT';
      invoice.sentAt = new Date();
      await invoice.save();
      return invoice;
    } catch (err) {
      invoice.status = 'FAILED';
      invoice.rawData = { ...(invoice.rawData || {}), sendError: err.message };
      await invoice.save();
      throw err;
    }
  },
};

