import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export async function sendEmail(to, subject, text) {
  if (!transport) {
    console.log(`[EMAIL -> ${to}] ${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
}

export async function sendSms(to, text) {
  if (!config.smsWebhookUrl) {
    console.log(`[SMS -> ${to}] ${text}`);
    return;
  }
  const res = await fetch(config.smsWebhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) throw new Error(`SMS provider ${res.status}`);
}
