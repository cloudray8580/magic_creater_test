import { expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { bootstrap } from '../../src/server/admin.js';
import { createRun, perform, advance } from '../../src/shared/snowman/engine.js';
import { snowmanTemplate } from '../../src/shared/snowman/template.js';
it('validates replayed author solution against saved revision and material budget; supports frozen sharing and portable copies', async () => {
  const origin = 'http://127.0.0.1:4173',
    ctx = await createApp({ databasePath: ':memory:', origins: [origin], logger: false });
  try {
    await bootstrap(ctx.db, {
      username: 'teacher',
      password: 'test-password-123',
      displayName: '老师',
      classroomName: '雪地工坊',
    });
    const login = await ctx.app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { origin },
        payload: { username: 'teacher', password: 'test-password-123' },
      }),
      cookie = String(login.headers['set-cookie']).split(';')[0];
    const req = (method: 'POST' | 'GET' | 'PUT' | 'PATCH', url: string, payload?: unknown) =>
      ctx.app.inject({
        method,
        url,
        headers: { origin, cookie },
        ...(payload === undefined
          ? {}
          : {
              payload: JSON.stringify(payload),
              headers: { origin, cookie, 'content-type': 'application/json' },
            }),
      });
    const d = snowmanTemplate();
    const run = createRun(d);
    perform(run, { type: 'place', tool: 'repair', x: 10, y: 8 });
    perform(run, { type: 'place', tool: 'water', x: 14, y: 8 });
    perform(run, { type: 'place', tool: 'skis', x: 2, y: 8 });
    advance(run, 1200);
    expect(run.phase).toBe('won');
    const proof = run.actions,
      p = (await req('POST', '/api/projects', { document: d })).json();
    expect(p.document).toEqual(d);
    const url = '/api/projects/' + p.id + '/submit';
    expect((await req('POST', url, { revision: 1 })).statusCode).toBe(400);
    expect(
      (
        await req('POST', url, {
          revision: 1,
          solution: [{ x: 2, y: 8, tool: 'skis', mass: 1000 }],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await req('POST', url, {
          revision: 1,
          solution: proof,
        })
      ).statusCode,
    ).toBe(200);
    const v = (await req('POST', url, { revision: 1, solution: proof })).json();
    expect(v.status).toBe('pending');
    expect((await req('PATCH', '/api/versions/' + v.id, { status: 'approved' })).statusCode).toBe(
      200,
    );
    expect((await req('GET', '/api/shelf')).json().versions).toHaveLength(1);
    d.mass = 5;
    d.materials = { wood: 0, water: 0, signs: 0, snowballs: 0 };
    expect(
      (await req('PUT', '/api/projects/' + p.id, { revision: 1, document: d })).statusCode,
    ).toBe(200);
    expect((await req('POST', url, { revision: 1, solution: [] })).statusCode).toBe(409);
    expect((await req('POST', url, { revision: 2, solution: [] })).statusCode).toBe(400);
    expect(
      (await req('POST', url, { revision: 2, solution: [{ x: 10, y: 8, tool: 'repair' }] }))
        .statusCode,
    ).toBe(400);
    expect((await req('GET', '/api/versions/' + v.id)).json().document.mass).toBe(18);
  } finally {
    await ctx.app.close();
  }
});
