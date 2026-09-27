import { useEffect, useState, useRef, type FormEvent } from 'react';
import {
  api,
  ApiError,
  setExpectedUser,
  type User,
  type Project,
  type ProjectSummary,
  type VersionSummary,
  type Version,
  type Feedback,
} from './api.js';
import {
  readDraft,
  writeDraft,
  holdDraft,
  listLocalDrafts,
  removeDraft,
  migrateDraft,
  projectLockId,
} from './drafts.js';
import {
  template,
  createHistory,
  changeHistory,
  undoHistory,
  redoHistory,
  editTitle,
  editCell,
  type History,
  type Tool,
} from '../shared/game.js';
import { labels, symbols } from './Play.js';
import { DocumentPlay } from './DocumentPlay.js';
import { AdventureEditor } from './AdventureEditor.js';
import {
  validateCreative as validateDocument,
  type CreativeDocument as GameDocument,
} from '../shared/creative.js';
import { SourceCredit } from './SourceCredit.js';
import { FeedbackMap } from './FeedbackMap.js';
import { exportPortable } from './assets.js';
import { BUNDLE_BYTES, parsePortable } from '../shared/portable.js';
import { AdventurePlay } from './AdventurePlay.js';
import { DeleteProjectDialog } from './DeleteProjectDialog.js';
import { TemplateGallery } from './TemplateGallery.js';
import { adventureTemplate, TEMPLATE_IDS, TEMPLATE_INFO } from '../shared/adventure/templates.js';
import type { AdventureDocument, Location } from '../shared/adventure/document.js';
type View = 'samples' | 'mine' | 'editor' | 'shelf' | 'play' | 'manage';
const statusLabels: Record<string, string> = {
  pending: '等待老师确认',
  approved: '展示中',
  returned: '请再修改一下',
  withdrawn: '已撤回',
};
function fields(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
}
function download(doc: unknown, filename = 'creative-world.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary>();
  const actionPending = useRef(false);
  const currentLocation = useRef<Location | null>(null);
  const [feedbackLocation, setFeedbackLocation] = useState<Location>();
  const [locatedFeedback, setLocatedFeedback] = useState<{
    document: GameDocument;
    feedback: Feedback;
  }>();
  const [sample, setSample] = useState<AdventureDocument>(() => adventureTemplate());
  const [assetBusy, setAssetBusy] = useState(false);
  const [previewFrom, setPreviewFrom] = useState<Location>();
  const [invalidDraft, setInvalidDraft] = useState<{ raw: unknown }>();
  const editorLock = useRef<{ key: string; release: () => void } | null>(null);
  function releaseEditor() {
    editorLock.current?.release();
    editorLock.current = null;
  }
  useEffect(() => () => releaseEditor(), []);
  const [user, setUser] = useState<User>(),
    [classroom, setClassroom] = useState(''),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>('mine'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [project, setProject] = useState<Project>(),
    [history, setHistory] = useState<History<GameDocument>>(),
    [tool, setTool] = useState<Tool>('wall'),
    [dirty, setDirty] = useState(false),
    [draftState, setDraftState] = useState(''),
    [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]),
    [shelf, setShelf] = useState<VersionSummary[]>([]),
    [playing, setPlaying] = useState<Version>(),
    [members, setMembers] = useState<User[]>([]),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    currentLocation.current = null;
    setFeedbackLocation(undefined);
  }, [playing?.id]);
  async function showFeedbackLocation(feedback: Feedback) {
    const version = await api<Version>('/versions/' + feedback.versionId);
    setLocatedFeedback({ document: version.document, feedback });
  }
  async function copyProject(p: ProjectSummary, document?: GameDocument) {
    if (p.local || p.deleted) {
      const doc = validateDocument({
        ...(document ?? p.document),
        title: ((document ?? p.document).title + ' 副本').slice(0, 60),
      });
      await openProject(
        await api<Project>('/projects', 'POST', {
          document: doc,
          creationKey: crypto.randomUUID(),
        }),
      );
      return;
    }
    await openProject(
      await api<Project>('/projects/' + p.id + '/copy', 'POST', document ? { document } : {}),
    );
  }
  async function refreshMine(owner = user?.id) {
    const remote = (await api<{ projects: ProjectSummary[] }>('/projects?summary=1')).projects;
    let local: Project[] = [];
    if (owner)
      try {
        local = (await listLocalDrafts(owner, true))
          .filter(({ id }) => !remote.some((p) => p.id === id))
          .map(({ id, draft }) => {
            let document: GameDocument;
            try {
              document = validateDocument(draft?.document);
            } catch {
              document = { ...template(), title: '未恢复的本地草稿' };
            }
            return {
              id,
              ownerId: owner,
              document,
              revision: draft?.revision ?? 1,
              allowRemix: draft?.allowRemix,
              creationKey: draft?.creationKey,
              deleted: !id.startsWith('local:'),
              updatedAt: draft?.updatedAt ?? 0,
              local: id.startsWith('local:'),
              saveAttempted: Boolean(draft?.saving),
            };
          });
      } catch {
        setMessage('本地草稿列表暂时无法读取；服务器作品已加载。');
      }
    setProjects([...local, ...remote]);
  }
  async function refreshHistory(id: string) {
    if (id.startsWith('local:')) {
      setVersions([]);
      setFeedback([]);
      return;
    }
    const [v, f] = await Promise.all([
      api<{ versions: VersionSummary[] }>('/projects/' + id + '/versions?summary=1'),
      api<{ feedback: Feedback[] }>('/projects/' + id + '/feedback'),
    ]);
    setVersions(v.versions);
    setFeedback(f.feedback);
  }
  async function refreshManage() {
    const [m, v, f] = await Promise.all([
      api<{ members: User[] }>('/members'),
      api<{ versions: VersionSummary[] }>('/manage/versions?summary=1'),
      api<{ feedback: Feedback[] }>('/manage/feedback'),
    ]);
    setMembers(m.members);
    setVersions(v.versions);
    setFeedback(f.feedback);
  }
  function clearAccountState() {
    setExpectedUser(undefined);
    releaseEditor();
    setAssetBusy(false);
    setLocatedFeedback(undefined);
    setFeedbackLocation(undefined);
    currentLocation.current = null;
    setUser(undefined);
    setClassroom('');
    setProject(undefined);
    setHistory(undefined);
    setProjects([]);
    setVersions([]);
    setFeedback([]);
    setShelf([]);
    setPlaying(undefined);
    setMembers([]);
    setReviewNotes({});
    setPreview(false);
    setDirty(false);
    setDraftState('');
    setInvalidDraft(undefined);
    setPreviewFrom(undefined);
    setView('mine');
    setDeleteTarget(undefined);
  }
  async function action(task: () => Promise<void>) {
    if (actionPending.current) return;
    if (assetBusy) {
      setError('图片正在处理，请完成后再保存、导出或切换页面；仍可继续编辑。');
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成');
      if (e instanceof ApiError && e.status === 401) {
        clearAccountState();
      }
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const me = await api<{ user: User; classroom: { name: string } }>('/me');
        setExpectedUser(me.user.id);
        setUser(me.user);
        setClassroom(me.classroom.name);
        await refreshMine(me.user.id);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401))
          setError(e instanceof Error ? e.message : '连接失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function openProject(p: Project) {
    const lockId = projectLockId(p),
      key = user!.id + ':' + lockId;
    if (editorLock.current?.key !== key) {
      releaseEditor();
      const release = await holdDraft(user!.id, projectLockId(p));
      editorLock.current = { key, release };
    }
    let local,
      storageFailed = false;
    setVersions([]);
    setFeedback([]);
    try {
      local = await readDraft(user!.id, p.id);
    } catch {
      storageFailed = true;
    }
    let restored;
    setInvalidDraft(undefined);
    let corrupt = false;
    if (local !== undefined) {
      try {
        validateDocument(local.document);
        if (
          !Number.isSafeInteger(local.revision) ||
          local.revision < 1 ||
          typeof local.dirty !== 'boolean'
        )
          throw new Error('草稿记录无效');
        restored = local.dirty ? local : undefined;
      } catch {
        setInvalidDraft({ raw: local });
        corrupt = true;
        setError('本地草稿格式无效，已保留原数据。请先导出未恢复草稿，再重新加载服务器版本。');
      }
    }
    validateDocument(p.document);
    setProject(
      restored
        ? { ...p, revision: restored.revision, allowRemix: restored.allowRemix ?? p.allowRemix }
        : p,
    );
    setHistory(createHistory(restored ? restored.document : p.document));
    setDirty(Boolean(restored));
    setPreview(false);
    setView('editor');
    setDraftState(
      corrupt
        ? '未恢复的草稿已保留，请先导出'
        : storageFailed
          ? '本地存储不可用，请及时导出'
          : restored
            ? '已恢复未保存的本地草稿'
            : p.local
              ? '未保存的新作品，修改后保留本地草稿'
              : '与服务器一致',
    );
    if (!p.deleted) await refreshHistory(p.id);
  }
  async function returnToEditor() {
    if (!project || !user) return;
    if (editorLock.current?.key === user.id + ':' + projectLockId(project) && history) {
      setView('editor');
      return;
    }
    await openProject(project);
  }
  async function create(document: GameDocument) {
    await openProject({
      id: 'local:' + crypto.randomUUID(),
      ownerId: user!.id,
      document: validateDocument(document),
      revision: 1,
      updatedAt: Date.now(),
      local: true,
    });
  }
  async function deleteProject(p: ProjectSummary) {
    const release = await holdDraft(user!.id, projectLockId(p));
    try {
      let target = p;
      if (p.local && p.saveAttempted) {
        const remote = (
          await api<{ projects: ProjectSummary[] }>('/projects?summary=1')
        ).projects.find((item) => item.creationKey === p.id.slice(6));
        if (remote) target = { ...remote, revision: p.revision };
      }
      if (!target.local) {
        try {
          await api('/projects/' + target.id, 'DELETE', { revision: target.revision });
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            /* Already absent. */
          } else if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
            let absent = false;
            try {
              await api('/projects/' + target.id);
            } catch (probe) {
              absent = probe instanceof ApiError && probe.status === 404;
            }
            if (!absent) throw error;
          } else throw error;
        }
      }
      if (target.local) await removeDraft(user!.id, target.id);
      const localAlias = target.creationKey ? 'local:' + target.creationKey : p.id;
      setProjects((old) =>
        old.filter((item) => item.id !== p.id && item.id !== target.id && item.id !== localAlias),
      );
      if (project?.id === p.id || project?.id === target.id) {
        setProject(undefined);
        setHistory(undefined);
        setInvalidDraft(undefined);
        setVersions([]);
        setFeedback([]);
        setDirty(false);
      }
      setMessage('作品已永久删除');
      try {
        if (!target.local) {
          await removeDraft(user!.id, target.id);
          if (localAlias !== target.id) await removeDraft(user!.id, localAlias);
        }
      } catch {
        setMessage('服务器删除已完成，但本地草稿清理失败。请重新进入列表并删除残留草稿。');
      }
    } finally {
      release();
    }
  }
  async function navigate(next: View) {
    setPreview(false);
    if (next === 'mine') await refreshMine();
    if (next === 'shelf')
      setShelf((await api<{ versions: VersionSummary[] }>('/shelf?summary=1')).versions);
    if (next === 'manage') await refreshManage();
    releaseEditor();
    setView(next);
  }
  function persist(next: History<GameDocument>) {
    if (busy) return;
    try {
      validateDocument(next.present);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (history && JSON.stringify(next.present) === JSON.stringify(history.present)) return;
    setHistory(next);
    setDirty(true);
    if (invalidDraft !== undefined) {
      setDraftState('损坏草稿仍保留，本次编辑请导出后再加载服务器');
      return;
    }
    setDraftState('正在保存本地草稿…');
    void writeDraft(user!.id, project!.id, {
      document: next.present,
      revision: project!.revision,
      allowRemix: project!.allowRemix,
      creationKey: project!.creationKey,
      dirty: true,
      ...(project!.local
        ? { local: true, saving: project!.saveAttempted, updatedAt: Date.now() }
        : {}),
    })
      .then(() => setDraftState('本地草稿已保存'))
      .catch(() => setDraftState('本地保存失败，请立即导出文件'));
  }
  async function save(allowRemix = project?.allowRemix ?? false): Promise<Project> {
    if (invalidDraft !== undefined) throw new Error('请先导出未恢复草稿，再重新加载服务器版本');
    if (project!.deleted) throw new Error('原作品已删除，请导出当前草稿或另存副本');
    const previous = project!,
      document = validateDocument(history!.present);
    if (previous.local) {
      setProject({ ...previous, saveAttempted: true, allowRemix });
      try {
        await writeDraft(user!.id, previous.id, {
          document,
          revision: 1,
          allowRemix,
          dirty: true,
          local: true,
          saving: true,
          updatedAt: Date.now(),
        });
      } catch {
        setDraftState('本地存储失败，正在尝试保存到服务器');
      }
    }
    let p: Project;
    try {
      p = previous.local
        ? await api<Project>('/projects', 'POST', {
            document,
            creationKey: previous.id.slice(6),
            allowRemix,
          })
        : await api<Project>('/projects/' + previous.id, 'PUT', {
            document,
            revision: previous.revision,
            allowRemix,
          });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
        setProject({ ...previous, deleted: true });
        setDraftState('原作品已永久删除，请导出或另存副本');
      }
      throw error;
    }
    const differs =
      JSON.stringify(p.document) !== JSON.stringify(document) ||
      Boolean(p.allowRemix) !== allowRemix;
    let localMaintained = true;
    const draft = {
      document,
      revision: p.revision,
      dirty: differs,
      allowRemix,
      creationKey: p.creationKey,
    };
    if (previous.local) {
      // The creation key keeps the same lock while its draft changes storage keys.
      try {
        await migrateDraft(user!.id, previous.id, p.id, draft);
      } catch (error) {
        setDraftState('服务器已创建作品，本地草稿仍保留，请先导出或处理冲突');
        throw error;
      }
    } else {
      try {
        await writeDraft(user!.id, p.id, draft);
      } catch {
        localMaintained = false;
        setDraftState('服务器已保存，本地草稿维护失败；请及时导出当前内容');
      }
    }
    setProject({ ...p, allowRemix });
    setDirty(differs);
    setMessage(
      differs ? '服务器已找到此前保存的版本；当前改稿仍保留，请再次保存上传。' : '已保存到服务器',
    );
    if (localMaintained) setDraftState(differs ? '本地改稿仍待保存' : '与服务器一致');
    return p;
  }
  async function loadServer() {
    if (project?.local) throw new Error('这份草稿尚未保存到服务器，请先导出或保存');
    if (!window.confirm('重新加载将替换当前本地草稿。需要保留时请先导出或另存副本。')) return;
    const p = await api<Project>('/projects/' + project!.id);
    await writeDraft(
      user!.id,
      p.id,
      { document: p.document, revision: p.revision, dirty: false },
      true,
    );
    await openProject(p);
    setMessage('已加载服务器版本');
  }
  const legacy = history?.present.schemaVersion === 1 ? history.present : undefined;
  if (loading)
    return (
      <main className="login">
        <p>正在打开工坊…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <div className="login-art">
          <span className="eyebrow">MAGIC CREATER / 创作工坊</span>
          <h1>
            让一个小想法，
            <br />
            长成你的世界。
          </h1>
          <p>
            设计一条小路，藏下一朵花。
            <br />
            让同伴走进你的想象。
          </p>
          <div className="garden-art" aria-hidden="true">
            ✿ <span>◉</span> ⚑
          </div>
        </div>
        <form
          className="panel login-form"
          onSubmit={(e) => {
            const b = fields(e);
            void action(async () => {
              setExpectedUser(undefined);
              await api('/login', 'POST', b);
              const me = await api<{ user: User; classroom: { name: string } }>('/me');
              setExpectedUser(me.user.id);
              setUser(me.user);
              setClassroom(me.classroom.name);
              await refreshMine(me.user.id);
            });
          }}
        >
          <h2>进入创作小组</h2>
          <p>使用老师提供的账号。</p>
          <label>
            账号
            <input name="username" autoComplete="username" required maxLength={32} />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <button className="primary" disabled={busy}>
            进入工坊
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            void action(() => navigate('mine'));
          }}
        >
          ✿ 创作工坊
        </a>
        <span>
          {classroom} / {user.displayName}
        </span>
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              await api('/logout', 'POST', {});
              clearAccountState();
            })
          }
        >
          退出登录
        </button>
        <a
          href="https://github.com/cloudray8580/magic_creater_test/releases/tag/m9"
          target="_blank"
          rel="noopener noreferrer"
        >
          本次更新 · 一分钟演示
        </a>
      </header>
      <nav>
        {(
          ['mine', 'shelf', 'samples', ...(user.role === 'teacher' ? ['manage'] : [])] as View[]
        ).map((v) => (
          <button
            key={v}
            disabled={busy}
            className={view === v ? 'active' : ''}
            onClick={() => void action(() => navigate(v))}
          >
            {v === 'mine'
              ? '我的作品'
              : v === 'shelf'
                ? '同伴作品'
                : v === 'samples'
                  ? '灵感样板'
                  : '老师管理'}
          </button>
        ))}
      </nav>
      <main>
        <div className="notice" role="status">
          {message}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {deleteTarget && (
          <DeleteProjectDialog
            project={deleteTarget}
            onCancel={() => setDeleteTarget(undefined)}
            onConfirm={() => {
              const p = deleteTarget;
              setDeleteTarget(undefined);
              void action(() => deleteProject(p));
            }}
          />
        )}
        <fieldset disabled={busy} className="workspace">
          {locatedFeedback?.feedback.location && (
            <section className="panel">
              <FeedbackMap
                document={locatedFeedback.document}
                location={locatedFeedback.feedback.location}
              />
              <p>{locatedFeedback.feedback.text}</p>
              <button onClick={() => setLocatedFeedback(undefined)}>关闭位置示意</button>
            </section>
          )}
          {view === 'samples' && (
            <>
              <div className="sample-intro">
                <span className="eyebrow">从一次小冒险开始</span>
                <h1>六个世界，等你发现</h1>
                <p>先玩一会儿，看看地形、机关和故事如何组合。</p>
              </div>
              <div className="sample-picker">
                {TEMPLATE_IDS.map((id) => (
                  <button
                    key={id}
                    className={sample.title === TEMPLATE_INFO[id].title ? 'active' : ''}
                    onClick={() => setSample(adventureTemplate(id))}
                  >
                    <span>{TEMPLATE_INFO[id].title}</span>
                    <small>{TEMPLATE_INFO[id].description}</small>
                  </button>
                ))}
              </div>
              <AdventurePlay key={sample.title} document={sample} />
            </>
          )}

          {view === 'mine' && (
            <>
              <section className="hero">
                <span className="eyebrow">每个想法都有生长的空间</span>
                <h1>今天，创造一点什么？</h1>
                <p>两种玩法，六个起点。先选喜欢的冒险，再把它改成你的世界。</p>
                <p>同一种玩法的模板共享全部创作工具，选择模板不会限制后续设计。</p>
                <a className="my-worlds-link" href="#my-worlds">
                  回到我的小世界 · {projects.length} 个作品 ↓
                </a>
              </section>
              <TemplateGallery
                onCreate={(id) => void action(() => create(adventureTemplate(id)))}
                onTry={(id) =>
                  void action(async () => {
                    setSample(adventureTemplate(id));
                    await navigate('samples');
                  })
                }
              />
              <details className="legacy-templates">
                <summary>经典格子玩法与作品导入</summary>
                <div className="row">
                  <button onClick={() => void action(() => create(template()))}>
                    从月光花园开始
                  </button>
                  <button onClick={() => void action(() => create(template('corner')))}>
                    从转角的礼物开始
                  </button>
                  <label className="file-button">
                    导入作品
                    <input
                      aria-label="导入作品"
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f)
                          void action(async () => {
                            if (f.size > BUNDLE_BYTES) throw new Error('作品包不能超过8MiB');
                            const input = JSON.parse(await f.text());
                            parsePortable(input);
                            await openProject(
                              await api<Project>('/projects/import', 'POST', { bundle: input }),
                            );
                          });
                      }}
                    />
                  </label>
                </div>
              </details>
              <div className="section-heading" id="my-worlds">
                <h2>我的小世界</h2>
                <span>{projects.length} 个作品</span>
              </div>
              <div className="cards">
                {projects.map((p) => (
                  <article className="card" key={p.id}>
                    <div className="cover">
                      ✿ <span>◉</span> ⚑
                    </div>
                    <h3>{p.document.title}</h3>
                    <SourceCredit source={p.source} />
                    <p>
                      {p.deleted
                        ? '原作品已删除 · 本地救援草稿，可导出或另存副本'
                        : p.local
                          ? '未同步草稿 · 仅保存在此浏览器'
                          : '服务器修订 ' + p.revision}
                    </p>
                    <div className="row">
                      <button
                        className="primary"
                        onClick={() =>
                          void action(async () =>
                            openProject(
                              p.local || p.deleted
                                ? { ...p, document: validateDocument(p.document) }
                                : await api<Project>('/projects/' + p.id),
                            ),
                          )
                        }
                      >
                        继续创作
                      </button>
                      <button
                        onClick={() =>
                          void action(async () => {
                            const full =
                              p.local || p.deleted ? p : await api<Project>('/projects/' + p.id);
                            download(
                              await exportPortable(
                                user!.id,
                                validateDocument(full.document),
                                full.source,
                              ),
                            );
                          })
                        }
                      >
                        导出
                      </button>
                      <button onClick={() => void action(() => copyProject(p))}>复制作品</button>
                      <button className="danger-link" onClick={() => setDeleteTarget(p)}>
                        删除作品
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!projects.length && <p className="empty">这里将放下你的第一个小世界。</p>}
            </>
          )}
          {view === 'editor' && project && history && (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    创作中的小世界 ·{' '}
                    {history.present.schemaVersion === 1
                      ? '经典花园'
                      : history.present.gameType === 'platformer'
                        ? '横版跳跃'
                        : '探索故事'}
                  </span>
                  <h1>{history.present.title || '未命名作品'}</h1>
                </div>
                <div className="row">
                  <button
                    onClick={() => {
                      if (preview) {
                        setPreview(false);
                        return;
                      }
                      try {
                        validateDocument(history.present, true);
                        setPreviewFrom(undefined);
                        setPreview(!preview);
                        setError('');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {preview ? '返回编辑' : '试玩关卡'}
                  </button>
                  <button
                    className="primary"
                    onClick={() =>
                      void action(async () => {
                        await save();
                      })
                    }
                  >
                    保存到服务器
                  </button>
                  <button
                    onClick={() =>
                      void action(async () => {
                        validateDocument(history.present, true);
                        const p = dirty || project.local ? await save() : project;
                        if (
                          JSON.stringify(p.document) !== JSON.stringify(history.present) ||
                          Boolean(p.allowRemix) !== Boolean(project.allowRemix)
                        )
                          throw new Error('服务器版本或改编设置与当前选择不同，请先再次保存后提交');
                        await api('/projects/' + p.id + '/submit', 'POST', {
                          revision: p.revision,
                        });
                        if (!p.deleted) await refreshHistory(p.id);
                        setMessage('已提交给老师，等待确认展示');
                      })
                    }
                  >
                    提交给老师
                  </button>
                </div>
              </div>
              <SourceCredit source={project.source} />
              <div className="sharing-setting panel">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={Boolean(project.allowRemix)}
                    onChange={(e) => {
                      const allow = e.target.checked;
                      void action(async () => {
                        const saved = await save(allow);
                        if (Boolean(saved.allowRemix) === allow)
                          setMessage('已保存改编设置，下次提交并展示后生效。');
                        else
                          setMessage(
                            '服务器保留了此前的改编设置；你的选择尚未上传，请再点保存到服务器。',
                          );
                      });
                    }}
                  />
                  保存并允许同伴改编
                </label>
                <p>
                  默认关闭。更改会联网保存当前草稿；已提交版本保持原设置。开启后同伴能复制展示版本继续创作，并标注你的来源。
                </p>
              </div>
              {history.present.schemaVersion === 2 ? (
                <>
                  <div hidden={preview} inert={busy} aria-busy={busy}>
                    <AdventureEditor
                      key={user!.id + ':' + projectLockId(project)}
                      userId={user!.id}
                      onAssetBusy={setAssetBusy}
                      document={history.present}
                      onChange={(doc) => persist(changeHistory(history, doc))}
                      onUndo={() => persist(undoHistory(history))}
                      onRedo={() => persist(redoHistory(history))}
                      canUndo={Boolean(history.past.length)}
                      canRedo={Boolean(history.future.length)}
                      onPreviewFrom={(from) => {
                        try {
                          validateDocument({ ...history.present, start: from }, true);
                          setPreviewFrom(from);
                          setPreview(true);
                          setError('');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    />
                  </div>
                  {preview && (
                    <DocumentPlay
                      userId={user!.id}
                      key={project.id}
                      document={history.present}
                      from={previewFrom}
                    />
                  )}
                </>
              ) : preview ? (
                <DocumentPlay userId={user!.id} key={project.id} document={history.present} />
              ) : (
                <div className="editor">
                  <aside className="panel">
                    <h3>放进你的世界</h3>
                    <p>选择素材，再点一个格子。</p>
                    {(Object.keys(labels) as Tool[]).map((t) => (
                      <button
                        className={'tool ' + (tool === t ? 'selected' : '')}
                        aria-label={labels[t]}
                        aria-pressed={tool === t}
                        key={t}
                        onClick={() => setTool(t)}
                      >
                        {t === 'erase' ? '⌫' : symbols[t]} {labels[t]}
                      </button>
                    ))}
                  </aside>
                  <div className="canvas panel">
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: 'repeat(' + legacy!.level.width + ',1fr)',
                      }}
                    >
                      {Array.from(
                        { length: legacy!.level.width * legacy!.level.height },
                        (_, i) => {
                          const x = i % legacy!.level.width,
                            y = Math.floor(i / legacy!.level.width),
                            o = legacy!.level.objects.find((o) => o.x === x && o.y === y);
                          return (
                            <button
                              type="button"
                              data-testid={'cell-' + x + ',' + y}
                              aria-label={'格 ' + x + ',' + y + ' ' + (o ? labels[o.type] : '空地')}
                              className={'cell ' + (o?.type ?? '')}
                              key={i}
                              onClick={() =>
                                persist(changeHistory(history, editCell(legacy!, x, y, tool)))
                              }
                            >
                              {o ? symbols[o.type] : ''}
                            </button>
                          );
                        },
                      )}
                    </div>
                    <div className="row">
                      <button
                        disabled={!history.past.length}
                        onClick={() => persist(undoHistory(history))}
                      >
                        撤销
                      </button>
                      <button
                        disabled={!history.future.length}
                        onClick={() => persist(redoHistory(history))}
                      >
                        重做
                      </button>
                    </div>
                  </div>
                  <aside className="panel">
                    <h3>关卡属性</h3>
                    <label>
                      作品名称
                      <input
                        value={history.present.title}
                        maxLength={60}
                        onChange={(e) =>
                          persist(changeHistory(history, editTitle(legacy!, e.target.value)))
                        }
                      />
                    </label>
                    <h4>通关目标</h4>
                    <p>收集全部花朵，再到达旗帜。起点与终点各一个。</p>
                    <p>不需要一次完成。试着让同伴发现一个惊喜。</p>
                  </aside>
                </div>
              )}
              <div className="savebar">
                <span>
                  {draftState} ·{' '}
                  {dirty
                    ? '有尚未上传的修改'
                    : project.local
                      ? '尚未创建服务器作品'
                      : '服务器修订 ' + project.revision}
                </span>
                <div className="row">
                  <button
                    onClick={() =>
                      void action(async () =>
                        download(await exportPortable(user!.id, history.present, project.source)),
                      )
                    }
                  >
                    导出当前草稿
                  </button>
                  {invalidDraft !== undefined && (
                    <button onClick={() => download(invalidDraft.raw, 'unrecovered-draft.json')}>
                      导出未恢复草稿
                    </button>
                  )}
                  <button onClick={() => void action(() => copyProject(project, history.present))}>
                    另存副本
                  </button>
                  <button
                    disabled={project.local || project.deleted}
                    onClick={() => void action(loadServer)}
                  >
                    重新加载服务器版本
                  </button>
                </div>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>版本与回声</h2>
                  <button onClick={() => void action(() => refreshHistory(project.id))}>
                    刷新版本与反馈
                  </button>
                </div>
                <div className="columns">
                  <div>
                    <h3>已提交版本</h3>
                    {versions.map((v) => (
                      <article className="note" key={v.id}>
                        <b>
                          修订 {v.sourceRevision} · {statusLabels[v.status]}
                        </b>
                        {v.reviewNote && <p>{v.reviewNote}</p>}
                        <button
                          onClick={() =>
                            void action(async () => {
                              setPlaying(await api<Version>('/versions/' + v.id));
                              setView('play');
                            })
                          }
                        >
                          试玩修订 {v.sourceRevision}
                        </button>
                      </article>
                    ))}
                    {!versions.length && <p>准备好了，就提交给老师。</p>}
                  </div>
                  <div>
                    <h3>同伴的发现</h3>
                    {feedback.map((f) => (
                      <article className="note" key={f.id}>
                        <b>{f.authorName}</b>
                        <p>{f.text}</p>
                        {f.location && (
                          <button onClick={() => void action(() => showFeedbackLocation(f))}>
                            查看反馈位置
                          </button>
                        )}
                        <small>
                          对应修订{' '}
                          {versions.find((v) => v.id === f.versionId)?.sourceRevision ??
                            f.versionId}{' '}
                          · {f.title}
                        </small>
                      </article>
                    ))}
                    {!feedback.length && <p>这里会收到同伴对作品的反馈。</p>}
                  </div>
                </div>
              </section>
            </>
          )}
          {view === 'shelf' && (
            <>
              <span className="eyebrow">走进同伴的想象</span>
              <h1>同伴作品</h1>
              <p>这里展示经过老师确认的小世界。试玩之后，把具体的发现送给创作者。</p>
              <div className="cards">
                {shelf.map((v) => (
                  <article className="card" key={v.id}>
                    <div className="cover">⚑ ✿ ◉</div>
                    <h2>{v.document.title}</h2>
                    <SourceCredit source={v.source} />
                    <p>由 {v.authorName} 创作</p>
                    <button
                      className="primary"
                      onClick={() =>
                        void action(async () => {
                          setPlaying(await api<Version>('/versions/' + v.id));
                          setView('play');
                        })
                      }
                    >
                      试玩作品
                    </button>
                  </article>
                ))}
              </div>
              {!shelf.length && <p className="empty">还没有展示中的作品</p>}
            </>
          )}
          {view === 'play' && playing && (
            <>
              <h1>{playing.document.title}</h1>
              {project?.id === playing.projectId && (
                <button onClick={() => void action(returnToEditor)}>返回编辑作品</button>
              )}
              <p>创作者：{playing.authorName}</p>
              <SourceCredit source={playing.source} />
              {playing.status === 'approved' && playing.allowRemix && (
                <button
                  onClick={() =>
                    void action(async () =>
                      openProject(
                        await api<Project>('/versions/' + playing.id + '/remix', 'POST', {}),
                      ),
                    )
                  }
                >
                  改编这个作品
                </button>
              )}
              <DocumentPlay
                userId={user!.id}
                key={playing.id}
                document={playing.document}
                onLocation={(where) => {
                  currentLocation.current = where;
                }}
              />
              {playing.status === 'approved' && (
                <form
                  className="panel feedback-form"
                  onSubmit={(e) => {
                    const data = fields(e),
                      form = e.currentTarget;
                    void action(async () => {
                      await api('/versions/' + playing.id + '/feedback', 'POST', {
                        ...data,
                        ...(feedbackLocation ? { location: feedbackLocation } : {}),
                      });
                      setFeedbackLocation(undefined);
                      form.reset();
                      setMessage('反馈已送出，谢谢你的发现');
                    });
                  }}
                >
                  <h2>把你的发现送给创作者</h2>
                  <label>
                    给创作者的反馈
                    <textarea
                      name="text"
                      required
                      maxLength={1000}
                      placeholder="我喜欢的设计是…… / 我遇到的困难是……"
                    />
                  </label>
                  {playing.document.schemaVersion === 2 && (
                    <div className="feedback-location">
                      <button
                        type="button"
                        onClick={() => {
                          if (currentLocation.current)
                            setFeedbackLocation({ ...currentLocation.current });
                          else setError('请先进入游戏，在房间内选择要记录的位置。');
                        }}
                      >
                        记录当前位置
                      </button>
                      {feedbackLocation && (
                        <>
                          <span>
                            已记录：
                            {
                              playing.document.rooms.find((r) => r.id === feedbackLocation.roomId)
                                ?.name
                            }{' '}
                            · 格 {feedbackLocation.x},{feedbackLocation.y}
                          </span>
                          <button type="button" onClick={() => setFeedbackLocation(undefined)}>
                            不附带位置
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <button className="primary">送出反馈</button>
                </form>
              )}
            </>
          )}
          {view === 'manage' && (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">陪伴每一次小小创造</span>
                  <h1>老师管理</h1>
                </div>
                <button onClick={() => void action(refreshManage)}>刷新管理页</button>
              </div>
              <section className="panel">
                <h2>小组成员</h2>
                <form
                  className="member-form"
                  onSubmit={(e) => {
                    const data = fields(e),
                      form = e.currentTarget;
                    void action(async () => {
                      await api('/members', 'POST', data);
                      form.reset();
                      await refreshManage();
                      setMessage('学生账号已创建');
                    });
                  }}
                >
                  <label>
                    学生账号
                    <input name="username" required pattern="[a-z0-9_-]{3,32}" />
                  </label>
                  <label>
                    学生昵称
                    <input name="displayName" required maxLength={30} />
                  </label>
                  <label>
                    初始密码
                    <input
                      name="password"
                      type="password"
                      minLength={10}
                      maxLength={128}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="primary">添加学生</button>
                </form>
                <div className="member-list">
                  {members.map((m) => (
                    <div className="member" key={m.id}>
                      <span>
                        {m.displayName} · {m.username}{' '}
                        {m.role === 'teacher' ? '（老师）' : m.active ? '' : '（已停用）'}
                      </span>
                      {m.role === 'student' && (
                        <div className="row">
                          <button
                            onClick={() =>
                              void action(async () => {
                                await api('/members/' + m.id, 'PATCH', { active: !m.active });
                                await refreshManage();
                              })
                            }
                          >
                            {m.active ? '停用' : '启用'}
                          </button>
                          <button
                            onClick={() => {
                              const password = window.prompt(
                                '请输入新密码（10至128个字符），旧登录将失效',
                              );
                              if (password)
                                void action(async () => {
                                  await api('/members/' + m.id, 'PATCH', { password });
                                  setMessage('密码已重置，学生需重新登录');
                                });
                            }}
                          >
                            重置密码
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>作品确认与展示</h2>
                {versions.map((v) => (
                  <article className="review" key={v.id}>
                    <div>
                      <h3>{v.document.title}</h3>
                      <SourceCredit source={v.source} />
                      <p>
                        {v.authorName} · 修订 {v.sourceRevision} · <b>{statusLabels[v.status]}</b>
                      </p>
                    </div>
                    <div className="row">
                      <button
                        onClick={() =>
                          void action(async () => {
                            setPlaying(await api<Version>('/versions/' + v.id));
                            setView('play');
                          })
                        }
                      >
                        检查试玩
                      </button>
                      {v.status === 'pending' && (
                        <>
                          <label>
                            审核建议
                            <input
                              aria-label={'审核建议 ' + v.document.title}
                              maxLength={1000}
                              value={reviewNotes[v.id] ?? ''}
                              onChange={(e) =>
                                setReviewNotes({ ...reviewNotes, [v.id]: e.target.value })
                              }
                            />
                          </label>
                          {['approved', 'returned'].map((s) => (
                            <button
                              key={s}
                              onClick={() =>
                                void action(async () => {
                                  await api('/versions/' + v.id, 'PATCH', {
                                    status: s,
                                    reviewNote: reviewNotes[v.id] ?? '',
                                  });
                                  await refreshManage();
                                })
                              }
                            >
                              {s === 'approved' ? '确认展示' : '退回修改'}
                            </button>
                          ))}
                        </>
                      )}
                      {v.status === 'approved' && (
                        <button
                          onClick={() =>
                            void action(async () => {
                              await api('/versions/' + v.id, 'PATCH', { status: 'withdrawn' });
                              await refreshManage();
                            })
                          }
                        >
                          撤回展示
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!versions.length && <p>暂无提交的作品。</p>}
              </section>
              <section className="panel">
                <h2>反馈管理</h2>
                {feedback.map((f) => (
                  <article className="review" key={f.id}>
                    <div>
                      <b>
                        {f.authorName} → {f.title}
                      </b>
                      <p>{f.text}</p>
                      {f.location && (
                        <button onClick={() => void action(() => showFeedbackLocation(f))}>
                          查看反馈位置
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        void action(async () => {
                          await api('/feedback/' + f.id, 'PATCH', { hidden: !f.hidden });
                          await refreshManage();
                        })
                      }
                    >
                      {f.hidden ? '恢复反馈' : '隐藏反馈'}
                    </button>
                  </article>
                ))}
                {!feedback.length && <p>暂无反馈。</p>}
              </section>
            </>
          )}
        </fieldset>
      </main>
      <footer>创作工坊 · 小范围试用版　/　一次创造，一点发现</footer>
    </div>
  );
}
