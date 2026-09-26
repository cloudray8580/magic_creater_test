import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../src/server/app.js';
import { bootstrap } from '../../src/server/admin.js';
const dir = mkdtempSync(join(tmpdir(), 'magic-e2e-'));
const { app, db } = await createApp({
  databasePath: join(dir, 'app.sqlite'),
  origins: ['http://127.0.0.1:4273'],
  staticDir: resolve('dist/web'),
});
await bootstrap(db, {
  username: 'teacher',
  displayName: '老师',
  password: 'test-password-123',
  classroomName: '创作小组',
});
await app.listen({ host: '127.0.0.1', port: 4273 });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
