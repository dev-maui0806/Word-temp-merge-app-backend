export const PHONEPE = {
  env: (process.env.PHONEPE_ENV || 'UAT').toUpperCase(), // UAT | PROD
  merchantId: process.env.PHONEPE_MERCHANT_ID || '',
  saltKey: process.env.PHONEPE_SALT_KEY || '',
  saltIndex: process.env.PHONEPE_SALT_INDEX || '1',
  providerId: process.env.PHONEPE_PROVIDER_ID || '', // optional
  apiBaseUrl:
    (process.env.PHONEPE_ENV || 'UAT').toUpperCase() === 'PROD'
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  redirectHost:
    (process.env.PHONEPE_ENV || 'UAT').toUpperCase() === 'PROD'
      ? 'https://mercury.phonepe.com'
      : 'https://mercury-uat.phonepe.com',
};

export const PLANS = {
  monthly: { name: 'Monthly', amountRupees: 799, months: 1 },
  quarterly: { name: 'Quarterly', amountRupees: 2099, months: 3 },
  yearly: { name: 'Yearly', amountRupees: 6999, months: 12 },
};

