import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, wrap } from '../utils/http.js';

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

export const requireUser = wrap(async (req, _res, next) => {
  let payload;
  try {
    payload = jwt.verify(bearer(req), config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Avval tizimga kiring');
  }
  if (payload.typ !== 'user') throw new HttpError(401, 'Noto‘g‘ri token');
  const { rows } = await query('select * from users where id=$1', [payload.sub]);
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Foydalanuvchi topilmadi');
  if (user.is_banned) throw new HttpError(403, 'Akkauntingiz bloklangan');
  req.user = user;
  next();
});

export const requireVerified = (req, _res, next) => {
  if (!req.user?.email_verified || !req.user?.phone_verified) {
    return next(new HttpError(403, 'Avval email va telefon raqamingizni tasdiqlang'));
  }
  next();
};

export const requireAdmin = (req, _res, next) => {
  try {
    const p = jwt.verify(bearer(req), config.adminJwtSecret);
    if (p.typ !== 'admin' || p.sub !== config.adminEmail) throw new Error('bad');
    next();
  } catch {
    next(new HttpError(401, 'Admin kirishi talab qilinadi'));
  }
};
