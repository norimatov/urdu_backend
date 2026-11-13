import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { assertConfig, config } from './config.js';
import { migrate } from './db.js';
import { HttpError } from './utils/http.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import socialRoutes from './routes/social.js';
import founderRoutes from './routes/founder.js';
import adminRoutes from './routes/admin.js';

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/founder-requests', founderRoutes);
app.use('/api', accountRoutes);
app.use('/api', socialRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Topilmadi' }));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Ma‘lumot noto‘g‘ri' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON noto‘g‘ri' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'So‘rov juda katta' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Noto‘g‘ri ID' });
  if (err.code === '23503') return res.status(404).json({ error: 'Topilmadi' });
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

await migrate();
app.listen(config.port, () => {
  console.log(`URDU CONNECT backend: http://localhost:${config.port}`);
});
