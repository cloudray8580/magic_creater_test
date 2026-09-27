import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { backupDatabase } from '../dist/server/backup.js';
import { openDatabase } from '../dist/server/db.js';
import { adventureTemplate } from '../dist/shared/adventure/templates.js';
const [previous, source] = process.argv.slice(2);
assert(previous && source, 'Usage: node scripts/verify-upgrade.mjs OLD_RELEASE SOURCE_DATABASE');
const temp = mkdtempSync(join(tmpdir(), 'magic-upgrade-rehearsal-'));
const original = join(temp, 'original.sqlite'),
  candidate = join(temp, 'candidate.sqlite'),
  backup = join(temp, 'with-assets.sqlite');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tables = ['classrooms', 'users', 'projects', 'versions', 'feedback', 'sessions'];
let db;
try {
  // Read only live source through the SQLite backup API. Every mutation below uses temporary copies.
  await backupDatabase(source, original);
  copyFileSync(original, candidate);
  db = new Database(original, { readonly: true });
  const schema = db.pragma('user_version', { simple: true });
  const before = Object.fromEntries(
    tables.map((table) => [
      table,
      {
        columns: db.pragma('table_info(' + table + ')').map((c) => c.name),
        digest: hash(db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      },
    ]),
  );
  db.close();
  db = openDatabase(candidate);
  assert.equal(db.pragma('user_version', { simple: true }), 3);
  for (const [table, data] of Object.entries(before))
    assert.equal(
      hash(
        db.prepare('SELECT ' + data.columns.join(',') + ' FROM ' + table + ' ORDER BY rowid').all(),
      ),
      data.digest,
      table + ' unchanged',
    );
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  // A temporary populated V2 fixture proves that binary art, source and feedback coordinates survive backup.
  const owner = db.prepare('SELECT id,classroom_id FROM users LIMIT 1').get();
  assert(owner);
  const art = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3yQAAAAASUVORK5CYII=',
    'base64',
  );
  const doc = adventureTemplate('secret-home');
  doc.hero.skin = 'asset:restore-art';
  const credit = JSON.stringify({
      versionId: 'fixture-origin',
      title: '临时恢复测试',
      authorName: '测试',
      verified: false,
    }),
    location = JSON.stringify({ roomId: 'garden', x: 2, y: 7 });
  db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?)').run(
    'restore-art',
    owner.id,
    '临时图片',
    hash(art),
    art,
    1,
  );
  db.prepare(
    'INSERT INTO projects(id,owner_id,classroom_id,document,source,allow_remix,updated_at) VALUES(?,?,?,?,?,1,1)',
  ).run('restore-project', owner.id, owner.classroom_id, JSON.stringify(doc), credit);
  db.prepare(
    "INSERT INTO versions(id,project_id,source_revision,document,status,created_at,source,allow_remix) VALUES(?,?,1,?,'approved',1,?,1)",
  ).run('restore-version', 'restore-project', JSON.stringify(doc), credit);
  db.prepare(
    'INSERT INTO feedback(id,version_id,author_id,text,created_at,location) VALUES(?,?,?,?,1,?)',
  ).run('restore-feedback', 'restore-version', owner.id, '临时位置测试', location);
  db.close();
  await backupDatabase(candidate, backup);
  db = openDatabase(backup);
  assert.deepEqual(db.prepare('SELECT data FROM assets WHERE id=?').get('restore-art').data, art);
  assert.deepEqual(
    db.prepare('SELECT source,allow_remix FROM versions WHERE id=?').get('restore-version'),
    { source: credit, allow_remix: 1 },
  );
  assert.equal(
    db.prepare('SELECT location FROM feedback WHERE id=?').get('restore-feedback').location,
    location,
  );
  assert.equal(
    db.prepare('SELECT document FROM projects WHERE id=?').get('restore-project').document,
    JSON.stringify(doc),
  );
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
  const old = await import(pathToFileURL(resolve(previous, 'dist/server/db.js')).href);
  if (schema < 3) assert.throws(() => old.openDatabase(candidate), /版本/);
  // Match operational rollback: close all handles, discard WAL only for the stopped copy, restore original DB with old code.
  for (const suffix of ['-wal', '-shm']) rmSync(candidate + suffix, { force: true });
  copyFileSync(original, candidate);
  db = old.openDatabase(candidate);
  assert.equal(db.pragma('user_version', { simple: true }), schema);
  for (const [table, data] of Object.entries(before))
    assert.equal(hash(db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()), data.digest);
  db.close();
  db = undefined;
  console.log(
    JSON.stringify({
      sourceSchema: schema,
      targetSchema: 3,
      migration: 'passed',
      existingData: 'unchanged',
      assetSourceLocationRestore: 'passed',
      pairedRollback: 'passed',
      liveSource: 'read-only',
    }),
  );
} finally {
  if (db?.open) db.close();
  rmSync(temp, { recursive: true, force: true });
}
