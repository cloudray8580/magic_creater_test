import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/server/config.js';
import { startServer } from '../../src/server/main.js';
import { openDatabase } from '../../src/server/db.js';
import { backupDatabase } from '../../src/server/backup.js';
import { template } from '../../src/shared/game.js';
import { runBootstrap } from '../../src/server/admin.js';
it('validates origins, ports and deployment defaults', () => {
  expect(() => loadConfig({})).toThrow();
  expect(() => loadConfig({ APP_DATABASE: '/tmp/test.sqlite', APP_ORIGINS: '*' })).toThrow();
  expect(() =>
    loadConfig({
      APP_DATABASE: '/tmp/test.sqlite',
      APP_ORIGINS: 'http://localhost:4173',
      PORT: 'oops',
    }),
  ).toThrow();
  const c = loadConfig({ APP_DATABASE: '/tmp/test.sqlite', APP_ORIGINS: 'http://localhost:4173' });
  expect(c.host).toBe('127.0.0.1');
  expect(c.secureCookies).toBe(false);
  expect(
    loadConfig({ APP_DATABASE: '/tmp/test.sqlite', APP_ORIGINS: 'https://school.example' })
      .secureCookies,
  ).toBe(true);
});
it('serves the built app, API and closes with durable state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'magic-ops-')),
    db = join(dir, 'data/app.sqlite'),
    web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'index.html'), '<h1>创作工坊</h1>');
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    await expect(runBootstrap({ APP_DATABASE: db })).rejects.toThrow();
    await runBootstrap({ APP_DATABASE: db, BOOTSTRAP_PASSWORD: 'test-password-123' });
    server = await startServer({
      databasePath: db,
      origins: ['http://127.0.0.1'],
      staticDir: web,
      host: '127.0.0.1',
      port: 0,
      secureCookies: false,
      logger: false,
    });
    expect((await server.app.inject('/')).body).toContain('创作工坊');
    expect((await server.app.inject('/api/no-such-route')).statusCode).toBe(404);
    expect((await server.app.inject('/.env')).statusCode).toBe(403);
    const auth = await server.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { origin: 'http://127.0.0.1' },
      payload: { username: 'teacher', password: 'test-password-123' },
    });
    expect(auth.statusCode).toBe(200);
    const headers = {
      origin: 'http://127.0.0.1',
      cookie: String(auth.headers['set-cookie']).split(';')[0],
    };
    const project = (
      await server.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers,
        payload: { document: template() },
      })
    ).json();
    const version = (
      await server.app.inject({
        method: 'POST',
        url: '/api/projects/' + project.id + '/submit',
        headers,
        payload: { revision: 1 },
      })
    ).json();
    expect(
      (
        await server.app.inject({
          method: 'PATCH',
          url: '/api/versions/' + version.id,
          headers,
          payload: { status: 'approved' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: '/api/versions/' + version.id + '/feedback',
          headers,
          payload: { text: 'restore-this-feedback' },
        })
      ).statusCode,
    ).toBe(201);
    // Back up with the source open and WAL active, then change it. The copy is independent.
    const copy = join(dir, 'backup.sqlite');
    await backupDatabase(db, copy);
    server.db.prepare("UPDATE versions SET status='withdrawn'").run();

    await server.app.close();
    server = undefined;
    const restored = openDatabase(copy);
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.pragma('foreign_key_check')).toEqual([]);
    expect(restored.prepare('SELECT username FROM users').get()).toEqual({ username: 'teacher' });
    expect(restored.prepare('SELECT status FROM versions').get()).toEqual({ status: 'approved' });
    expect(restored.prepare('SELECT text FROM feedback').get()).toEqual({
      text: 'restore-this-feedback',
    });
    expect(
      JSON.parse(
        (restored.prepare('SELECT document FROM projects').get() as { document: string }).document,
      ).title,
    ).toBe(template().title);
    restored.close();
    await expect(backupDatabase(db, db)).rejects.toThrow();
  } finally {
    await server?.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('backs up an older schema without migrating or modifying its source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'magic-old-backup-')),
    source = join(dir, 'old.sqlite'),
    copy = join(dir, 'copy.sqlite');
  try {
    const raw = new Database(source);
    raw.exec(
      "CREATE TABLE historic(value TEXT); INSERT INTO historic VALUES ('before-upgrade'); PRAGMA user_version=1",
    );
    raw.close();
    await backupDatabase(source, copy);
    for (const path of [source, copy]) {
      const db = new Database(path, { readonly: true });
      expect(db.pragma('user_version', { simple: true })).toBe(1);
      expect(db.prepare('SELECT value FROM historic').get()).toEqual({ value: 'before-upgrade' });
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('restores image bytes, references, frozen versions and file attribution from a live WAL backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'magic-images-')),
    source = join(dir, 'source.sqlite'),
    copy = join(dir, 'backup.sqlite');
  const origin = 'http://127.0.0.1';
  let live: Awaited<ReturnType<typeof createApp>> | undefined,
    restored: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    live = await createApp({ databasePath: source, origins: [origin] });
    await bootstrapForImage();
    async function bootstrapForImage() {
      await runBootstrap({ APP_DATABASE: source, BOOTSTRAP_PASSWORD: 'test-password-123' });
    }
    const login = await live.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { origin },
      payload: { username: 'teacher', password: 'test-password-123' },
    });
    const headers = { origin, cookie: String(login.headers['set-cookie']).split(';')[0] };
    const raw = await sharp({ create: { width: 6, height: 4, channels: 4, background: '#ab3456' } })
      .png()
      .toBuffer();
    const uploaded = await live.app.inject({
      method: 'POST',
      url: '/api/assets',
      headers,
      payload: { name: 'restore character', data: raw.toString('base64') },
    });
    expect(uploaded.statusCode).toBe(201);
    const a = uploaded.json();
    const document = adventureTemplate('forest-letter');
    document.hero.skin = 'asset:' + a.id;
    const project = await live.app.inject({
      method: 'POST',
      url: '/api/projects/import',
      headers,
      payload: {
        bundle: {
          format: 'magic-creater-bundle',
          bundleVersion: 1,
          document,
          assets: [{ id: a.id, name: a.name, data: a.data }],
          source: { versionId: 'prior', title: '原作品', authorName: '同学', verified: true },
        },
      },
    });
    expect(project.statusCode).toBe(201);
    const p = project.json();
    expect(
      (
        await live.app.inject({
          method: 'PUT',
          url: '/api/projects/' + p.id,
          headers,
          payload: { document: p.document, revision: 1, allowRemix: true },
        })
      ).statusCode,
    ).toBe(200);
    const submitted = await live.app.inject({
      method: 'POST',
      url: '/api/projects/' + p.id + '/submit',
      headers,
      payload: { revision: 2 },
    });
    expect(submitted.statusCode).toBe(200);
    const v = submitted.json();
    await live.app.inject({
      method: 'PATCH',
      url: '/api/versions/' + v.id,
      headers,
      payload: { status: 'approved' },
    });
    await live.app.inject({
      method: 'POST',
      url: '/api/versions/' + v.id + '/feedback',
      headers,
      payload: { text: '这张图恢复后还在', location: { roomId: 'garden', x: 3, y: 8 } },
    });
    const remixed = await live.app.inject({
      method: 'POST',
      url: '/api/versions/' + v.id + '/remix',
      headers,
      payload: {},
    });
    expect(remixed.statusCode).toBe(201);
    const remix = remixed.json();
    await backupDatabase(source, copy);
    await live.app.inject({
      method: 'PATCH',
      url: '/api/versions/' + v.id,
      headers,
      payload: { status: 'withdrawn' },
    });
    restored = await createApp({ databasePath: copy, origins: [origin] });
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.db.pragma('foreign_key_check')).toEqual([]);
    const image = await restored.app.inject({ url: '/api/assets/' + a.id, headers });
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload).toEqual(Buffer.from(a.data, 'base64'));
    const result = (await restored.app.inject({ url: '/api/projects/' + p.id, headers })).json();
    expect(result.document.hero.skin).toBe('asset:' + a.id);
    expect(result.source).toMatchObject({ title: '原作品', verified: false });
    expect(result.allowRemix).toBe(true);
    const recoveredRemix = (
      await restored.app.inject({ url: '/api/projects/' + remix.id, headers })
    ).json();
    expect(recoveredRemix.source).toEqual(remix.source);
    expect(recoveredRemix.source.verified).toBe(true);
    const recoveredVersion = (
      await restored.app.inject({ url: '/api/versions/' + v.id, headers })
    ).json();
    expect(recoveredVersion.source).toEqual(result.source);
    expect(recoveredVersion.allowRemix).toBe(true);
    const recoveredFeedback = (
      await restored.app.inject({ url: '/api/projects/' + p.id + '/feedback', headers })
    ).json().feedback[0];
    expect(recoveredFeedback.location).toEqual({ roomId: 'garden', x: 3, y: 8 });
    expect(
      (await restored.app.inject({ url: '/api/versions/' + v.id, headers })).json().status,
    ).toBe('approved');
    expect(
      (await restored.app.inject({ url: '/api/projects/' + p.id + '/feedback', headers })).json()
        .feedback[0].text,
    ).toBe('这张图恢复后还在');
  } finally {
    await restored?.app.close();
    await live?.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
