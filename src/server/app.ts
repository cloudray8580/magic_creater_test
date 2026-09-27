import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.js';
import {
  normalizeImage,
  storeImage,
  requireOwnedAssets,
  assetView,
  type AssetRow,
} from './assets.js';
import { BUNDLE_BYTES, parsePortable, remapAssets, documentAssets } from '../shared/portable.js';
import { hashPassword, verifyPassword, newSessionToken, tokenHash } from './auth.js';
import { HttpError, bodyObject, text, username, password, revision } from './input.js';
import { ValidationError } from '../shared/game.js';
import { DOCUMENT_BYTES, validateCreative as validateDocument } from '../shared/creative.js';

export interface AppOptions {
  databasePath: string;
  origins: string[];
  secureCookies?: boolean;
  logger?: boolean;
  staticDir?: string;
}
interface UserRow {
  id: string;
  classroom_id: string;
  username: string;
  display_name: string;
  role: 'teacher' | 'student';
  password_hash: string;
  active: number;
}
interface ProjectRow {
  id: string;
  owner_id: string;
  classroom_id: string;
  document: string;
  revision: number;
  updated_at: number;
  source: string | null;
  allow_remix: number;
}
function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    active: Boolean(u.active),
  };
}
function projectView(p: ProjectRow) {
  return {
    id: p.id,
    ownerId: p.owner_id,
    revision: p.revision,
    updatedAt: p.updated_at,
    document: JSON.parse(p.document),
    source: p.source ? JSON.parse(p.source) : null,
    allowRemix: Boolean(p.allow_remix),
  };
}
function param(req: FastifyRequest, key = 'id') {
  return (req.params as Record<string, string>)[key];
}

export async function createApp(options: AppOptions) {
  const db = openDatabase(options.databasePath);
  const app = Fastify({
    bodyLimit: DOCUMENT_BYTES + 1024,
    logger: options.logger
      ? {
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers.set-cookie',
            'req.body',
          ],
        }
      : false,
  });
  app.addHook('onClose', async () => {
    db.close();
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'same-origin');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      !options.origins.includes(req.headers.origin ?? '')
    )
      throw new HttpError(403, '请求来源不被允许');
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof HttpError
        ? error.statusCode
        : error instanceof ValidationError
          ? 400
          : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500) req.log.error({ err: error }, 'request failed');
    reply.code(status).send({
      message:
        status >= 500
          ? '服务暂时无法完成请求，请稍后再试'
          : error instanceof Error
            ? error.message
            : '请求失败',
    });
  });
  function currentUser(req: FastifyRequest): UserRow {
    const token = req.cookies.mc_session;
    if (!token) throw new HttpError(401, '请先登录');
    const user = db
      .prepare(
        'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1',
      )
      .get(tokenHash(token), Date.now()) as UserRow | undefined;
    if (!user) throw new HttpError(401, '登录已过期，请重新登录');
    return user;
  }
  function teacher(req: FastifyRequest) {
    const user = currentUser(req);
    if (user.role !== 'teacher') throw new HttpError(403, '此操作需要老师身份');
    return user;
  }
  function ownedProject(req: FastifyRequest): ProjectRow {
    const u = currentUser(req),
      p = db
        .prepare('SELECT * FROM projects WHERE id=? AND owner_id=? AND classroom_id=?')
        .get(param(req), u.id, u.classroom_id) as ProjectRow | undefined;
    if (!p) throw new HttpError(404, '作品不存在或不可访问');
    return p;
  }
  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    database: db.pragma('user_version', { simple: true }),
  }));
  const loginAccountLimit = app.createRateLimit({
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      req.ip + ':login:' + username(bodyObject(req.body, ['username', 'password']).username),
  });
  app.post(
    '/api/login',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = bodyObject(req.body, ['username', 'password']),
        name = username(body.username),
        secret = text(body.password, '密码', 1, 128);
      const limit = await loginAccountLimit(req);
      if (!limit.isAllowed && limit.isExceeded) {
        reply.header('Retry-After', limit.ttlInSeconds);
        throw new HttpError(429, '这个账号尝试过于频繁，请一分钟后再试');
      }
      const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(name) as
        UserRow | undefined;
      if (!u || !(await verifyPassword(secret, u.password_hash)))
        throw new HttpError(401, '账号或密码不正确');
      const token = newSessionToken(),
        expires = Date.now() + 86400000;
      db.transaction(() => {
        if (
          !db
            .prepare('SELECT id FROM users WHERE id=? AND active=1 AND password_hash=?')
            .get(u.id, u.password_hash)
        )
          throw new HttpError(401, '账号或密码已变化，请重新登录');
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), u.id, expires);
      })();
      reply.setCookie('mc_session', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: options.secureCookies ?? false,
        maxAge: 86400,
      });
      return { user: publicUser(u) };
    },
  );
  app.post('/api/logout', async (req, reply) => {
    if (req.cookies.mc_session)
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(req.cookies.mc_session));
    reply.clearCookie('mc_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secureCookies ?? false,
    });
    return { ok: true };
  });
  app.get('/api/me', async (req) => {
    const u = currentUser(req);
    return {
      user: publicUser(u),
      classroom: db.prepare('SELECT id,name FROM classrooms WHERE id=?').get(u.classroom_id),
    };
  });
  app.get('/api/members', async (req) => {
    const u = teacher(req);
    return {
      members: (
        db
          .prepare('SELECT * FROM users WHERE classroom_id=? ORDER BY role DESC,username')
          .all(u.classroom_id) as UserRow[]
      ).map(publicUser),
    };
  });
  app.post('/api/members', async (req, reply) => {
    const u = teacher(req),
      b = bodyObject(req.body, ['username', 'displayName', 'password']),
      name = username(b.username),
      display = text(b.displayName, '显示名', 1, 30),
      secret = password(b.password);
    if (db.prepare('SELECT id FROM users WHERE username=?').get(name))
      throw new HttpError(409, '这个账号已存在');
    const id = randomUUID(),
      hash = await hashPassword(secret);
    try {
      db.prepare(
        'INSERT INTO users(id,classroom_id,username,display_name,role,password_hash) VALUES (?,?,?,?,?,?)',
      ).run(id, u.classroom_id, name, display, 'student', hash);
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
        throw new HttpError(409, '这个账号已存在');
      throw error;
    }
    reply.code(201);
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow) };
  });
  app.patch('/api/members/:id', async (req) => {
    const u = teacher(req),
      b = bodyObject(req.body, ['password', 'active']);
    if (!Object.keys(b).length) throw new HttpError(400, '请选择需要更新的字段');
    const target = db
      .prepare("SELECT * FROM users WHERE id=? AND classroom_id=? AND role='student'")
      .get(param(req), u.classroom_id) as UserRow | undefined;
    if (!target) throw new HttpError(404, '学生不存在');
    if (b.active !== undefined && typeof b.active !== 'boolean')
      throw new HttpError(400, '启用状态无效');
    const hash = b.password !== undefined ? await hashPassword(password(b.password)) : undefined;
    db.transaction(() => {
      if (hash !== undefined)
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, target.id);
      if (b.active !== undefined)
        db.prepare('UPDATE users SET active=? WHERE id=?').run(Number(b.active), target.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
    })();
    return { ok: true };
  });
  app.post(
    '/api/assets',
    {
      bodyLimit: 3 * 1024 * 1024,
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => currentUser(req).id,
        },
      },
    },
    async (req, reply) => {
      currentUser(req);
      const b = bodyObject(req.body, ['name', 'data']),
        name = text(b.name, '素材名称', 1, 40);
      const data = await normalizeImage(b.data),
        u = currentUser(req);
      const asset = db.transaction(() => storeImage(db, u.id, name, data))();
      reply.code(201);
      return { ...assetView(asset), data: asset.data.toString('base64') };
    },
  );
  app.get('/api/assets', async (req) => {
    const u = currentUser(req);
    return {
      assets: db
        .prepare(
          'SELECT id,name,length(data) AS bytes,created_at AS createdAt FROM assets WHERE owner_id=? ORDER BY created_at DESC,id',
        )
        .all(u.id),
    };
  });
  app.get('/api/assets/:id', async (req, reply) => {
    const u = currentUser(req),
      id = param(req);
    const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(id) as AssetRow | undefined;
    if (!asset) throw new HttpError(404, '素材不存在或不可访问');
    if (asset.owner_id !== u.id) {
      const visible = db
        .prepare(
          "SELECT v.document FROM versions v JOIN projects p ON p.id=v.project_id WHERE p.classroom_id=? AND (v.status='approved' OR ?='teacher')",
        )
        .all(u.classroom_id, u.role) as { document: string }[];
      if (!visible.some((v) => documentAssets(JSON.parse(v.document)).includes(id)))
        throw new HttpError(404, '素材不存在或不可访问');
    }
    return reply.type('image/png').send(asset.data);
  });
  app.post(
    '/api/projects/import',
    {
      bodyLimit: BUNDLE_BYTES + 1024,
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => currentUser(req).id,
        },
      },
    },
    async (req, reply) => {
      currentUser(req);
      const b = bodyObject(req.body, ['bundle']),
        bundle = parsePortable(b.bundle);
      const images: { id: string; name: string; data: Buffer }[] = [];
      for (const a of bundle.assets) images.push({ ...a, data: await normalizeImage(a.data) });
      const u = currentUser(req),
        id = randomUUID();
      const project = db.transaction(() => {
        const ids = new Map(images.map((a) => [a.id, storeImage(db, u.id, a.name, a.data).id]));
        const document = remapAssets(bundle.document, ids);
        requireOwnedAssets(db, u.id, document);
        db.prepare(
          'INSERT INTO projects(id,owner_id,classroom_id,document,revision,updated_at,source) VALUES (?,?,?,?,1,?,?)',
        ).run(
          id,
          u.id,
          u.classroom_id,
          JSON.stringify(document),
          Date.now(),
          bundle.source ? JSON.stringify(bundle.source) : null,
        );
        return db.prepare('SELECT * FROM projects WHERE id=?').get(id) as ProjectRow;
      })();
      reply.code(201);
      return projectView(project);
    },
  );
  app.get('/api/projects', async (req) => {
    const u = currentUser(req);
    return {
      projects: (
        db
          .prepare(
            'SELECT * FROM projects WHERE owner_id=? AND classroom_id=? ORDER BY updated_at DESC,id',
          )
          .all(u.id, u.classroom_id) as ProjectRow[]
      ).map(projectView),
    };
  });
  app.post('/api/projects', async (req, reply) => {
    const u = currentUser(req),
      b = bodyObject(req.body, ['document']),
      document = validateDocument(b.document),
      id = randomUUID();
    requireOwnedAssets(db, u.id, document);
    db.prepare(
      'INSERT INTO projects(id,owner_id,classroom_id,document,revision,updated_at) VALUES (?,?,?,?,1,?)',
    ).run(id, u.id, u.classroom_id, JSON.stringify(document), Date.now());
    reply.code(201);
    return projectView(db.prepare('SELECT * FROM projects WHERE id=?').get(id) as ProjectRow);
  });
  app.get('/api/projects/:id', async (req) => projectView(ownedProject(req)));
  app.put('/api/projects/:id', async (req) => {
    const p = ownedProject(req),
      b = bodyObject(req.body, ['document', 'revision', 'allowRemix']),
      expected = revision(b.revision),
      document = validateDocument(b.document);
    requireOwnedAssets(db, p.owner_id, document);
    if (b.allowRemix !== undefined && typeof b.allowRemix !== 'boolean')
      throw new HttpError(400, '改编设置无效');
    const allowRemix = b.allowRemix === undefined ? p.allow_remix : Number(b.allowRemix);
    const changes = db
      .prepare(
        'UPDATE projects SET document=?,allow_remix=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
      )
      .run(JSON.stringify(document), allowRemix, Date.now(), p.id, expected).changes;
    if (changes !== 1)
      throw new HttpError(
        409,
        '其他页面已保存了新版本；你的本地草稿仍然保留，请重新加载或另存副本',
      );
    return projectView(db.prepare('SELECT * FROM projects WHERE id=?').get(p.id) as ProjectRow);
  });

  app.post('/api/projects/:id/copy', async (req, reply) => {
    const p = ownedProject(req),
      b = bodyObject(req.body, ['document']);
    const document = validateDocument(
      b.document === undefined ? JSON.parse(p.document) : b.document,
    );
    requireOwnedAssets(db, p.owner_id, document);
    document.title = (document.title + ' 副本').slice(0, 60);
    validateDocument(document);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO projects(id,owner_id,classroom_id,document,updated_at,source) VALUES (?,?,?,?,?,?)',
    ).run(id, p.owner_id, p.classroom_id, JSON.stringify(document), Date.now(), p.source);
    reply.code(201);
    return projectView(db.prepare('SELECT * FROM projects WHERE id=?').get(id) as ProjectRow);
  });

  interface VersionRow {
    id: string;
    project_id: string;
    source_revision: number;
    document: string;
    status: string;
    review_note: string;
    created_at: number;
    owner_id: string;
    classroom_id: string;
    author_name: string;
    source: string | null;
    allow_remix: number;
  }
  const versionSelect =
    'SELECT v.*,p.owner_id,p.classroom_id,u.display_name AS author_name FROM versions v JOIN projects p ON p.id=v.project_id JOIN users u ON u.id=p.owner_id';
  function versionView(v: VersionRow) {
    return {
      id: v.id,
      projectId: v.project_id,
      sourceRevision: v.source_revision,
      document: JSON.parse(v.document),
      status: v.status,
      reviewNote: v.review_note,
      createdAt: v.created_at,
      authorName: v.author_name,
      source: v.source ? JSON.parse(v.source) : null,
      allowRemix: Boolean(v.allow_remix),
    };
  }
  function versionRow(id: string, u: UserRow, approvedOnly = false) {
    const v = db
      .prepare(versionSelect + ' WHERE v.id=? AND p.classroom_id=?')
      .get(id, u.classroom_id) as VersionRow | undefined;
    if (
      !v ||
      (approvedOnly
        ? v.status !== 'approved'
        : v.status !== 'approved' && u.role !== 'teacher' && v.owner_id !== u.id)
    )
      throw new HttpError(404, '版本不存在或不可访问');
    return v;
  }
  app.post('/api/projects/:id/submit', async (req) => {
    const p = ownedProject(req),
      b = bodyObject(req.body, ['revision']);
    if (revision(b.revision) !== p.revision)
      throw new HttpError(409, '作品已更新，请保存当前草稿后再提交');
    const document = validateDocument(JSON.parse(p.document), true);
    requireOwnedAssets(db, p.owner_id, document);
    const previous = db
      .prepare('SELECT id FROM versions WHERE project_id=? AND source_revision=?')
      .get(p.id, p.revision) as { id: string } | undefined;
    const id = previous?.id ?? randomUUID();
    if (!previous)
      db.prepare(
        "INSERT INTO versions(id,project_id,source_revision,document,status,created_at,source,allow_remix) VALUES (?,?,?,?,'pending',?,?,?)",
      ).run(id, p.id, p.revision, p.document, Date.now(), p.source, p.allow_remix);
    return versionView(versionRow(id, currentUser(req)));
  });
  app.post('/api/versions/:id/remix', async (req, reply) => {
    const u = currentUser(req),
      v = versionRow(param(req), u, true);
    bodyObject(req.body, []);
    if (!v.allow_remix) throw new HttpError(403, '创作者没有允许改编这个版本');
    const original = validateDocument(JSON.parse(v.document)),
      id = randomUUID();
    const project = db.transaction(() => {
      const ids = new Map<string, string>();
      for (const assetId of documentAssets(original)) {
        const asset = db
          .prepare('SELECT * FROM assets WHERE id=? AND owner_id=?')
          .get(assetId, v.owner_id) as AssetRow | undefined;
        if (!asset) throw new HttpError(400, '原作素材暂时无法复制');
        ids.set(assetId, storeImage(db, u.id, asset.name, asset.data).id);
      }
      const document = remapAssets(original, ids);
      document.title = (document.title + ' 改编').slice(0, 60);
      validateDocument(document);
      const source = {
        versionId: v.id,
        title: original.title,
        authorName: v.author_name,
        verified: true,
      };
      db.prepare(
        'INSERT INTO projects(id,owner_id,classroom_id,document,updated_at,source) VALUES (?,?,?,?,?,?)',
      ).run(id, u.id, u.classroom_id, JSON.stringify(document), Date.now(), JSON.stringify(source));
      return db.prepare('SELECT * FROM projects WHERE id=?').get(id) as ProjectRow;
    })();
    reply.code(201);
    return projectView(project);
  });
  app.get('/api/projects/:id/versions', async (req) => {
    const p = ownedProject(req);
    return {
      versions: (
        db
          .prepare(versionSelect + ' WHERE p.id=? ORDER BY v.created_at DESC')
          .all(p.id) as VersionRow[]
      ).map(versionView),
    };
  });
  app.get('/api/shelf', async (req) => {
    const u = currentUser(req);
    return {
      versions: (
        db
          .prepare(
            versionSelect +
              " WHERE p.classroom_id=? AND v.status='approved' ORDER BY v.created_at DESC",
          )
          .all(u.classroom_id) as VersionRow[]
      ).map(versionView),
    };
  });
  app.get('/api/versions/:id', async (req) =>
    versionView(versionRow(param(req), currentUser(req))),
  );
  app.get('/api/manage/versions', async (req) => {
    const u = teacher(req);
    return {
      versions: (
        db
          .prepare(versionSelect + ' WHERE p.classroom_id=? ORDER BY v.created_at DESC')
          .all(u.classroom_id) as VersionRow[]
      ).map(versionView),
    };
  });
  app.patch('/api/versions/:id', async (req) => {
    const u = teacher(req),
      v = versionRow(param(req), u),
      b = bodyObject(req.body, ['status', 'reviewNote']);
    if (!['approved', 'returned', 'withdrawn'].includes(String(b.status)))
      throw new HttpError(400, '审核状态无效');
    const status = String(b.status),
      note = b.reviewNote === undefined ? '' : text(b.reviewNote, '审核建议', 0, 1000);
    if (v.status === status) return versionView(v);
    if (!(
      (v.status === 'pending' && ['approved', 'returned'].includes(status)) ||
      (v.status === 'approved' && status === 'withdrawn')
    ))
      throw new HttpError(409, '当前版本不能执行此操作');
    db.transaction(() => {
      if (status === 'approved')
        db.prepare(
          "UPDATE versions SET status='withdrawn' WHERE project_id=? AND status='approved'",
        ).run(v.project_id);
      db.prepare('UPDATE versions SET status=?,review_note=? WHERE id=?').run(status, note, v.id);
    })();
    return versionView(versionRow(v.id, u));
  });
  interface FeedbackRow {
    id: string;
    version_id: string;
    author_id: string;
    text: string;
    hidden: number;
    created_at: number;
    author_name: string;
    title: string;
    location: string | null;
  }
  const feedbackSelect =
    'SELECT f.*,u.display_name AS author_name,v.document AS title FROM feedback f JOIN versions v ON v.id=f.version_id JOIN projects p ON p.id=v.project_id JOIN users u ON u.id=f.author_id';
  function feedbackView(f: FeedbackRow) {
    return {
      id: f.id,
      versionId: f.version_id,
      text: f.text,
      hidden: Boolean(f.hidden),
      createdAt: f.created_at,
      authorName: f.author_name,
      title: JSON.parse(f.title).title,
      location: f.location ? JSON.parse(f.location) : null,
    };
  }
  app.post(
    '/api/versions/:id/feedback',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => currentUser(req).id,
        },
      },
    },
    async (req, reply) => {
      const u = currentUser(req),
        v = versionRow(param(req), u, true),
        b = bodyObject(req.body, ['text', 'location']),
        message = text(b.text, '反馈', 1, 1000),
        id = randomUUID();
      let location = null;
      if (b.location !== undefined && b.location !== null) {
        const value = bodyObject(b.location, ['roomId', 'x', 'y']);
        const document = validateDocument(JSON.parse(v.document));
        const room =
          document.schemaVersion === 2
            ? document.rooms.find((r) => r.id === value.roomId)
            : undefined;
        if (
          !room ||
          !Number.isSafeInteger(value.x) ||
          !Number.isSafeInteger(value.y) ||
          (value.x as number) < 0 ||
          (value.y as number) < 0 ||
          (value.x as number) >= room.width ||
          (value.y as number) >= room.height
        )
          throw new HttpError(400, '反馈位置不在这个版本的房间范围内');
        location = JSON.stringify({ roomId: room.id, x: value.x, y: value.y });
      }
      db.prepare(
        'INSERT INTO feedback(id,version_id,author_id,text,created_at,location) VALUES (?,?,?,?,?,?)',
      ).run(id, v.id, u.id, message, Date.now(), location);
      reply.code(201);
      return feedbackView(db.prepare(feedbackSelect + ' WHERE f.id=?').get(id) as FeedbackRow);
    },
  );
  app.get('/api/projects/:id/feedback', async (req) => {
    const p = ownedProject(req);
    return {
      feedback: (
        db
          .prepare(feedbackSelect + ' WHERE p.id=? AND f.hidden=0 ORDER BY f.created_at DESC')
          .all(p.id) as FeedbackRow[]
      ).map(feedbackView),
    };
  });
  app.get('/api/manage/feedback', async (req) => {
    const u = teacher(req);
    return {
      feedback: (
        db
          .prepare(feedbackSelect + ' WHERE p.classroom_id=? ORDER BY f.created_at DESC')
          .all(u.classroom_id) as FeedbackRow[]
      ).map(feedbackView),
    };
  });
  app.patch('/api/feedback/:id', async (req) => {
    const u = teacher(req),
      b = bodyObject(req.body, ['hidden']);
    if (typeof b.hidden !== 'boolean') throw new HttpError(400, '隐藏状态无效');
    const f = db
      .prepare(feedbackSelect + ' WHERE f.id=? AND p.classroom_id=?')
      .get(param(req), u.classroom_id) as FeedbackRow | undefined;
    if (!f) throw new HttpError(404, '反馈不存在');
    db.prepare('UPDATE feedback SET hidden=? WHERE id=?').run(Number(b.hidden), f.id);
    return { ok: true };
  });

  if (options.staticDir)
    await app.register(staticFiles, {
      root: options.staticDir,
      dotfiles: 'deny',
      index: ['index.html'],
    });
  await app.ready();
  return { app, db };
}
