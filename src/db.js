import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
