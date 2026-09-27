import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
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
const { DATABASE_VERSION } = await import(pathToFileURL(join(release, 'dist/server/db.js')).href);
assert.equal((await (await fetch(origin + '/api/health')).json()).database, DATABASE_VERSION);
const commit = readFileSync(join(release, 'COMMIT'), 'utf8').trim();
assert.match(commit, /^[a-f0-9]{40}$/);
// The final acceptance record can be committed after deployment without changing the release.
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    commit,
    'HEAD',
    '--',
    'src',
    'public',
    'scripts',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.server.json',
    'index.html',
  ],
  { stdio: 'pipe' },
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const html = await (await fetch(origin)).text();
assert.equal(html, readFileSync(join(release, 'dist/web/index.html'), 'utf8'));
const resources = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map((m) => m[1]);
resources.push('/art/storybook-v1/cottage-background.svg');
assert(resources.length >= 3);
for (const resource of resources) {
  const response = await fetch(origin + resource);
  assert.equal(response.status, 200);
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(readFileSync(join(release, 'dist/web', resource))),
  );
}
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
  const raw = new Database(databasePath, { readonly: true });
  assert.equal(raw.pragma('user_version', { simple: true }), DATABASE_VERSION);
  raw.close();
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
  assert.equal(context.db.pragma('user_version', { simple: true }), DATABASE_VERSION);
  assert(process.argv[2], 'Pass the pre-upgrade SQLite snapshot to verify existing content');
  const original = new Database(process.argv[2], { readonly: true, fileMustExist: true });
  try {
    for (const table of [
      'users',
      'classrooms',
      'projects',
      'versions',
      'feedback',
      'assets',
      'project_creations',
    ]) {
      if (
        !original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
      )
        continue;
      const cols = original
        .pragma('table_info(' + table + ')')
        .map((c) => c.name)
        .join(',');
      const query = 'SELECT ' + cols + ' FROM ' + table + ' ORDER BY rowid';
      assert.equal(
        digest(JSON.stringify(context.db.prepare(query).all())),
        digest(JSON.stringify(original.prepare(query).all())),
        table + ' preserved',
      );
    }
  } finally {
    original.close();
  }
  const counts = Object.fromEntries(
    ['users', 'classrooms', 'projects', 'versions', 'feedback', 'assets', 'project_creations'].map(
      (t) => [t, context.db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n],
    ),
  );
  console.log(
    JSON.stringify({
      service: 'active',
      release,
      commit,
      schema: DATABASE_VERSION,
      frontendResources: resources.length,
      existingContent: 'unchanged',
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
