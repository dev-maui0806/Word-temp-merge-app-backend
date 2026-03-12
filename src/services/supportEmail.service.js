import { Resend } from 'resend';

const SUPPORT_TO = 'support@fieldagentreport.com';

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

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendSupportEmail({ name, email, regarding, message, ip, userAgent }) {
  const resend = getResend();
  const from = getFrom();

  const subject = `Contact Us: ${regarding || 'message'} — ${name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.55;">
      <h2 style="margin: 0 0 12px 0;">New Contact Us message</h2>
      <div style="margin-bottom: 10px;"><b>Name:</b> ${escapeHtml(name)}</div>
      <div style="margin-bottom: 10px;"><b>Email:</b> ${escapeHtml(email)}</div>
      <div style="margin-bottom: 10px;"><b>Regarding:</b> ${escapeHtml(regarding)}</div>
      <div style="margin: 14px 0 10px 0;"><b>Message:</b></div>
      <div style="white-space: pre-wrap; padding: 12px; border: 1px solid #eee; border-radius: 8px; background: #fafafa;">
        ${escapeHtml(message)}
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
      <div style="color: #666; font-size: 12px;">
        IP: ${escapeHtml(ip)}<br/>
        User-Agent: ${escapeHtml(userAgent)}
      </div>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from,
    to: SUPPORT_TO,
    replyTo: email,
    subject,
    html,
  });

  if (error) throw new Error(error.message || 'Resend: failed to send support email');
  if (!data?.id) throw new Error('Resend: unexpected response sending support email');

  return data;
}

