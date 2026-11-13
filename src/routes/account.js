import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, wrap } from '../utils/http.js';
import { checkPassword, hashPassword } from '../utils/security.js';
import { publicUser } from '../utils/mapper.js';
import { requireUser, requireVerified } from '../middleware/auth.js';

const router = Router();
const verified = [requireUser, requireVerified];

router.get('/users', ...verified, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const { rows } = await query(
    `select * from users
     where email_verified and phone_verified and is_banned = false and id <> $1
       and ($2 = '' or username ilike '%' || $2 || '%' or full_name ilike '%' || $2 || '%')
     order by full_name limit 20`,
    [req.user.id, q],
  );
  res.json({ users: rows.map((u) => publicUser(u)) });
}));

router.get('/users/:username', ...verified, wrap(async (req, res) => {
  const { rows } = await query('select * from users where username=$1', [req.params.username.toLowerCase()]);
  const u = rows[0];
  if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
  const { rows: c } = await query('select count(*)::int as posts from posts where user_id=$1', [u.id]);
  res.json({ user: { ...publicUser(u), postsCount: c[0].posts } });
}));

router.patch('/me', requireUser, wrap(async (req, res) => {
  const d = z.object({
    fullName: z.string().trim().min(2).max(80).optional(),
    university: z.string().trim().max(120).optional(),
    faculty: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(300).optional(),
  }).parse(req.body);
  const { rows } = await query(
    `update users set
       full_name = coalesce($2, full_name),
       university = coalesce($3, university),
       faculty = coalesce($4, faculty),
       bio = coalesce($5, bio)
     where id=$1 returning *`,
    [req.user.id, d.fullName ?? null, d.university ?? null, d.faculty ?? null, d.bio ?? null],
  );
  res.json({ user: publicUser(rows[0], true) });
}));

router.post('/me/password', requireUser, wrap(async (req, res) => {
  const d = z.object({
    current: z.string().min(1),
    next: z.string().min(8, 'Yangi parol kamida 8 belgi').max(100),
  }).parse(req.body);
  if (!(await checkPassword(d.current, req.user.password_hash))) throw new HttpError(400, 'Joriy parol noto‘g‘ri');
  await query('update users set password_hash=$2 where id=$1', [req.user.id, await hashPassword(d.next)]);
  res.json({ ok: true });
}));

router.post('/me/heartbeat', requireUser, wrap(async (req, res) => {
  const seconds = Math.min(Math.max(Math.floor(Number(req.body?.seconds) || 0), 0), 60);
  if (seconds > 0) {
    await query('update users set total_seconds = total_seconds + $2, last_seen_at = now() where id=$1', [req.user.id, seconds]);
    await query(
      `insert into activity_daily (user_id, day, seconds) values ($1, current_date, $2)
       on conflict (user_id, day) do update set seconds = activity_daily.seconds + excluded.seconds`,
      [req.user.id, seconds],
    );
  } else {
    await query('update users set last_seen_at = now() where id=$1', [req.user.id]);
  }
  res.json({ ok: true });
}));

export default router;
