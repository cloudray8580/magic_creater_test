import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase, type Db } from './db.js';
import { hashPassword } from './auth.js';
import { username, password, text } from './input.js';
export interface BootstrapInput {
  username: string;
  displayName: string;
  password: string;
  classroomName: string;
}
export async function bootstrap(
  db: Db,
  input: BootstrapInput,
): Promise<{ userId: string; classroomId: string }> {
  const name = username(input.username),
    display = text(input.displayName, '显示名', 1, 30),
    secret = password(input.password),
    className = text(input.classroomName, '班级名称', 1, 60);
  if (db.prepare('SELECT id FROM users LIMIT 1').get())
    throw new Error('已初始化，不能重复创建初始老师');
  const hash = await hashPassword(secret),
    userId = randomUUID(),
    classroomId = randomUUID();
  db.transaction(() => {
    db.prepare('INSERT INTO classrooms(id,name) VALUES (?,?)').run(classroomId, className);
    db.prepare(
      'INSERT INTO users(id,classroom_id,username,display_name,role,password_hash) VALUES (?,?,?,?,?,?)',
    ).run(userId, classroomId, name, display, 'teacher', hash);
  })();
  return { userId, classroomId };
}
export async function runBootstrap(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!env.APP_DATABASE || !env.BOOTSTRAP_PASSWORD)
    throw new Error('需要APP_DATABASE和BOOTSTRAP_PASSWORD，凭据不得写入仓库');
  const db = openDatabase(resolve(env.APP_DATABASE));
  try {
    await bootstrap(db, {
      username: env.BOOTSTRAP_USERNAME ?? 'teacher',
      displayName: env.BOOTSTRAP_DISPLAY_NAME ?? '老师',
      password: env.BOOTSTRAP_PASSWORD,
      classroomName: env.BOOTSTRAP_CLASSROOM ?? '创作小组',
    });
  } finally {
    db.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBootstrap()
    .then(() => console.log('初始老师已创建'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
