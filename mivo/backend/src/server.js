import 'express-async-errors';
import http from 'node:http'; import { mountChat } from './chat.js';
import express from 'express'; import helmet from 'helmet'; import cors from 'cors';
import rateLimit from 'express-rate-limit'; import pg from 'pg'; import argon2 from 'argon2';
import jwt from 'jsonwebtoken'; import crypto from 'node:crypto';

const { DATABASE_URL, JWT_SECRET, CORS_ORIGIN, SMS_API_URL, SMS_API_KEY, PORT = 8080 } = process.env;
if (!DATABASE_URL || !JWT_SECRET) throw new Error('DATABASE_URL and JWT_SECRET are required');
const db = new pg.Pool({ connectionString: DATABASE_URL });
const sha = (s) => crypto.createHmac('sha256', JWT_SECRET).update(s).digest('hex');
const err = (res, status, code, message) => res.status(status).json({ error: { code, message } });

const app = express();
app.use(helmet(), express.json({ limit: '100kb' }));
app.use(cors({ origin: CORS_ORIGIN ? CORS_ORIGIN.split(',') : false }));
app.use('/v1/auth', rateLimit({ windowMs: 60_000, limit: 20 }));

app.get('/health', async (_q, res) => { await db.query('SELECT 1'); res.json({ ok: true }); });

app.post('/v1/auth/request-code', async (req, res) => {
  const phone = String(req.body.phone || '');
  if (!/^\+\d{9,15}$/.test(phone)) return err(res, 400, 'BAD_PHONE', 'Format: +998901234567');
  const DEV = process.env.DEV_OTP === 'true';
  if (!DEV && (!SMS_API_URL || !SMS_API_KEY)) return err(res, 501, 'SMS_PROVIDER_NOT_CONFIGURED', 'SMS provayder sozlanmagan');
  const code = String(crypto.randomInt(100000, 1000000));
  await db.query('INSERT INTO otp_codes(phone,code_hash,expires_at) VALUES($1,$2,now()+interval \'5 minutes\')', [phone, sha(phone + code)]);
  if (DEV) return res.json({ sent: true, devCode: code, warning: 'DEV_OTP rejimi: faqat sinov uchun' });
  const r = await fetch(SMS_API_URL, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SMS_API_KEY}` },
    body: JSON.stringify({ to: phone, text: `MIVO kodi: ${code}` }) });
  if (!r.ok) return err(res, 502, 'SMS_SEND_FAILED', 'SMS yuborilmadi');
  res.json({ sent: true });
});

async function issueSession(userId, device) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  await db.query('INSERT INTO user_sessions(user_id,refresh_hash,device_name,expires_at) VALUES($1,$2,$3,now()+interval \'30 days\')', [userId, sha(refresh), device || null]);
  const access = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '15m' });
  return { accessToken: access, refreshToken: refresh };
}

app.post('/v1/auth/verify-code', async (req, res) => {
  const { phone, code, deviceName } = req.body;
  const { rows } = await db.query('SELECT * FROM otp_codes WHERE phone=$1 AND consumed_at IS NULL AND expires_at>now() ORDER BY id DESC LIMIT 1', [phone]);
  const otp = rows[0];
  if (!otp || otp.attempts >= 5) return err(res, 400, 'CODE_INVALID', 'Kod yaroqsiz yoki muddati tugagan');
  if (otp.code_hash !== sha(phone + code)) {
    await db.query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1', [otp.id]);
    return err(res, 400, 'CODE_INVALID', 'Kod noto\'g\'ri');
  }
  await db.query('UPDATE otp_codes SET consumed_at=now() WHERE id=$1', [otp.id]);
  const u = await db.query('INSERT INTO users(phone) VALUES($1) ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id', [phone]);
  await db.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING', [u.rows[0].id]);
  res.json(await issueSession(u.rows[0].id, deviceName));
});

app.post('/v1/auth/refresh', async (req, res) => {
  const h = sha(String(req.body.refreshToken || ''));
  const r = await db.query('UPDATE user_sessions SET revoked_at=now() WHERE refresh_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING user_id, device_name', [h]);
  if (!r.rowCount) return err(res, 401, 'REFRESH_INVALID', 'Qayta kiring');
  res.json(await issueSession(r.rows[0].user_id, r.rows[0].device_name));
});

app.post('/v1/auth/logout', async (req, res) => {
  await db.query('UPDATE user_sessions SET revoked_at=now() WHERE refresh_hash=$1', [sha(String(req.body.refreshToken || ''))]);
  res.json({ ok: true });
});

const auth = (req, res, next) => {
  try { req.uid = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET).sub; next(); }
  catch { err(res, 401, 'UNAUTHORIZED', 'Token yaroqsiz'); }
};
app.get('/v1/me', auth, async (req, res) => {
  const { rows } = await db.query('SELECT id,phone,username,display_name FROM users WHERE id=$1', [req.uid]);
  res.json(rows[0]);
});
app.get('/v1/wallet', auth, async (req, res) => {
  const { rows } = await db.query('SELECT COALESCE(SUM(amount),0)::text AS balance FROM ledger_entries WHERE user_id=$1', [req.uid]);
  res.json({ asterBalance: rows[0].balance });
});

const chat = mountChat({ app, db, auth, err, secret: JWT_SECRET });
app.use((e, _q, res, _n) => { console.error(e); err(res, 500, 'INTERNAL', 'Server xatosi'); });
const server = http.createServer(app); chat.attach(server);
server.listen(PORT, () => console.log('MIVO API on', PORT));
