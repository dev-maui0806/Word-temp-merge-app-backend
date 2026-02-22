export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY_DAYS = 30;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_LENGTH = 6;
/** Seconds to accept a Google ID token after exp (handles server clock skew). Default 6 hours. */
export const GOOGLE_ID_TOKEN_EXPIRY_LEEWAY_SECONDS = Number(process.env.GOOGLE_ID_TOKEN_EXPIRY_LEEWAY_SECONDS) || 6 * 3600;
