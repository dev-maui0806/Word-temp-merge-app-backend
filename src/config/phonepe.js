/**
 * PhonePe Payment Gateway V2 Configuration.
 * Uses Client ID, Client Secret, and Client Version (from Developer Settings).
 */

export const PHONEPE = {
  env: (process.env.PHONEPE_ENV || 'UAT').toUpperCase(), // UAT | PROD
  clientId: process.env.PHONEPE_CLIENT_ID || '',
  clientSecret: process.env.PHONEPE_CLIENT_SECRET || '',
  clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
  webhookUsername: process.env.PHONEPE_WEBHOOK_USERNAME || '',
  webhookPassword: process.env.PHONEPE_WEBHOOK_PASSWORD || '',
  isProd: (process.env.PHONEPE_ENV || 'UAT').toUpperCase() === 'PROD',
  oauthUrl: (process.env.PHONEPE_ENV || 'UAT').toUpperCase() === 'PROD'
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
  payUrl:
    (process.env.PHONEPE_ENV || 'UAT').toUpperCase() === 'PROD'
      ? 'https://api.phonepe.com/apis/pg/checkout/v2/pay'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay',
};

export const PLANS = {
  monthly: { name: 'Monthly', amountRupees: 799, months: 1 },
  quarterly: { name: 'Quarterly', amountRupees: 2099, months: 3 },
  yearly: { name: 'Yearly', amountRupees: 6999, months: 12 },
};
