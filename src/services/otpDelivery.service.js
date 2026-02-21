import { OTP_EXPIRY_MINUTES } from '../config/auth.js';
import { sendOTPEmail } from './email.service.js';

export const otpDeliveryService = {
  async sendEmailOtp(email, otp) {
    await sendOTPEmail(email, otp);
  },

  async sendSmsOtp(mobile, otp) {
    // TODO: Wire a real SMS provider (Twilio, etc.)
    console.log(`[OTP] SMS to ${mobile}: ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`);
  },
};
