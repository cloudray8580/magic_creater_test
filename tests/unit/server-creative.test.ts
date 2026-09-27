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

it('requires explicit frozen remix permission and preserves trusted source and independent images', async () => {
  const asset = await upload(),
    p = await authored(asset.id);
  expect(p.allowRemix).toBe(false);
  const submit = async (revision: number) =>
    (await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision })).json();
  const v1 = await submit(1);
  await request('PATCH', '/api/versions/' + v1.id, teacher, { status: 'approved' });
  expect((await request('POST', '/api/versions/' + v1.id + '/remix', bob, {})).statusCode).toBe(
    403,
  );
  const saved = await request('PUT', '/api/projects/' + p.id, alice, {
    document: p.document,
    revision: 1,
    allowRemix: true,
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json().allowRemix).toBe(true);
  expect((await request('GET', '/api/versions/' + v1.id, bob)).json().allowRemix).toBe(false);
  const v = await submit(2);
  expect(v.allowRemix).toBe(true);
  expect((await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).statusCode).toBe(404);
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  const result = await request('POST', '/api/versions/' + v.id + '/remix', bob, {});
  expect(result.statusCode).toBe(201);
  const r = result.json();
  expect(r.allowRemix).toBe(false);
  expect(r.source).toEqual({
    versionId: v.id,
    title: p.document.title,
    authorName: '小禾',
    verified: true,
  });
  const copiedId = documentAssets(r.document)[0];
  expect(copiedId).not.toBe(asset.id);
  expect((await request('GET', '/api/assets/' + copiedId, bob)).rawPayload).toEqual(
    Buffer.from(asset.data, 'base64'),
  );
  for (const source of [null, { versionId: 'forged' }])
    expect(
      (
        await request('PUT', '/api/projects/' + r.id, bob, {
          document: r.document,
          revision: 1,
          source,
        })
      ).statusCode,
    ).toBe(400);
  const update = await request('PUT', '/api/projects/' + r.id, bob, {
    document: r.document,
    revision: 1,
  });
  expect(update.statusCode).toBe(200);
  expect(update.json().source).toEqual(r.source);
  const copy = await request('POST', '/api/projects/' + r.id + '/copy', bob, {
    document: { ...r.document, title: '我的新标题' },
  });
  expect(copy.statusCode).toBe(201);
  expect(copy.json().source).toEqual(r.source);
  expect(copy.json().allowRemix).toBe(false);
  const child = (
    await request('POST', '/api/projects/' + r.id + '/submit', bob, { revision: 2 })
  ).json();
  expect(child.source).toEqual(r.source);
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'withdrawn' });
  expect((await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).statusCode).toBe(404);
  expect((await request('GET', '/api/assets/' + copiedId, bob)).statusCode).toBe(200);
  expect((await request('GET', '/api/projects/' + r.id, bob)).json().source).toEqual(r.source);
});
it('rejects foreign and stale mutations and rolls back remix asset quota failures', async () => {
  const a = await upload(),
    p = await authored(a.id);
  expect((await request('POST', '/api/projects/' + p.id + '/copy', bob, {})).statusCode).toBe(404);
  expect(
    (
      await request('PUT', '/api/projects/' + p.id, alice, {
        document: p.document,
        revision: 1,
        allowRemix: 'true',
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request('PUT', '/api/projects/' + p.id, alice, {
        document: p.document,
        revision: 99,
        allowRemix: true,
      })
    ).statusCode,
  ).toBe(409);
  await request('PUT', '/api/projects/' + p.id, alice, {
    document: p.document,
    revision: 1,
    allowRemix: true,
  });
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 2 })
  ).json();
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  ctx.db.exec(
    "INSERT INTO classrooms VALUES ('otherclass','other'); INSERT INTO users SELECT 'otheruser','otherclass','otherteacher','异班','teacher',password_hash,1 FROM users WHERE username='teacher'",
  );
  const other = await login('otherteacher');
  expect((await request('POST', '/api/versions/' + v.id + '/remix', other, {})).statusCode).toBe(
    404,
  );
  const owner = (await request('GET', '/api/me', bob)).json().user.id;
  for (let i = 0; i < 100; i++)
    storeImage(ctx.db, owner, 'fixture-' + i, Buffer.from('unique' + i));
  const before = ctx.db.prepare('SELECT COUNT(*) n FROM projects').get();
  expect((await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).statusCode).toBe(400);
  expect(ctx.db.prepare('SELECT COUNT(*) n FROM projects').get()).toEqual(before);
});
it('validates optional feedback coordinates against the frozen version and keeps them after later editing', async () => {
  const p = (
    await request('POST', '/api/projects', alice, { document: adventureTemplate('forest-letter') })
  ).json();
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 1 })
  ).json();
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  for (const location of [
    { roomId: 'missing', x: 1, y: 1 },
    { roomId: 'garden', x: -1, y: 2 },
    { roomId: 'garden', x: 1.5, y: 2 },
    { roomId: 'garden', x: 999, y: 2 },
    { roomId: 'garden', x: 1, y: 2, extra: true },
  ])
    expect(
      (
        await request('POST', '/api/versions/' + v.id + '/feedback', bob, {
          text: '这里有疑问',
          location,
        })
      ).statusCode,
    ).toBe(400);
  const location = { roomId: 'garden', x: 3, y: 8 };
  const response = await request('POST', '/api/versions/' + v.id + '/feedback', bob, {
    text: '这封信很有意思',
    location,
  });
  expect(response.statusCode).toBe(201);
  expect(response.json().location).toEqual(location);
  const changed = structuredClone(p.document);
  changed.rooms[0].name = '后来改过的房间';
  await request('PUT', '/api/projects/' + p.id, alice, { document: changed, revision: 1 });
  const found = (await request('GET', '/api/projects/' + p.id + '/feedback', alice)).json()
    .feedback[0];
  expect(found.location).toEqual(location);
  expect(found.versionId).toBe(v.id);
  expect((await request('GET', '/api/versions/' + v.id, alice)).json().document.rooms[0].name).toBe(
    p.document.rooms[0].name,
  );
  const plain = await request('POST', '/api/versions/' + v.id + '/feedback', bob, {
    text: '整体很好',
  });
  expect(plain.statusCode).toBe(201);
  expect(plain.json().location).toBeNull();
  const legacy = await createProject();
  const old = (
    await request('POST', '/api/projects/' + legacy.id + '/submit', alice, { revision: 1 })
  ).json();
  await request('PATCH', '/api/versions/' + old.id, teacher, { status: 'approved' });
  expect(
    (
      await request('POST', '/api/versions/' + old.id + '/feedback', bob, {
        text: '不带坐标',
        location,
      })
    ).statusCode,
  ).toBe(400);
});

it('does not persist copies or remixes whose new title exceeds the document byte ceiling', async () => {
  const doc = adventureTemplate('forest-letter');
  doc.title = 'A';
  for (let i = 0; i < 200; i++)
    doc.rooms[0].objects.push({
      id: 'writer-' + i,
      kind: 'npc',
      x: 4,
      y: 4,
      dialogue: Array.from({ length: 8 }, (_, j) => ({ id: 'page-' + j, text: 'x', choices: [] })),
    });
  const target = 1024 * 1024 - 4;
  for (const page of doc.rooms[0].objects
    .filter((o) => o.id.startsWith('writer-'))
    .flatMap((o) => o.dialogue!)) {
    const available = target - Buffer.byteLength(JSON.stringify(doc)) + 1;
    if (available <= 0) break;
    const bytes = Math.min(720, available);
    page.text =
      '界'.repeat(Math.floor(bytes / 3)) + (bytes % 3 === 2 ? 'é' : bytes % 3 === 1 ? 'x' : '');
    if (Buffer.byteLength(JSON.stringify(doc)) === target) break;
  }
  expect(Buffer.byteLength(JSON.stringify(doc))).toBe(target);
  const result = await request('POST', '/api/projects', alice, { document: doc });
  expect(result.statusCode).toBe(201);
  const p = result.json();
  await request('PUT', '/api/projects/' + p.id, alice, {
    document: doc,
    revision: 1,
    allowRemix: true,
  });
  const v = (
    await request('POST', '/api/projects/' + p.id + '/submit', alice, { revision: 2 })
  ).json();
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  const before = ctx.db.prepare('SELECT count(*) n FROM projects').get();
  expect((await request('POST', '/api/projects/' + p.id + '/copy', alice, {})).statusCode).toBe(
    400,
  );
  expect((await request('POST', '/api/versions/' + v.id + '/remix', bob, {})).statusCode).toBe(400);
  expect(ctx.db.prepare('SELECT count(*) n FROM projects').get()).toEqual(before);
});
it('serves small owner/version/shelf/review summaries while full detail remains authorized and frozen', async () => {
  const document = adventureTemplate();
  document.rooms[0].width = 512;
  document.rooms[0].height = 64;
  const created = await request('POST', '/api/projects', alice, {
    document,
    creationKey: '12345678-1234-4123-8123-123456789abc',
  });
  expect(created.statusCode).toBe(201);
  const p = created.json();
  const summaries = (await request('GET', '/api/projects?summary=1', alice)).json().projects;
  expect(summaries[0]).toMatchObject({
    id: p.id,
    revision: 1,
    creationKey: p.creationKey,
    document: { title: document.title, schemaVersion: 2, gameType: 'platformer' },
  });
  expect(summaries[0].document.rooms).toBeUndefined();
  expect(JSON.stringify(summaries).length).toBeLessThan(1000);
  expect((await request('GET', '/api/projects?summary=1', bob)).json().projects).toEqual([]);
  expect((await request('GET', '/api/projects', alice)).json().projects[0].document).toEqual(
    document,
  );
  const submitted = await request('POST', '/api/projects/' + p.id + '/submit', alice, {
    revision: 1,
  });
  expect(submitted.statusCode).toBe(200);
  const v = submitted.json();
  for (const [url, cookie] of [
    ['/api/projects/' + p.id + '/versions?summary=1', alice],
    ['/api/manage/versions?summary=1', teacher],
  ]) {
    const res = await request('GET', url, cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().versions[0].document).toEqual(summaries[0].document);
  }
  expect((await request('GET', '/api/manage/versions?summary=1', bob)).statusCode).toBe(403);
  expect(
    (await request('GET', '/api/projects/' + p.id + '/versions?summary=1', bob)).statusCode,
  ).toBe(404);
  expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(404);
  await request('PATCH', '/api/versions/' + v.id, teacher, { status: 'approved' });
  expect((await request('GET', '/api/shelf?summary=1', bob)).json().versions[0].document).toEqual(
    summaries[0].document,
  );
  await request('PUT', '/api/projects/' + p.id, alice, {
    revision: 1,
    document: { ...document, title: '新版草稿' },
  });
  expect((await request('GET', '/api/versions/' + v.id, bob)).json().document).toEqual(document);
  expect((await request('GET', '/api/projects/' + p.id, alice)).json().document.title).toBe(
    '新版草稿',
  );
  expect((await request('GET', '/api/shelf', bob)).json().versions[0].document).toEqual(document);
  expect(
    (await request('GET', '/api/manage/versions', teacher)).json().versions[0].document,
  ).toEqual(document);
});
