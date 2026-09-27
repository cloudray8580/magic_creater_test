import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export type Db = Database.Database;
const migrations = [
  `
 CREATE TABLE classrooms(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY,classroom_id TEXT NOT NULL REFERENCES classrooms(id),username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student')),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE INDEX session_user ON sessions(user_id);
 CREATE TABLE projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),classroom_id TEXT NOT NULL REFERENCES classrooms(id),document TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
 CREATE INDEX project_owner ON projects(owner_id,updated_at);
`,
  `
 CREATE TABLE versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),source_revision INTEGER NOT NULL,document TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','returned','withdrawn')),review_note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,UNIQUE(project_id,source_revision));
 CREATE UNIQUE INDEX one_approved_version ON versions(project_id) WHERE status='approved';
 CREATE TABLE feedback(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES versions(id),author_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),created_at INTEGER NOT NULL);
 CREATE INDEX feedback_version ON feedback(version_id,created_at);
`,
  `
 CREATE TABLE assets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,digest TEXT NOT NULL,data BLOB NOT NULL,created_at INTEGER NOT NULL,UNIQUE(owner_id,digest));
 ALTER TABLE projects ADD COLUMN source TEXT;
 ALTER TABLE projects ADD COLUMN allow_remix INTEGER NOT NULL DEFAULT 0 CHECK(allow_remix IN (0,1));
 ALTER TABLE versions ADD COLUMN source TEXT;
 ALTER TABLE versions ADD COLUMN allow_remix INTEGER NOT NULL DEFAULT 0 CHECK(allow_remix IN (0,1));
 ALTER TABLE feedback ADD COLUMN location TEXT;
`,
];
export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version > migrations.length) throw new Error('数据库版本高于当前应用，请使用匹配版本');
    db.transaction(() => {
      for (let i = version; i < migrations.length; i++) {
        db.exec(migrations[i]);
        db.pragma('user_version = ' + (i + 1));
      }
    })();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
