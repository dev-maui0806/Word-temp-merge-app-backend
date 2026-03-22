export const RAZORPAY = {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  apiBaseUrl: process.env.RAZORPAY_API_BASE_URL || 'https://api.razorpay.com/v1',
};
