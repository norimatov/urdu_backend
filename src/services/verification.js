import { query } from '../db.js';
import { HttpError } from '../utils/http.js';
import { genCode, hashCode } from '../utils/security.js';
import { sendEmail, sendSms } from './notify.js';

const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

export async function issueCode(user, channel) {
  const last = await query(
    'select created_at from verification_codes where user_id=$1 and channel=$2 order by created_at desc limit 1',
    [user.id, channel],
  );
  if (last.rows[0] && Date.now() - new Date(last.rows[0].created_at).getTime() < COOLDOWN_MS) {
    throw new HttpError(429, 'Kod allaqachon yuborilgan. 1 daqiqadan keyin qayta urinib ko‘ring');
  }
  const code = genCode();
  await query('delete from verification_codes where user_id=$1 and channel=$2', [user.id, channel]);
  await query(
    `insert into verification_codes (user_id, channel, code_hash, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')`,
    [user.id, channel, hashCode(code)],
  );
  try {
    if (channel === 'phone') {
      await sendSms(user.phone, `URDU CONNECT tasdiqlash kodi: ${code}`);
    } else if (channel === 'reset') {
      await sendEmail(user.email, 'URDU CONNECT: parolni tiklash', `Parolni tiklash kodi: ${code}. Kod 10 daqiqa amal qiladi.`);
    } else {
      await sendEmail(user.email, 'URDU CONNECT: email tasdiqlash', `Tasdiqlash kodi: ${code}. Kod 10 daqiqa amal qiladi.`);
    }
  } catch (e) {
    console.error('Kod yuborishda xato:', e.message);
  }
}

export async function checkCode(userId, channel, code) {
  const { rows } = await query(
    `select id, code_hash, attempts from verification_codes
     where user_id=$1 and channel=$2 and expires_at > now()
     order by created_at desc limit 1`,
    [userId, channel],
  );
  const row = rows[0];
  if (!row) throw new HttpError(400, 'Kod topilmadi yoki muddati tugagan');
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Juda ko‘p noto‘g‘ri urinish. Yangi kod so‘rang');
  await query('update verification_codes set attempts = attempts + 1 where id=$1', [row.id]);
  if (row.code_hash !== hashCode(code)) return false;
  await query('delete from verification_codes where user_id=$1 and channel=$2', [userId, channel]);
  return true;
}
