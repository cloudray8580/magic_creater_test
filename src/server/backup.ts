import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
export async function backupDatabase(source: string, destination: string) {
  if (resolve(source) === resolve(destination) || existsSync(destination))
    throw new Error('备份目的地必须是新的独立文件');
  if (!existsSync(source)) throw new Error('源数据库不存在');
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
    chmodSync(destination, 0o600);
  } finally {
    db.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.env.APP_DATABASE,
    destination = process.argv[2];
  if (!source || !destination) {
    console.error('需要 APP_DATABASE 和备份输出路径');
    process.exitCode = 1;
  } else
    backupDatabase(source, destination)
      .then(() => console.log('备份完成'))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
