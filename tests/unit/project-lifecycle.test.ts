import sharp from 'sharp';
import { documentAssets, ASSET_LIMITS } from '../../src/shared/portable.js';
import { storeImage } from '../../src/server/assets.js';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.js';
import { bootstrap } from '../../src/server/admin.js';
import { template } from '../../src/shared/game.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
const origin = 'http://127.0.0.1:4173',
  password = 'test-password-123';
type Context = Awaited<ReturnType<typeof createApp>>;
let ctx: Context,
  teacher = '',
  alice = '',
  bob = '';
async function request(
  method: string,
  url: string,
  cookie = '',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return ctx.app.inject({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url,
    headers: { origin, ...(cookie ? { cookie } : {}), ...headers },
    ...(body !== undefined
      ? {
          payload: JSON.stringify(body),
          headers: {
            origin,
            ...(cookie ? { cookie } : {}),
            'content-type': 'application/json',
            ...headers,
          },
        }
      : {}),
  });
}
async function login(username: string, pw = password) {
  const res = await request('POST', '/api/login', '', { username, password: pw });
  expect(res.statusCode).toBe(200);
  return String(res.headers['set-cookie']).split(';')[0];
}
async function createProject(cookie = alice) {
  const res = await request('POST', '/api/projects', cookie, { document: template() });
  expect(res.statusCode).toBe(201);
  return res.json();
}
beforeEach(async () => {
  ctx = await createApp({ databasePath: ':memory:', origins: [origin], logger: false });
  await bootstrap(ctx.db, {
    username: 'teacher',
    displayName: '老师',
    password,
    classroomName: '创作小组',
  });
  teacher = await login('teacher');
  for (const [username, displayName] of [
    ['alice', '小禾'],
    ['bob', '小林'],
  ])
    expect(
      (await request('POST', '/api/members', teacher, { username, displayName, password }))
        .statusCode,
    ).toBe(201);
  alice = await login('alice');
  bob = await login('bob');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await ctx.app.close();
});

async function upload(cookie = alice, color = 'red') {
  const data = (
    await sharp({ create: { width: 8, height: 4, channels: 4, background: color } })
      .png()
      .toBuffer()
  ).toString('base64');
  const res = await request('POST', '/api/assets', cookie, { name: '我的角色', data });
  expect(res.statusCode).toBe(201);
  return res.json();
}
async function authored(id: string, cookie = alice) {
  const doc = adventureTemplate();
  doc.hero.skin = 'asset:' + id;
  const p = await request('POST', '/api/projects', cookie, { document: doc });
  expect(p.statusCode).toBe(201);
  return p.json();
}

const creationKey = '12345678-1234-4234-8234-123456789012';
it('starts every new account empty and creates exactly once for a stable account-scoped key', async () => {
  for (const cookie of [teacher, alice, bob])
    expect((await request('GET', '/api/projects', cookie)).json().projects).toEqual([]);
  const body = { document: adventureTemplate(), creationKey, allowRemix: true };
  const a = await request('POST', '/api/projects', alice, body);
  expect(a.statusCode).toBe(201);
  expect(a.json().allowRemix).toBe(true);
  const retry = await request('POST', '/api/projects', alice, {
    ...body,
    document: { ...body.document, title: '后来改稿' },
  });
  expect(retry.statusCode).toBe(200);
  expect(retry.json()).toEqual(a.json());
  const other = await request('POST', '/api/projects', bob, body);
  expect(other.statusCode).toBe(201);
  expect(other.json().id).not.toBe(a.json().id);
  expect((await request('GET', '/api/projects', alice)).json().projects).toHaveLength(1);
});
it('validates creation keys and settings without persisting failed requests', async () => {
  for (const bad of [null, 123, '', 'x', 'x'.repeat(100)])
    expect(
      (await request('POST', '/api/projects', alice, { document: template(), creationKey: bad }))
        .statusCode,
    ).toBe(400);
  expect(
    (await request('POST', '/api/projects', alice, { document: template(), allowRemix: 'yes' }))
      .statusCode,
  ).toBe(400);
  expect((await request('GET', '/api/projects', alice)).json().projects).toHaveLength(0);
});
it('rejects unauthorized, foreign, stale and malformed deletion without changing the project', async () => {
  const p = await createProject();
  const url = '/api/projects/' + p.id;
  expect((await request('DELETE', url, '', { revision: 1 })).statusCode).toBe(401);
  for (const who of [bob, teacher])
    expect((await request('DELETE', url, who, { revision: 1 })).statusCode).toBe(404);
  expect(
    (await request('DELETE', url, alice, { revision: 1 }, { origin: 'https://foreign.test' }))
      .statusCode,
  ).toBe(403);
  for (const body of [{}, { revision: 0 }, { revision: '1' }, { revision: 1, extra: true }])
    expect((await request('DELETE', url, alice, body)).statusCode).toBe(400);
  await request('PUT', url, alice, { document: p.document, revision: 1 });
  expect((await request('DELETE', url, alice, { revision: 1 })).statusCode).toBe(409);
  expect((await request('GET', url, alice)).json().revision).toBe(2);
});
it('deletes all version states and feedback atomically while preserving shared art and independent remix', async () => {
  const asset = await upload(),
    p = await authored(asset.id);
  await request('PUT', '/api/projects/' + p.id, alice, {
    document: p.document,
    revision: 1,
    allowRemix: true,
  });
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 2 })
  ).json();
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  expect(
    (await request('POST', '/api/versions/' + v.id + '/feedback', bob, { text: '我喜欢这段路' }))
      .statusCode,
  ).toBe(201);
  const remix = (await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).json();
  const copy = (await request('POST', '/api/projects/' + p.id + '/copy', alice, {})).json();
  for (const [index, status] of ['pending', 'returned', 'withdrawn'].entries())
    ctx.db
      .prepare(
        'INSERT INTO versions(id,project_id,source_revision,document,status,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('old-' + index, p.id, index + 3, JSON.stringify(p.document), status, 1);
  ctx.db.prepare('UPDATE feedback SET hidden=1 WHERE version_id=?').run(v.id);
  const before = ['projects', 'versions', 'feedback', 'assets'].map((t) =>
    ctx.db.prepare('SELECT * FROM ' + t + ' ORDER BY id').all(),
  );
  ctx.db.exec(
    "CREATE TRIGGER fail_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  expect(
    (await request('DELETE', '/api/projects/' + p.id, alice, { revision: 2 })).statusCode,
  ).toBe(500);
  expect(
    ['projects', 'versions', 'feedback', 'assets'].map((t) =>
      ctx.db.prepare('SELECT * FROM ' + t + ' ORDER BY id').all(),
    ),
  ).toEqual(before);
  ctx.db.exec('DROP TRIGGER fail_delete');
  const result = await request('DELETE', '/api/projects/' + p.id, alice, { revision: 2 });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual({ ok: true, id: p.id });
  expect(ctx.db.prepare('SELECT * FROM versions WHERE project_id=?').all(p.id)).toEqual([]);
  expect(ctx.db.prepare('SELECT * FROM feedback').all()).toEqual([]);
  expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
  expect((await request('GET', '/api/projects/' + copy.id, alice)).statusCode).toBe(200);
  expect((await request('GET', '/api/projects/' + remix.id, bob)).json().source.versionId).toBe(
    v.id,
  );
  expect((await request('GET', '/api/assets/' + asset.id, alice)).statusCode).toBe(200);
  expect((await request('GET', '/api/assets/' + asset.id, bob)).statusCode).toBe(404);
  expect(
    (await request('GET', '/api/assets/' + documentAssets(remix.document)[0], bob)).statusCode,
  ).toBe(200);
  for (const who of [alice, bob, teacher])
    expect((await request('GET', '/api/versions/' + v.id, who)).statusCode).toBe(404);
  for (const [method, url, body] of [
    ['GET', '/api/projects/' + p.id, undefined],
    ['PUT', '/api/projects/' + p.id, { document: p.document, revision: 2 }],
    ['POST', '/api/projects/' + p.id + '/copy', {}],
    ['POST', '/api/projects/' + p.id + '/submit', { revision: 2 }],
    ['GET', '/api/projects/' + p.id + '/versions', undefined],
    ['GET', '/api/projects/' + p.id + '/feedback', undefined],
    ['DELETE', '/api/projects/' + p.id, { revision: 2 }],
  ] as const)
    expect((await request(method, url, alice, body)).statusCode).toBe(404);
  expect((await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).statusCode).toBe(404);
  expect(
    (await request('POST', '/api/versions/' + v.id + '/feedback', bob, { text: '旧入口' }))
      .statusCode,
  ).toBe(404);
  expect((await request('GET', '/api/shelf', bob)).json().versions).toEqual([]);
  expect((await request('GET', '/api/manage/versions', teacher)).json().versions).toEqual([]);
});
it('keeps a creation tombstone after permanent deletion so a delayed first-save retry cannot resurrect it', async () => {
  const body = { document: template(), creationKey };
  const p = (await request('POST', '/api/projects', alice, body)).json();
  expect(
    (await request('DELETE', '/api/projects/' + p.id, alice, { revision: 1 })).statusCode,
  ).toBe(200);
  expect((await request('POST', '/api/projects', alice, body)).statusCode).toBe(410);
  expect((await request('GET', '/api/projects', alice)).json().projects).toEqual([]);
});

it('rejects a stale tab expected account before creating or reading another account project', async () => {
  const owner = (await request('GET', '/api/me', alice)).json().user.id;
  expect(
    (
      await request(
        'POST',
        '/api/projects',
        bob,
        { document: template(), creationKey },
        { 'x-workshop-user': owner },
      )
    ).statusCode,
  ).toBe(401);
  expect(
    (await request('GET', '/api/projects', bob, undefined, { 'x-workshop-user': owner }))
      .statusCode,
  ).toBe(401);
  expect((await request('GET', '/api/projects', bob)).json().projects).toEqual([]);
  expect(
    (await request('GET', '/api/projects', alice, undefined, { 'x-workshop-user': owner }))
      .statusCode,
  ).toBe(200);
});

for (const kind of ['copy', 'import', 'remix'] as const)
  it(
    kind + ' creation replays once, separates owners and preserves deletion tombstones',
    async () => {
      const p = await createProject();
      let url = '/api/projects/' + p.id + '/copy',
        payload: Record<string, unknown> = {};
      if (kind === 'import') {
        url = '/api/projects/import';
        payload = { bundle: p.document };
      }
      if (kind === 'remix') {
        await request('PUT', '/api/projects/' + p.id, alice, {
          document: p.document,
          revision: 1,
          allowRemix: true,
        });
        const v = (
          await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 2 })
        ).json();
        await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
        url = '/api/versions/' + v.id + '/remix';
      }
      const body = { ...payload, creationKey };
      expect((await request('POST', url, alice, { ...body, creationKey: 'bad' })).statusCode).toBe(
        400,
      );
      const first = await request('POST', url, alice, body);
      expect(first.statusCode).toBe(201);
      const retry = await request('POST', url, alice, body);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual(first.json());
      const next = await request('POST', url, alice, { ...body, creationKey: crypto.randomUUID() });
      expect(next.statusCode).toBe(201);
      expect(next.json().id).not.toBe(first.json().id);
      if (kind !== 'copy') {
        const other = await request('POST', url, bob, body);
        expect(other.statusCode).toBe(201);
        expect(other.json().id).not.toBe(first.json().id);
      } else expect((await request('POST', url, bob, body)).statusCode).toBe(404);
      await request('DELETE', '/api/projects/' + first.json().id, alice, { revision: 1 });
      expect((await request('POST', url, alice, body)).statusCode).toBe(410);
      // A successful independent result can still be retrieved after its source disappears.
      await request('DELETE', '/api/projects/' + p.id, alice, {
        revision: kind === 'remix' ? 2 : 1,
      });
      const nextKey = (
        ctx.db
          .prepare('SELECT creation_key FROM project_creations WHERE project_id=?')
          .get(next.json().id) as { creation_key: string }
      ).creation_key;
      expect(
        (await request('POST', url, alice, { ...payload, creationKey: nextKey })).json().id,
      ).toBe(next.json().id);
    },
  );
it('serializes concurrent normalized-image imports and rolls back a failed creation mapping atomically', async () => {
  const a = await upload();
  const d = adventureTemplate();
  d.hero.skin = 'asset:imported';
  const body = {
    creationKey,
    bundle: {
      format: 'magic-creater-bundle',
      bundleVersion: 1,
      document: d,
      assets: [{ id: 'imported', name: '角色', data: a.data }],
    },
  };
  const before = ctx.db.prepare('SELECT count(*) n FROM projects').get();
  ctx.db.exec(
    "CREATE TRIGGER reject_mapping BEFORE INSERT ON project_creations BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  expect((await request('POST', '/api/projects/import', bob, body)).statusCode).toBe(500);
  expect(ctx.db.prepare('SELECT count(*) n FROM projects').get()).toEqual(before);
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(0);
  ctx.db.exec('DROP TRIGGER reject_mapping');
  const responses = await Promise.all([
    request('POST', '/api/projects/import', bob, body),
    request('POST', '/api/projects/import', bob, body),
  ]);
  expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
  expect(responses[0].json().id).toBe(responses[1].json().id);
  expect((await request('GET', '/api/projects', bob)).json().projects).toHaveLength(1);
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(1);
});
