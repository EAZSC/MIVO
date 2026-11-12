import pg from 'pg'; import fs from 'node:fs';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query('CREATE TABLE IF NOT EXISTS _migrations(name text PRIMARY KEY)');
for (const f of fs.readdirSync('migrations').sort()) {
  const done = await c.query('SELECT 1 FROM _migrations WHERE name=$1', [f]);
  if (done.rowCount) continue;
  await c.query('BEGIN');
  try { await c.query(fs.readFileSync('migrations/' + f, 'utf8'));
    await c.query('INSERT INTO _migrations VALUES($1)', [f]); await c.query('COMMIT'); console.log('applied', f); }
  catch (e) { await c.query('ROLLBACK'); throw e; }
}
await c.end();
