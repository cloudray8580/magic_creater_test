import * as auth from '../../src/server/auth.js';
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

describe('C02 identity and isolation', () => {
  it('authenticates, rejects invalid sessions and clears logout', async () => {
    expect((await request('GET', '/api/health')).statusCode).toBe(200);
    expect((await request('GET', '/api/me')).statusCode).toBe(401);
    expect((await request('GET', '/api/me', 'mc_session=bad')).statusCode).toBe(401);
    expect((await request('GET', '/api/me', alice)).json().user.displayName).toBe('小禾');
    expect(
      (await request('POST', '/api/login', '', { username: 'alice', password: 'wrong-password' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await request('POST', '/api/login', '', { username: 'missing', password })).statusCode,
    ).toBe(401);
    const res = await request('POST', '/api/logout', alice, {});
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect((await request('GET', '/api/me', alice)).statusCode).toBe(401);
  });
  it('rejects missing/foreign origins and malformed bodies', async () => {
    expect(
      (
        await request(
          'POST',
          '/api/login',
          '',
          { username: 'alice', password },
          { origin: 'https://evil.test' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/login',
          payload: { username: 'alice', password },
        })
      ).statusCode,
    ).toBe(403);
    for (const payload of [
      null,
      [],
      {},
      { username: 'Bad Name', displayName: 'name', password },
      { username: 'short', displayName: '', password },
      { username: 'short', displayName: 'name', password: '123' },
    ])
      expect((await request('POST', '/api/members', teacher, payload)).statusCode).toBe(400);
  });
  it('enforces teacher membership management and revokes sessions on reset/disable', async () => {
    expect((await request('GET', '/api/members', alice)).statusCode).toBe(403);
    const members = (await request('GET', '/api/members', teacher)).json().members;
    const target = members.find((m: { username: string }) => m.username === 'alice');
    expect(JSON.stringify(members)).not.toContain('passwordHash');
    expect(
      (
        await request('POST', '/api/members', teacher, {
          username: 'alice',
          displayName: '重复',
          password,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('PATCH', '/api/members/' + target.id, teacher, {
          password: 'changed-password-123',
        })
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/me', alice)).statusCode).toBe(401);
    alice = await login('alice', 'changed-password-123');
    expect(
      (await request('PATCH', '/api/members/' + target.id, teacher, { active: false })).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/me', alice)).statusCode).toBe(401);
    expect(
      (
        await request('POST', '/api/login', '', {
          username: 'alice',
          password: 'changed-password-123',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await request('PATCH', '/api/members/' + target.id, teacher, { active: true })).statusCode,
    ).toBe(200);
    expect(
      (await request('PATCH', '/api/members/missing', teacher, { active: false })).statusCode,
    ).toBe(404);
  });
  it('expires sessions and throttles repeated bad logins', async () => {
    ctx.db.prepare('UPDATE sessions SET expires_at = 0').run();
    expect((await request('GET', '/api/me', alice)).statusCode).toBe(401);
    let last = 0;
    for (let i = 0; i < 14; i++)
      last = (await request('POST', '/api/login', '', { username: 'unknown', password }))
        .statusCode;
    expect(last).toBe(429);
  });
});

describe('C03 projects and revision conflicts', () => {
  it('creates incomplete drafts, isolates ownership and rejects invalid documents', async () => {
    const incomplete = template();
    incomplete.level.objects = [];
    expect(
      (await request('POST', '/api/projects', alice, { document: incomplete })).statusCode,
    ).toBe(201);
    const p = await createProject();
    expect(p.revision).toBe(1);
    expect((await request('GET', '/api/projects', bob)).json().projects).toHaveLength(0);
    expect((await request('GET', '/api/projects/' + p.id, bob)).statusCode).toBe(404);
    expect(
      (await request('PUT', '/api/projects/' + p.id, bob, { revision: 1, document: template() }))
        .statusCode,
    ).toBe(404);
    expect((await request('GET', '/api/projects/missing', alice)).statusCode).toBe(404);
    expect(
      (
        await request('POST', '/api/projects', alice, {
          document: { ...template(), ownerId: 'someone' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('saves atomically and preserves the server copy on stale revision', async () => {
    const p = await createProject(),
      doc = { ...template(), title: '第一次修改' };
    const saved = await request('PUT', '/api/projects/' + p.id, alice, {
      revision: 1,
      document: doc,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(2);
    expect(
      (
        await request('PUT', '/api/projects/' + p.id, alice, {
          revision: 1,
          document: { ...doc, title: '过期修改' },
        })
      ).statusCode,
    ).toBe(409);
    expect((await request('GET', '/api/projects/' + p.id, alice)).json().document.title).toBe(
      '第一次修改',
    );
    expect(
      (await request('PUT', '/api/projects/' + p.id, alice, { revision: '2', document: doc }))
        .statusCode,
    ).toBe(400);
  });
});

describe('C04 immutable sharing and feedback', () => {
  async function submit(p: { id: string; revision: number }, cookie = alice) {
    return request('POST', '/api/projects/' + p.id + '/submit', cookie, { revision: p.revision });
  }
  async function moderate(id: string, status: string, cookie = teacher) {
    return request('PATCH', '/api/versions/' + id, cookie, { status, reviewNote: '老师的建议' });
  }
  it('requires a complete saved revision and never rewrites a submitted document', async () => {
    const p = await createProject();
    expect((await submit({ ...p, revision: 2 })).statusCode).toBe(409);
    expect((await submit(p, bob)).statusCode).toBe(404);
    const v = (await submit(p)).json();
    expect(v.status).toBe('pending');
    expect((await submit(p)).json().id).toBe(v.id);
    await request('PUT', '/api/projects/' + p.id, alice, {
      revision: 1,
      document: { ...template(), title: '另一个标题' },
    });
    expect((await request('GET', '/api/versions/' + v.id, alice)).json().document.title).toBe(
      template().title,
    );
    expect(
      (await request('GET', '/api/projects/' + p.id + '/versions', alice)).json().versions,
    ).toHaveLength(1);
    const incomplete = template();
    incomplete.level.objects = [];
    const bad = (await request('POST', '/api/projects', alice, { document: incomplete })).json();
    expect((await submit(bad)).statusCode).toBe(400);
  });
  it('isolates pending/returned/withdrawn versions including direct reads and enforces transitions', async () => {
    const p = await createProject(),
      v = (await submit(p)).json();
    expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(404);
    expect((await request('GET', '/api/manage/versions', bob)).statusCode).toBe(403);
    expect((await moderate(v.id, 'approved', alice)).statusCode).toBe(403);
    expect((await moderate(v.id, 'withdrawn')).statusCode).toBe(409);
    expect((await moderate(v.id, 'approved')).statusCode).toBe(200);
    expect((await moderate(v.id, 'approved')).statusCode).toBe(200);
    expect((await request('GET', '/api/shelf', bob)).json().versions).toHaveLength(1);
    expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(200);
    expect((await moderate(v.id, 'withdrawn')).statusCode).toBe(200);
    expect((await request('GET', '/api/shelf', bob)).json().versions).toHaveLength(0);
    expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(404);
    expect((await request('GET', '/api/versions/' + v.id, alice)).statusCode).toBe(200);
    expect((await moderate(v.id, 'approved')).statusCode).toBe(409);
    expect((await moderate(v.id, 'invalid')).statusCode).toBe(400);
    expect((await moderate('missing', 'approved')).statusCode).toBe(404);
  });
  it('replaces only the displayed version and retains version-bound feedback', async () => {
    const p = await createProject(),
      v = (await submit(p)).json();
    await moderate(v.id, 'approved');
    expect(
      (await request('POST', '/api/versions/' + v.id + '/feedback', bob, { text: '' })).statusCode,
    ).toBe(400);
    const f = (
      await request('POST', '/api/versions/' + v.id + '/feedback', bob, {
        text: '我喜欢你设计的转角',
      })
    ).json();
    expect(f.versionId).toBe(v.id);
    expect((await request('GET', '/api/projects/' + p.id + '/feedback', bob)).statusCode).toBe(404);
    expect(
      (await request('PATCH', '/api/feedback/' + f.id, alice, { hidden: true })).statusCode,
    ).toBe(403);
    expect(
      (await request('GET', '/api/projects/' + p.id + '/feedback', alice)).json().feedback,
    ).toHaveLength(1);
    expect(
      (await request('PATCH', '/api/feedback/' + f.id, teacher, { hidden: true })).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', '/api/projects/' + p.id + '/feedback', alice)).json().feedback,
    ).toHaveLength(0);
    expect((await request('GET', '/api/manage/feedback', teacher)).json().feedback[0].hidden).toBe(
      true,
    );
    await request('PATCH', '/api/feedback/' + f.id, teacher, { hidden: false });
    const next = (
      await request('PUT', '/api/projects/' + p.id, alice, {
        revision: 1,
        document: { ...template(), title: '改进版' },
      })
    ).json();
    const v2 = (await submit(next)).json();
    await moderate(v2.id, 'approved');
    expect(
      (await request('GET', '/api/shelf', bob)).json().versions.map((v: { id: string }) => v.id),
    ).toEqual([v2.id]);
    expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(404);
    expect(
      (await request('POST', '/api/versions/' + v.id + '/feedback', bob, { text: '过期反馈' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await request('GET', '/api/projects/' + p.id + '/feedback', alice)).json().feedback[0]
        .versionId,
    ).toBe(v.id);
  });
  it('returns work for revision and prevents cross-classroom access', async () => {
    const p = await createProject(),
      v = (await submit(p)).json();
    await moderate(v.id, 'returned');
    expect(
      (await request('GET', '/api/projects/' + p.id + '/versions', alice)).json().versions[0]
        .reviewNote,
    ).toBe('老师的建议');
    expect((await moderate(v.id, 'approved')).statusCode).toBe(409);
    ctx.db.prepare('INSERT INTO classrooms VALUES (?,?)').run('outside', '其他班');
    ctx.db.prepare("UPDATE users SET classroom_id='outside' WHERE username='bob'").run();
    expect((await request('GET', '/api/versions/' + v.id, bob)).statusCode).toBe(404);
    ctx.db.prepare("UPDATE users SET role='teacher' WHERE username='bob'").run();
    expect((await moderate(v.id, 'returned', bob)).statusCode).toBe(404);
  });
});

describe('C02 concurrent account changes', () => {
  it('rejects an old password login completing after a password reset', async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const original = auth.verifyPassword;
    vi.spyOn(auth, 'verifyPassword').mockImplementationOnce(async (p, h) => {
      entered();
      await gate;
      return original(p, h);
    });
    const loginAttempt = request('POST', '/api/login', '', { username: 'alice', password });
    await started;
    const target = ctx.db.prepare("SELECT id FROM users WHERE username='alice'").get() as {
      id: string;
    };
    await request('PATCH', '/api/members/' + target.id, teacher, { password: 'new-password-456' });
    release();
    expect((await loginAttempt).statusCode).toBe(401);
  });
  it('does not re-enable a user when an earlier reset finishes after disable', async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const original = auth.hashPassword;
    vi.spyOn(auth, 'hashPassword').mockImplementationOnce(async (p) => {
      entered();
      await gate;
      return original(p);
    });
    const target = ctx.db.prepare("SELECT id FROM users WHERE username='alice'").get() as {
      id: string;
    };
    const reset = request('PATCH', '/api/members/' + target.id, teacher, {
      password: 'new-password-456',
    });
    await started;
    await request('PATCH', '/api/members/' + target.id, teacher, { active: false });
    release();
    expect((await reset).statusCode).toBe(200);
    expect(ctx.db.prepare('SELECT active FROM users WHERE id=?').get(target.id)).toEqual({
      active: 0,
    });
  });
});

describe('C31 new document API dispatch', () => {
  it('stores drafts, blocks incomplete submission and freezes reviewed new-game versions', async () => {
    for (const templateId of ['cloud-post', 'forest-letter'] as const) {
      const doc = adventureTemplate(templateId);
      const bad = await request('POST', '/api/projects', alice, {
        document: { ...doc, rulesVersion: 9 },
      });
      expect(bad.statusCode).toBe(400);
      const draft = structuredClone(doc);
      draft.start = null;
      const created = await request('POST', '/api/projects', alice, { document: draft });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      expect(
        (await request('POST', `/api/projects/${id}/submit`, alice, { revision: 1 })).statusCode,
      ).toBe(400);
      const saved = await request('PUT', `/api/projects/${id}`, alice, {
        revision: 1,
        document: doc,
      });
      expect(saved.statusCode).toBe(200);
      expect(
        (await request('PUT', `/api/projects/${id}`, bob, { revision: 2, document: doc }))
          .statusCode,
      ).toBe(404);
      const published = await request('POST', `/api/projects/${id}/submit`, alice, { revision: 2 });
      expect(published.statusCode).toBe(200);
      const versionId = published.json().id;
      expect(
        (await request('PATCH', `/api/versions/${versionId}`, teacher, { status: 'approved' }))
          .statusCode,
      ).toBe(200);
      await request('PUT', `/api/projects/${id}`, alice, {
        revision: 2,
        document: { ...doc, title: 'changed' },
      });
      expect((await request('GET', `/api/versions/${versionId}`, bob)).json().document).toEqual(
        doc,
      );
      expect(
        (
          await request('POST', `/api/versions/${versionId}/feedback`, bob, {
            text: '喜欢这个机关',
          })
        ).statusCode,
      ).toBe(201);
    }
  });
});

it('allows a classroom sharing one address to log in while retaining per-account and total limits', async () => {
  for (let i = 0; i < 12; i++) {
    ctx.db
      .prepare(
        "INSERT INTO users SELECT ?,classroom_id,?,display_name,role,password_hash,active FROM users WHERE username='alice'",
      )
      .run('burst-' + i, 'burst-' + i);
    expect(
      (await request('POST', '/api/login', '', { username: 'burst-' + i, password })).statusCode,
    ).toBe(200);
  }
  for (let i = 0; i < 10; i++)
    await request('POST', '/api/login', '', { username: 'alice', password: 'incorrect-password' });
  expect(
    (await request('POST', '/api/login', '', { username: 'alice', password })).statusCode,
  ).toBe(429);
  expect((await request('POST', '/api/login', '', { username: 'bob', password })).statusCode).toBe(
    200,
  );
  let last = 0;
  for (let i = 0; i < 125; i++)
    last = (await request('POST', '/api/login', '', { username: 'unknown-' + i, password }))
      .statusCode;
  expect(last).toBe(429);
});
