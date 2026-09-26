import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:4173';
assert(
  process.env.BOOTSTRAP_PASSWORD,
  'Load the local bootstrap credential file; never paste it into a command.',
);
const login = await fetch(origin + '/api/login', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({
    username: process.env.BOOTSTRAP_USERNAME ?? 'teacher',
    password: process.env.BOOTSTRAP_PASSWORD,
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
execFileSync('systemctl', ['--user', 'restart', 'magic-creater.service']);
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch(origin + '/api/health');
    if (r.ok) break;
  } catch {}
  await delay(100);
}
assert.equal((await fetch(origin + '/api/me', { headers: { cookie } })).status, 200);
assert.equal(
  (await fetch(origin + '/api/logout', { method: 'POST', headers: { origin, cookie } })).status,
  200,
);
execFileSync('systemctl', ['--user', 'start', 'magic-creater-backup.service']);
const release = execFileSync(
  'systemctl',
  ['--user', 'show', 'magic-creater.service', '--property=WorkingDirectory', '--value'],
  { encoding: 'utf8' },
).trim();
const base = join(process.env.HOME, '.local/share/magic-creater');
const backup = readdirSync(join(base, 'backups'))
  .filter((f) => /^magic-.*\.sqlite$/.test(f))
  .sort()
  .at(-1);
assert(backup);
const restore = mkdtempSync(join(tmpdir(), 'magic-restore-')),
  databasePath = join(restore, 'app.sqlite');
let context;
try {
  copyFileSync(join(base, 'backups', backup), databasePath);
  const { startServer } = await import(pathToFileURL(join(release, 'dist/server/main.js')).href);
  context = await startServer({
    databasePath,
    origins: [origin],
    host: '127.0.0.1',
    port: 0,
    staticDir: join(release, 'dist/web'),
    logger: false,
  });
  assert.equal(context.db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(context.db.pragma('foreign_key_check'), []);
  const result = await context.app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin },
    payload: {
      username: process.env.BOOTSTRAP_USERNAME ?? 'teacher',
      password: process.env.BOOTSTRAP_PASSWORD,
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal((await context.app.inject('/')).statusCode, 200);
  const counts = Object.fromEntries(
    ['users', 'classrooms', 'projects', 'versions', 'feedback'].map((t) => [
      t,
      context.db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n,
    ]),
  );
  console.log(
    JSON.stringify({
      service: 'active',
      release,
      restartSession: 'passed',
      restore: 'passed',
      integrity: 'ok',
      foreignKeys: 'ok',
      backup,
      counts,
    }),
  );
} finally {
  await context?.app.close();
  rmSync(restore, { recursive: true, force: true });
}
