import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET || '',
  adminJwtSecret: env.ADMIN_JWT_SECRET || '',
  adminEmail: (env.ADMIN_EMAIL || '').toLowerCase(),
  adminPasswordHash: env.ADMIN_PASSWORD_HASH || '',
  founderEmail: env.FOUNDER_EMAIL || '',
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'URDU CONNECT <no-reply@urdu.connect>',
  },
  smsWebhookUrl: env.SMS_WEBHOOK_URL || '',
};

export function assertConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (config.jwtSecret.length < 32) missing.push('JWT_SECRET (32+ belgi)');
  if (config.adminJwtSecret.length < 32) missing.push('ADMIN_JWT_SECRET (32+ belgi)');
  if (!config.adminEmail) missing.push('ADMIN_EMAIL');
  if (!config.adminPasswordHash) missing.push('ADMIN_PASSWORD_HASH');
  if (missing.length) throw new Error('.env da yetishmayapti: ' + missing.join(', '));
}
