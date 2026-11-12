import jwt from 'jsonwebtoken'; import { WebSocketServer } from 'ws';
const UUID = /^[0-9a-f-]{36}$/i;
export function mountChat({ app, db, auth, err, secret }) {
  const socks = new Map();
  const push = (ids, ev) => { const s = JSON.stringify(ev);
    for (const id of ids) for (const w of socks.get(id) || []) if (w.readyState === 1) w.send(s); };
  const isMember = async (cid, uid) => UUID.test(cid) &&
    (await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [cid, uid])).rowCount > 0;

  app.put('/v1/me', auth, async (req, res) => {
    const username = String(req.body.username || '').toLowerCase();
    const displayName = String(req.body.displayName || '').trim().slice(0, 50);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return err(res, 400, 'BAD_USERNAME', 'Username: 3-20 ta harf/raqam/_');
    try {
      const r = await db.query('UPDATE users SET username=$1, display_name=$2 WHERE id=$3 RETURNING id,phone,username,display_name', [username, displayName || username, req.uid]);
      res.json(r.rows[0]);
    } catch (e) { if (e.code === '23505') return err(res, 409, 'USERNAME_TAKEN', 'Bu username band'); throw e; }
  });

  app.get('/v1/users/search', auth, async (req, res) => {
    const q = String(req.query.q || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (q.length < 2) return res.json([]);
    const { rows } = await db.query('SELECT id,username,display_name FROM users WHERE username LIKE $1 AND id<>$2 ORDER BY username LIMIT 20', [q + '%', req.uid]);
    res.json(rows);
  });

  app.get('/v1/chats', auth, async (req, res) => {
    const { rows } = await db.query(`
      SELECT c.id, u.id AS user_id, u.username, u.display_name,
        (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_at
      FROM conversation_members me
      JOIN conversations c ON c.id=me.conversation_id
      JOIN conversation_members o ON o.conversation_id=c.id AND o.user_id<>me.user_id
      JOIN users u ON u.id=o.user_id
      WHERE me.user_id=$1 ORDER BY last_at DESC NULLS LAST, c.created_at DESC`, [req.uid]);
    res.json(rows);
  });

  app.post('/v1/chats', auth, async (req, res) => {
    const other = String(req.body.userId || '');
    if (!UUID.test(other) || other === req.uid) return err(res, 400, 'BAD_USER', 'Noto\'g\'ri foydalanuvchi');
    if (!(await db.query('SELECT 1 FROM users WHERE id=$1', [other])).rowCount) return err(res, 404, 'NO_USER', 'Topilmadi');
    const ex = await db.query('SELECT a.conversation_id AS id FROM conversation_members a JOIN conversation_members b ON a.conversation_id=b.conversation_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1', [req.uid, other]);
    if (ex.rowCount) return res.json({ id: ex.rows[0].id });
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const id = (await c.query('INSERT INTO conversations DEFAULT VALUES RETURNING id')).rows[0].id;
      await c.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)', [id, req.uid, other]);
      await c.query('COMMIT'); res.json({ id });
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  });

  app.get('/v1/chats/:id/messages', auth, async (req, res) => {
    if (!(await isMember(req.params.id, req.uid))) return err(res, 403, 'FORBIDDEN', 'Ruxsat yo\'q');
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const { rows } = await db.query('SELECT id, sender_id AS "senderId", body, created_at AS "createdAt" FROM messages WHERE conversation_id=$1 AND id<$2 ORDER BY id DESC LIMIT 50', [req.params.id, before]);
    res.json(rows.reverse());
  });

  app.post('/v1/chats/:id/messages', auth, async (req, res) => {
    if (!(await isMember(req.params.id, req.uid))) return err(res, 403, 'FORBIDDEN', 'Ruxsat yo\'q');
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 4000) return err(res, 400, 'BAD_BODY', 'Xabar 1-4000 belgi');
    const { rows } = await db.query('INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id, sender_id AS "senderId", body, created_at AS "createdAt"', [req.params.id, req.uid, body]);
    const msg = { ...rows[0], conversationId: req.params.id };
    const mem = await db.query('SELECT user_id FROM conversation_members WHERE conversation_id=$1', [req.params.id]);
    push(mem.rows.map(r => r.user_id), { type: 'message', message: msg });
    res.status(201).json(msg);
  });

  return { attach(server) {
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
      let uid;
      try { uid = jwt.verify(new URL(req.url, 'http://x').searchParams.get('token') || '', secret).sub; } catch { return ws.close(4401); }
      if (!socks.has(uid)) socks.set(uid, new Set());
      socks.get(uid).add(ws); ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      ws.on('close', () => socks.get(uid)?.delete(ws));
      ws.on('error', () => {});
    });
    setInterval(() => wss.clients.forEach(w => { if (!w.alive) return w.terminate(); w.alive = false; w.ping(); }), 30000).unref();
  } };
}
