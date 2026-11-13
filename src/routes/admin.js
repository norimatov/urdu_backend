import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { HttpError, wrap } from '../utils/http.js';
import { checkPassword, signAdmin } from '../utils/security.js';
import { publicUser } from '../utils/mapper.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, legacyHeaders: false, standardHeaders: 'draft-7' }), wrap(async (req, res) => {
  const d = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
  const ok = d.email === config.adminEmail && (await checkPassword(d.password, config.adminPasswordHash));
  if (!ok) throw new HttpError(401, 'Email yoki parol noto‘g‘ri');
  res.json({ token: signAdmin(config.adminEmail) });
}));

// Bu yerdan keyingi barcha marshrutlar admin tokenini talab qiladi
router.use(requireAdmin);

const mapRequest = (r) => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  subject: r.subject,
  category: r.category,
  message: r.message,
  status: r.status,
  internalNotes: r.internal_notes,
  archived: r.archived,
  createdAt: r.created_at,
});

const buildDaily = (signups, time) => {
  const sMap = Object.fromEntries(signups.map((r) => [r.day, r.n]));
  const tMap = Object.fromEntries(time.map((r) => [r.day, Number(r.seconds)]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day, signups: sMap[day] || 0, hours: Math.round(((tMap[day] || 0) / 3600) * 100) / 100 });
  }
  return days;
};

router.get('/stats', wrap(async (_req, res) => {
  const { rows: [s] } = await query(`
    select
      (select count(*) from users)::int as total,
      (select count(*) from users where email_verified and phone_verified)::int as verified,
      (select count(*) from users where is_banned)::int as banned,
      (select count(*) from users where created_at > now() - interval '24 hours')::int as new_today,
      (select count(*) from users where last_seen_at > now() - interval '24 hours')::int as active_today,
      (select count(*) from users where last_seen_at > now() - interval '7 days')::int as active_week,
      (select coalesce(sum(total_seconds), 0)::bigint from users) as total_seconds,
      (select count(*) from posts)::int as posts,
      (select count(*) from comments)::int as comments,
      (select count(*) from direct_messages)::int as direct_messages,
      (select count(*) from group_messages)::int as group_messages,
      (select count(*) from groups)::int as groups,
      (select count(*) from founder_requests where status = 'NEW')::int as new_requests`);
  const { rows: signups } = await query(
    `select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as n
     from users where created_at > now() - interval '30 days' group by 1`,
  );
  const { rows: time } = await query(
    `select to_char(day, 'YYYY-MM-DD') as day, sum(seconds)::bigint as seconds
     from activity_daily where day > current_date - 30 group by day`,
  );
  res.json({
    totals: {
      users: s.total,
      verified: s.verified,
      banned: s.banned,
      newToday: s.new_today,
      activeToday: s.active_today,
      activeWeek: s.active_week,
      totalHours: Math.round((Number(s.total_seconds) / 3600) * 100) / 100,
      avgMinutesPerUser: s.total ? Math.round(Number(s.total_seconds) / 60 / s.total) : 0,
      posts: s.posts,
      comments: s.comments,
      directMessages: s.direct_messages,
      groupMessages: s.group_messages,
      groups: s.groups,
      newRequests: s.new_requests,
    },
    daily: buildDaily(signups, time),
  });
}));

router.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const { rows } = await query(
    `select u.*, (select count(*) from posts p where p.user_id = u.id)::int as posts
     from users u
     where ($1 = '' or u.username ilike '%' || $1 || '%' or u.full_name ilike '%' || $1 || '%'
            or u.email ilike '%' || $1 || '%' or u.phone ilike '%' || $1 || '%')
     order by u.created_at desc limit 200`,
    [q],
  );
  res.json({
    users: rows.map((u) => ({
      ...publicUser(u, true),
      posts: u.posts,
      totalSeconds: Number(u.total_seconds),
      lastSeenAt: u.last_seen_at,
    })),
  });
}));

router.patch('/users/:id', wrap(async (req, res) => {
  const { isBanned } = z.object({ isBanned: z.boolean() }).parse(req.body);
  const { rows } = await query('update users set is_banned=$2 where id=$1 returning *', [req.params.id, isBanned]);
  if (!rows[0]) throw new HttpError(404, 'Foydalanuvchi topilmadi');
  res.json({ user: publicUser(rows[0], true) });
}));

router.get('/requests', wrap(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const { rows } = await query(
    `select * from founder_requests
     where archived = $1 and ($2::text is null or status = $2::text)
     order by created_at desc limit 200`,
    [req.query.archived === 'true', status],
  );
  res.json({ requests: rows.map(mapRequest) });
}));

router.patch('/requests/:id', wrap(async (req, res) => {
  const d = z.object({
    status: z.enum(['NEW', 'IN_REVIEW', 'REPLIED', 'CLOSED']).optional(),
    internalNotes: z.string().max(2000).optional(),
    archived: z.boolean().optional(),
  }).parse(req.body);
  const { rows } = await query(
    `update founder_requests set
       status = coalesce($2, status),
       internal_notes = coalesce($3, internal_notes),
       archived = coalesce($4, archived)
     where id=$1 returning *`,
    [req.params.id, d.status ?? null, d.internalNotes ?? null, d.archived ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'So‘rov topilmadi');
  res.json({ request: mapRequest(rows[0]) });
}));

export default router;
