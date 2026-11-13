import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const checkPassword = (password, hash) => bcrypt.compare(password, hash);
export const hashCode = (code) => crypto.createHmac('sha256', config.jwtSecret).update(code).digest('hex');
export const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const signUser = (id) => jwt.sign({ sub: id, typ: 'user' }, config.jwtSecret, { expiresIn: '30d' });
export const signAdmin = (email) => jwt.sign({ sub: email, typ: 'admin' }, config.adminJwtSecret, { expiresIn: '12h' });
