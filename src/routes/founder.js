import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { wrap } from '../utils/http.js';
import { sendEmail } from '../services/notify.js';

const router = Router();
const CATEGORIES = ['partnership', 'business', 'technical', 'feedback', 'media', 'other'];

router.use(rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Juda ko‘p so‘rov. Keyinroq urinib ko‘ring' },
}));

router.post('/', wrap(async (req, res) => {
  // Honeypot: bot "website" maydonini to'ldirsa, jim qabul qilamiz
  if (req.body?.website) return res.json({ ok: true });

  const d = z.object({
    fullName: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    phone: z.string().trim().max(20).optional().default(''),
    subject: z.string().trim().min(3).max(150),
    category: z.enum(CATEGORIES),
    message: z.string().trim().min(10).max(3000),
  }).parse(req.body);

  const { rows } = await query(
    `insert into founder_requests (full_name, email, phone, subject, category, message)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [d.fullName, d.email, d.phone, d.subject, d.category, d.message],
  );

  if (config.founderEmail) {
    try {
      await sendEmail(
        config.founderEmail,
        `[URDU CONNECT] ${d.category}: ${d.subject}`,
        `Ism: ${d.fullName}\nEmail: ${d.email}\nTelefon: ${d.phone || '-'}\n\n${d.message}`,
      );
    } catch (e) {
      console.error('Aloqa xabarini yuborishda xato:', e.message);
    }
  }
  res.status(201).json({ ok: true, id: rows[0].id });
}));

export default router;
