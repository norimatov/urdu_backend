import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, wrap } from '../utils/http.js';
import { requireUser, requireVerified } from '../middleware/auth.js';

const router = Router();
const guard = [requireUser, requireVerified];
const KINDS = ['post', 'announcement', 'job', 'service'];

const mapPost = (r) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
  likes: r.likes,
  comments: r.comments,
  liked: r.liked,
  author: { id: r.author_id, username: r.username, fullName: r.full_name, faculty: r.faculty },
});

async function assertMember(groupId, userId) {
  const { rowCount } = await query('select 1 from group_members where group_id=$1 and user_id=$2', [groupId, userId]);
  if (!rowCount) throw new HttpError(403, 'Avval guruhga qo‘shiling');
}

/* ---------- Feed ---------- */
router.get('/posts', ...guard, wrap(async (req, res) => {
  const kind = z.enum(['all', ...KINDS]).catch('all').parse(req.query.kind);
  const d = req.query.before ? new Date(String(req.query.before)) : null;
  const before = d && !isNaN(d) ? d.toISOString() : null;
  const { rows } = await query(
    `select p.id, p.kind, p.title, p.body, p.created_at,
            u.id as author_id, u.username, u.full_name, u.faculty,
            (select count(*) from post_likes l where l.post_id = p.id)::int as likes,
            (select count(*) from comments c where c.post_id = p.id)::int as comments,
            exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = $1) as liked
     from posts p join users u on u.id = p.user_id
     where ($2::text = 'all' or p.kind = $2::text)
       and ($3::timestamptz is null or p.created_at < $3::timestamptz)
     order by p.created_at desc limit 20`,
    [req.user.id, kind, before],
  );
  res.json({ posts: rows.map(mapPost) });
}));

router.post('/posts', ...guard, wrap(async (req, res) => {
  const d = z.object({
    kind: z.enum(KINDS),
    title: z.string().trim().max(120).default(''),
    body: z.string().trim().min(1, 'Matn bo‘sh bo‘lmasligi kerak').max(3000),
  }).parse(req.body);
  const { rows } = await query(
    'insert into posts (user_id, kind, title, body) values ($1,$2,$3,$4) returning id',
    [req.user.id, d.kind, d.title, d.body],
  );
  res.status(201).json({ id: rows[0].id });
}));

router.delete('/posts/:id', ...guard, wrap(async (req, res) => {
  const { rowCount } = await query('delete from posts where id=$1 and user_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Post topilmadi yoki ruxsat yo‘q');
  res.json({ ok: true });
}));

router.post('/posts/:id/like', ...guard, wrap(async (req, res) => {
  const { rowCount } = await query('delete from post_likes where post_id=$1 and user_id=$2', [req.params.id, req.user.id]);
  if (rowCount) return res.json({ liked: false });
  await query('insert into post_likes (post_id, user_id) values ($1,$2) on conflict do nothing', [req.params.id, req.user.id]);
  res.json({ liked: true });
}));

router.get('/posts/:id/comments', ...guard, wrap(async (req, res) => {
  const { rows } = await query(
    `select c.id, c.body, c.created_at, u.id as user_id, u.username, u.full_name
     from comments c join users u on u.id = c.user_id
     where c.post_id=$1 order by c.created_at asc limit 200`,
    [req.params.id],
  );
  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      author: { id: c.user_id, username: c.username, fullName: c.full_name },
    })),
  });
}));

router.post('/posts/:id/comments', ...guard, wrap(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  await query('insert into comments (post_id, user_id, body) values ($1,$2,$3)', [req.params.id, req.user.id, body]);
  res.status(201).json({ ok: true });
}));

/* ---------- Groups ---------- */
router.get('/groups', ...guard, wrap(async (req, res) => {
  const { rows } = await query(
    `select g.id, g.name, g.description, g.created_at,
            (select count(*) from group_members m where m.group_id = g.id)::int as members,
            exists(select 1 from group_members m where m.group_id = g.id and m.user_id = $1) as joined
     from groups g order by g.created_at desc limit 100`,
    [req.user.id],
  );
  res.json({
    groups: rows.map((g) => ({ id: g.id, name: g.name, description: g.description, members: g.members, joined: g.joined, createdAt: g.created_at })),
  });
}));

router.post('/groups', ...guard, wrap(async (req, res) => {
  const d = z.object({
    name: z.string().trim().min(3, 'Guruh nomi kamida 3 belgi').max(80),
    description: z.string().trim().max(300).default(''),
  }).parse(req.body);
  const { rows } = await query(
    'insert into groups (name, description, created_by) values ($1,$2,$3) returning id',
    [d.name, d.description, req.user.id],
  );
  await query('insert into group_members (group_id, user_id) values ($1,$2)', [rows[0].id, req.user.id]);
  res.status(201).json({ id: rows[0].id });
}));

router.post('/groups/:id/join', ...guard, wrap(async (req, res) => {
  await query('insert into group_members (group_id, user_id) values ($1,$2) on conflict do nothing', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

router.post('/groups/:id/leave', ...guard, wrap(async (req, res) => {
  await query('delete from group_members where group_id=$1 and user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

router.get('/groups/:id/messages', ...guard, wrap(async (req, res) => {
  await assertMember(req.params.id, req.user.id);
  const { rows } = await query(
    `select m.id, m.body, m.created_at, u.id as user_id, u.username, u.full_name
     from group_messages m join users u on u.id = m.user_id
     where m.group_id=$1 order by m.created_at desc limit 100`,
    [req.params.id],
  );
  res.json({
    messages: rows.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      author: { id: m.user_id, username: m.username, fullName: m.full_name },
    })),
  });
}));

router.post('/groups/:id/messages', ...guard, wrap(async (req, res) => {
  await assertMember(req.params.id, req.user.id);
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  await query('insert into group_messages (group_id, user_id, body) values ($1,$2,$3)', [req.params.id, req.user.id, body]);
  res.status(201).json({ ok: true });
}));

/* ---------- Direct messages ---------- */
router.get('/messages/threads', ...guard, wrap(async (req, res) => {
  const { rows } = await query(
    `select u.id, u.username, u.full_name, t.body, t.created_at
     from (
       select distinct on (partner) partner, body, created_at from (
         select case when sender_id = $1 then recipient_id else sender_id end as partner, body, created_at
         from direct_messages where sender_id = $1 or recipient_id = $1
       ) m order by partner, created_at desc
     ) t
     join users u on u.id = t.partner
     order by t.created_at desc limit 100`,
    [req.user.id],
  );
  res.json({
    threads: rows.map((r) => ({
      user: { id: r.id, username: r.username, fullName: r.full_name },
      lastBody: r.body,
      lastAt: r.created_at,
    })),
  });
}));

router.get('/messages/:userId', ...guard, wrap(async (req, res) => {
  const { rows } = await query(
    `select id, sender_id, body, created_at from direct_messages
     where (sender_id=$1 and recipient_id=$2) or (sender_id=$2 and recipient_id=$1)
     order by created_at desc limit 100`,
    [req.user.id, req.params.userId],
  );
  res.json({
    messages: rows.reverse().map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at, mine: m.sender_id === req.user.id })),
  });
}));

router.post('/messages/:userId', ...guard, wrap(async (req, res) => {
  if (req.params.userId === req.user.id) throw new HttpError(400, 'O‘zingizga xabar yuborib bo‘lmaydi');
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  await query('insert into direct_messages (sender_id, recipient_id, body) values ($1,$2,$3)', [req.user.id, req.params.userId, body]);
  res.status(201).json({ ok: true });
}));

export default router;
