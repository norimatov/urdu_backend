import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, wrap } from '../utils/http.js';
import { checkPassword, hashPassword, signUser } from '../utils/security.js';
import { publicUser } from '../utils/mapper.js';
import { requireUser } from '../middleware/auth.js';
import { issueCode, checkCode } from '../services/verification.js';

const router = Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Juda ko‘p urinish. 15 daqiqadan keyin urinib ko‘ring' },
}));

const normalizePhone = (s) => {
  const v = String(s).replace(/[\s()-]/g, '');
  return v.startsWith('+') ? v : '+' + v;
};
const phoneSchema = z.string().transform(normalizePhone).refine((v) => /^\+\d{9,15}$/.test(v), 'Telefon raqami noto‘g‘ri formatda');

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, 'Username 3-20 belgi: harf, raqam yoki _'),
  fullName: z.string().trim().min(2, 'Ism kamida 2 belgi').max(80),
  email: z.string().trim().toLowerCase().email('Email noto‘g‘ri').max(120),
  phone: phoneSchema,
  password: z.string().min(8, 'Parol kamida 8 belgi').max(100),
  university: z.string().trim().min(2, 'Universitetni kiriting').max(120),
  faculty: z.string().trim().max(120).default(''),
});

router.post('/register', wrap(async (req, res) => {
  const d = registerSchema.parse(req.body);
  const dup = await query('select 1 from users where username=$1 or email=$2 or phone=$3', [d.username, d.email, d.phone]);
  if (dup.rowCount) throw new HttpError(409, 'Bu username, email yoki telefon band');
  const hash = await hashPassword(d.password);
  const { rows } = await query(
    `insert into users (username, full_name, email, phone, password_hash, university, faculty)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [d.username, d.fullName, d.email, d.phone, hash, d.university, d.faculty],
  );
  const user = rows[0];
  await issueCode(user, 'email');
  await issueCode(user, 'phone');
  res.status(201).json({ token: signUser(user.id), user: publicUser(user, true) });
}));

router.post('/login', wrap(async (req, res) => {
  const { identifier, password } = z.object({
    identifier: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(100),
  }).parse(req.body);
  const phone = /^[+\d\s()-]+$/.test(identifier) ? normalizePhone(identifier) : '';
  const { rows } = await query(
    'select * from users where email=$1 or username=$1 or phone=$2',
    [identifier.toLowerCase(), phone],
  );
  const user = rows[0];
  if (!user || !(await checkPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Login yoki parol noto‘g‘ri');
  }
  if (user.is_banned) throw new HttpError(403, 'Akkauntingiz bloklangan');
  await query('update users set last_seen_at=now() where id=$1', [user.id]);
  res.json({ token: signUser(user.id), user: publicUser(user, true) });
}));

router.get('/me', requireUser, wrap(async (req, res) => {
  res.json({ user: publicUser(req.user, true) });
}));

router.post('/verify', requireUser, wrap(async (req, res) => {
  const { channel, code } = z.object({
    channel: z.enum(['email', 'phone']),
    code: z.string().regex(/^\d{6}$/, 'Kod 6 raqamdan iborat'),
  }).parse(req.body);
  const ok = await checkCode(req.user.id, channel, code);
  if (!ok) throw new HttpError(400, 'Kod noto‘g‘ri');
  const column = channel === 'email' ? 'email_verified' : 'phone_verified';
  const { rows } = await query(`update users set ${column} = true where id=$1 returning *`, [req.user.id]);
  res.json({ user: publicUser(rows[0], true) });
}));

router.post('/resend', requireUser, wrap(async (req, res) => {
  const { channel } = z.object({ channel: z.enum(['email', 'phone']) }).parse(req.body);
  await issueCode(req.user, channel);
  res.json({ ok: true });
}));

router.post('/forgot', wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const { rows } = await query('select * from users where email=$1', [email]);
  if (rows[0]) await issueCode(rows[0], 'reset');
  res.json({ ok: true, message: 'Agar email ro‘yxatdan o‘tgan bo‘lsa, kod yuborildi' });
}));

router.post('/reset', wrap(async (req, res) => {
  const d = z.object({
    email: z.string().trim().toLowerCase().email(),
    code: z.string().regex(/^\d{6}$/),
    password: z.string().min(8).max(100),
  }).parse(req.body);
  const { rows } = await query('select * from users where email=$1', [d.email]);
  const user = rows[0];
  if (!user) throw new HttpError(400, 'Kod noto‘g‘ri');
  if (!(await checkCode(user.id, 'reset', d.code))) throw new HttpError(400, 'Kod noto‘g‘ri yoki muddati tugagan');
  await query('update users set password_hash=$2 where id=$1', [user.id, await hashPassword(d.password)]);
  res.json({ ok: true });
}));

export default router;
