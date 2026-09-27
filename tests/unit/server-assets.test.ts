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
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH',
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
it('keeps draft images private and grants reads only through classroom version visibility', async () => {
  const a = await upload(),
    p = await authored(a.id);
  expect((await request('GET', '/api/assets')).statusCode).toBe(401);
  expect((await request('GET', '/api/assets', alice)).json().assets).toHaveLength(1);
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(0);
  expect((await request('GET', '/api/assets/' + a.id, bob)).statusCode).toBe(404);
  expect((await request('GET', '/api/assets/' + a.id, teacher)).statusCode).toBe(404);
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 1 })
  ).json();
  expect((await request('GET', '/api/assets/' + a.id, teacher)).statusCode).toBe(200);
  expect((await request('GET', '/api/assets/' + a.id, bob)).statusCode).toBe(404);
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  const image = await request('GET', '/api/assets/' + a.id, bob);
  expect(image.statusCode).toBe(200);
  expect(image.headers['content-type']).toContain('image/png');
  expect(image.headers['cache-control']).toBe('no-store');
  expect(image.rawPayload).toEqual(Buffer.from(a.data, 'base64'));
  ctx.db.exec(
    "INSERT INTO classrooms VALUES ('otherclass','another'); INSERT INTO users SELECT 'otheruser','otherclass','otherteacher','异班','teacher',password_hash,1 FROM users WHERE username='teacher'",
  );
  const other = await login('otherteacher');
  expect((await request('GET', '/api/assets/' + a.id, other)).statusCode).toBe(404);
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'withdrawn' });
  expect((await request('GET', '/api/assets/' + a.id, bob)).statusCode).toBe(404);
  expect((await request('GET', '/api/assets/' + a.id, teacher)).statusCode).toBe(200);
});
it('rejects missing and foreign image references in create save and submit; frozen bytes survive replacements', async () => {
  const a = await upload(),
    p = await authored(a.id);
  expect((await request('POST', '/api/projects', bob, { document: p.document })).statusCode).toBe(
    400,
  );
  const missing = structuredClone(p.document);
  missing.hero.skin = 'asset:missing';
  expect(
    (await request('PUT', '/api/projects/' + p.id, alice, { document: missing, revision: 1 }))
      .statusCode,
  ).toBe(400);
  const foreign = await upload(bob, 'green');
  missing.hero.skin = 'asset:' + foreign.id;
  expect(
    (await request('PUT', '/api/projects/' + p.id, alice, { document: missing, revision: 1 }))
      .statusCode,
  ).toBe(400);
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 1 })
  ).json();
  const b = await upload(alice, 'blue');
  const changed = structuredClone(p.document);
  changed.hero.skin = 'asset:' + b.id;
  expect(
    (await request('PUT', '/api/projects/' + p.id, alice, { document: changed, revision: 1 }))
      .statusCode,
  ).toBe(200);
  expect(
    documentAssets((await request('GET', '/api/versions/' + v.id, alice)).json().document),
  ).toEqual([a.id]);
  expect((await request('GET', '/api/assets/' + a.id, alice)).rawPayload).toEqual(
    Buffer.from(a.data, 'base64'),
  );
  ctx.db.prepare('UPDATE projects SET document=? WHERE id=?').run(JSON.stringify(missing), p.id);
  expect(
    (await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 2 })).statusCode,
  ).toBe(400);
});
it('imports self-contained images for both games, remaps IDs and marks file attribution as unverified', async () => {
  const a = await upload();
  for (const name of ['cloud-post', 'forest-letter'] as const) {
    const doc = adventureTemplate(name);
    doc.hero.skin = 'asset:' + a.id;
    const bundle = {
      format: 'magic-creater-bundle',
      bundleVersion: 1,
      document: doc,
      assets: [{ id: a.id, name: a.name, data: a.data }],
      source: { versionId: 'old', title: '先前作品', authorName: '同学', verified: true },
    };
    const imported = await request('POST', '/api/projects/import', bob, { bundle });
    expect(imported.statusCode).toBe(201);
    const p = imported.json(),
      id = documentAssets(p.document)[0];
    expect(id).not.toBe(a.id);
    expect(p.source.verified).toBe(false);
    expect((await request('GET', '/api/assets/' + id, bob)).rawPayload).toEqual(
      Buffer.from(a.data, 'base64'),
    );
    expect((await request('GET', '/api/assets/' + id, alice)).statusCode).toBe(404);
  }
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(1);
  expect(
    (await request('POST', '/api/projects/import', bob, { bundle: template() })).statusCode,
  ).toBe(201);
});
it('rolls back all imported images and the project when a later image exceeds quota', async () => {
  const a = await upload(alice, 'red'),
    b = await upload(alice, 'blue');
  const bobId = (await request('GET', '/api/me', bob)).json().user.id;
  for (let i = 0; i < ASSET_LIMITS.count - 1; i++)
    storeImage(ctx.db, bobId, 'fixture', Buffer.from('fixture' + i));
  const doc = adventureTemplate();
  doc.hero.skin = 'asset:' + a.id;
  doc.rooms[0].objects.find((o) => o.kind === 'decoration')!.skin = 'asset:' + b.id;
  const bundle = {
    format: 'magic-creater-bundle',
    bundleVersion: 1,
    document: doc,
    assets: [a, b].map(({ id, name, data }) => ({ id, name, data })),
  };
  const result = await request('POST', '/api/projects/import', bob, { bundle });
  expect(result.statusCode).toBe(400);
  expect(result.json().message).toContain('额度');
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(99);
  expect((await request('GET', '/api/projects', bob)).json().projects).toHaveLength(0);
  bundle.assets[1].data = Buffer.from('broken').toString('base64');
  expect((await request('POST', '/api/projects/import', bob, { bundle })).statusCode).toBe(400);
  expect((await request('GET', '/api/assets', bob)).json().assets).toHaveLength(99);
});
