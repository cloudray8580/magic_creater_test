import Database from 'better-sqlite3';
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
      expect(db.pragma('user_version', { simple: true })).toBe(4);
      db.close();
      db = openDatabase(join(dir, 'app.sqlite'));
      expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('upgrades a real schema 3 fixture without changing old rows and preserves creation tombstones on reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'magic-schema3-')),
    path = join(dir, 'db.sqlite');
  const old = new Database(path);
  try {
    old.exec(`
 CREATE TABLE classrooms(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY,classroom_id TEXT NOT NULL REFERENCES classrooms(id),username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student')),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE INDEX session_user ON sessions(user_id);
 CREATE TABLE projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),classroom_id TEXT NOT NULL REFERENCES classrooms(id),document TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
 CREATE INDEX project_owner ON projects(owner_id,updated_at);


 CREATE TABLE versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),source_revision INTEGER NOT NULL,document TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','returned','withdrawn')),review_note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,UNIQUE(project_id,source_revision));
 CREATE UNIQUE INDEX one_approved_version ON versions(project_id) WHERE status='approved';
 CREATE TABLE feedback(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES versions(id),author_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),created_at INTEGER NOT NULL);
 CREATE INDEX feedback_version ON feedback(version_id,created_at);


 CREATE TABLE assets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,digest TEXT NOT NULL,data BLOB NOT NULL,created_at INTEGER NOT NULL,UNIQUE(owner_id,digest));
 ALTER TABLE projects ADD COLUMN source TEXT;
 ALTER TABLE projects ADD COLUMN allow_remix INTEGER NOT NULL DEFAULT 0 CHECK(allow_remix IN (0,1));
 ALTER TABLE versions ADD COLUMN source TEXT;
 ALTER TABLE versions ADD COLUMN allow_remix INTEGER NOT NULL DEFAULT 0 CHECK(allow_remix IN (0,1));
 ALTER TABLE feedback ADD COLUMN location TEXT;

 PRAGMA user_version=3;
 INSERT INTO classrooms VALUES('c','旧课堂');
 INSERT INTO users VALUES('u','c','student','同学','student','hash',1);
 INSERT INTO sessions VALUES('token','u',9999999999999);
 INSERT INTO projects VALUES('p','u','c','{}',2,1,'{"title":"source"}',1);
 INSERT INTO versions VALUES('v','p',2,'{}','approved','',1,'{"title":"source"}',1);
 INSERT INTO feedback VALUES('f','v','u','很喜欢',0,1,'{"x":1,"y":2}');
 INSERT INTO assets VALUES('a','u','image','digest',X'0102',1);
 `);
    const tables = [
      'classrooms',
      'users',
      'sessions',
      'projects',
      'versions',
      'feedback',
      'assets',
    ];
    const rows = tables.map((t) => old.prepare('SELECT * FROM ' + t).all());
    old.close();
    let db = openDatabase(path);
    expect(db.pragma('user_version', { simple: true })).toBe(4);
    expect(tables.map((t) => db.prepare('SELECT * FROM ' + t).all())).toEqual(rows);
    expect(db.prepare('SELECT * FROM project_creations').all()).toEqual([]);
    db.prepare('INSERT INTO project_creations VALUES(?,?,?)').run('u', 'live-key', 'p');
    db.prepare('INSERT INTO project_creations VALUES(?,?,?)').run('u', 'deleted-key', 'gone');
    db.close();
    db = openDatabase(path);
    expect(db.prepare('SELECT COUNT(*) n FROM project_creations').get()).toEqual({ n: 2 });
    expect(tables.map((t) => db.prepare('SELECT * FROM ' + t).all())).toEqual(rows);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  } finally {
    if (old.open) old.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
