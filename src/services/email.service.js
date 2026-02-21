import { Resend } from 'resend';
import { OTP_EXPIRY_MINUTES } from '../config/auth.js';

const APP_NAME = process.env.APP_NAME || 'FA DOC';

let cachedResend = null;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY in backend/.env');
  if (!cachedResend) cachedResend = new Resend(apiKey);
  return cachedResend;
}

function getFrom() {
  const from = process.env.RESEND_FROM;
  if (!from) throw new Error('Missing RESEND_FROM in backend/.env');
  return from;
}

function otpHtml(otp) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <div style="font-size: 14px; color: #666; margin-bottom: 8px;">${APP_NAME}</div>
      <h2 style="margin: 0 0 12px 0;">Your OTP code</h2>
      <div style="font-size: 28px; font-weight: 700; letter-spacing: 3px; margin: 8px 0 12px 0;">
        ${otp}
      </div>
      <div style="color: #555;">Expires in ${OTP_EXPIRY_MINUTES} minutes.</div>
    </div>
  `;
}

export async function sendOTPEmail(toEmail, otp) {
  console.log('sendOTPEmail', toEmail, otp);
  const resend = getResend();
  const from = getFrom();

  const { data, error } = await resend.emails.send({
    from,
    to: 'maui.k0806@gmail.com',
    subject: `${APP_NAME} OTP Code`,
    html: otpHtml(otp),
  });

  if (error) {
    throw new Error(error.message || 'Resend: failed to send OTP email');
  }
  if (!data?.id) {
    throw new Error('Resend: unexpected response sending OTP email');
  }

  return data;
}

