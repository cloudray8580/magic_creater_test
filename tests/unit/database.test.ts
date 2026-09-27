import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/server/db.js';
import { bootstrap } from '../../src/server/admin.js';
describe('C05 database initialization', () => {
  it('migrates once, persists across reopen and refuses duplicate bootstrap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'magic-db-'));
    try {
      let db = openDatabase(join(dir, 'app.sqlite'));
      await bootstrap(db, {
        username: 'teacher',
        displayName: '老师',
        password: 'test-password-123',
        classroomName: '小组',
      });
      await expect(
        bootstrap(db, {
          username: 'teacher',
          displayName: '老师',
          password: 'test-password-123',
          classroomName: '小组',
        }),
      ).rejects.toThrow();
      expect(db.pragma('user_version', { simple: true })).toBe(3);
      db.close();
      db = openDatabase(join(dir, 'app.sqlite'));
      expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
