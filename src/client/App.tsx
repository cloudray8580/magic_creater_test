import { useEffect, useState, useRef, type FormEvent } from 'react';
import { api, ApiError, type User, type Project, type Version, type Feedback } from './api.js';
import { readDraft, writeDraft, holdDraft } from './drafts.js';
import {
  template,
  validateDocument,
  createHistory,
  changeHistory,
  undoHistory,
  redoHistory,
  editTitle,
  editCell,
  LIMITS,
  type GameDocument,
  type History,
  type Tool,
} from '../shared/game.js';
import { Play, labels, symbols } from './Play.js';
import { AdventurePlay } from './AdventurePlay.js';
import { adventureTemplate, TEMPLATE_IDS, TEMPLATE_INFO } from '../shared/adventure/templates.js';
import type { AdventureDocument } from '../shared/adventure/document.js';
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
function download(doc: GameDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'creative-world.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [sample, setSample] = useState<AdventureDocument>(() => adventureTemplate());
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
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project>(),
    [history, setHistory] = useState<History>(),
    [tool, setTool] = useState<Tool>('wall'),
    [dirty, setDirty] = useState(false),
    [draftState, setDraftState] = useState(''),
    [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]),
    [shelf, setShelf] = useState<Version[]>([]),
    [playing, setPlaying] = useState<Version>(),
    [members, setMembers] = useState<User[]>([]),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  async function refreshMine() {
    setProjects((await api<{ projects: Project[] }>('/projects')).projects);
  }
  async function refreshHistory(id: string) {
    const [v, f] = await Promise.all([
      api<{ versions: Version[] }>('/projects/' + id + '/versions'),
      api<{ feedback: Feedback[] }>('/projects/' + id + '/feedback'),
    ]);
    setVersions(v.versions);
    setFeedback(f.feedback);
  }
  async function refreshManage() {
    const [m, v, f] = await Promise.all([
      api<{ members: User[] }>('/members'),
      api<{ versions: Version[] }>('/manage/versions'),
      api<{ feedback: Feedback[] }>('/manage/feedback'),
    ]);
    setMembers(m.members);
    setVersions(v.versions);
    setFeedback(f.feedback);
  }
  function clearAccountState() {
    releaseEditor();
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
    setView('mine');
  }
  async function action(task: () => Promise<void>) {
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
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const me = await api<{ user: User; classroom: { name: string } }>('/me');
        setUser(me.user);
        setClassroom(me.classroom.name);
        await refreshMine();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401))
          setError(e instanceof Error ? e.message : '连接失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function openProject(p: Project) {
    const key = user!.id + ':' + p.id;
    if (editorLock.current?.key !== key) {
      releaseEditor();
      const release = await holdDraft(user!.id, p.id);
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
    const restored = local?.dirty ? local : undefined;
    setProject(restored ? { ...p, revision: restored.revision } : p);
    setHistory(createHistory(restored ? restored.document : p.document));
    setDirty(Boolean(restored));
    setPreview(false);
    setView('editor');
    setDraftState(
      storageFailed
        ? '本地存储不可用，请及时导出'
        : restored
          ? '已恢复未保存的本地草稿'
          : '与服务器一致',
    );
    await refreshHistory(p.id);
  }
  async function returnToEditor() {
    if (!project || !user) return;
    if (editorLock.current?.key === user.id + ':' + project.id && history) {
      setView('editor');
      return;
    }
    await openProject(project);
  }
  async function create(document: GameDocument) {
    const p = await api<Project>('/projects', 'POST', { document: validateDocument(document) });
    await openProject(p);
  }
  async function navigate(next: View) {
    setPreview(false);
    if (next === 'mine') await refreshMine();
    if (next === 'shelf') setShelf((await api<{ versions: Version[] }>('/shelf')).versions);
    if (next === 'manage') await refreshManage();
    releaseEditor();
    setView(next);
  }
  function persist(next: History) {
    setHistory(next);
    setDirty(true);
    setDraftState('正在保存本地草稿…');
    void writeDraft(user!.id, project!.id, {
      document: next.present,
      revision: project!.revision,
      dirty: true,
    })
      .then(() => setDraftState('本地草稿已保存'))
      .catch(() => setDraftState('本地保存失败，请立即导出文件'));
  }
  async function save(): Promise<Project> {
    const p = await api<Project>('/projects/' + project!.id, 'PUT', {
      document: validateDocument(history!.present),
      revision: project!.revision,
    });
    setProject(p);
    setDirty(false);
    await writeDraft(user!.id, p.id, { document: p.document, revision: p.revision, dirty: false });
    setDraftState('与服务器一致');
    setMessage('已保存到服务器');
    return p;
  }
  async function loadServer() {
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
              await api('/login', 'POST', b);
              const me = await api<{ user: User; classroom: { name: string } }>('/me');
              setUser(me.user);
              setClassroom(me.classroom.name);
              await refreshMine();
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
        <fieldset disabled={busy} className="workspace">
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
                <p>从一个小花园开始。放置、尝试、修改，再邀请同伴来探索。</p>
                <div className="row">
                  <button className="primary" onClick={() => void action(() => create(template()))}>
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
                            if (f.size > LIMITS.bodyBytes) throw new Error('文件不能超过128KiB');
                            await create(validateDocument(JSON.parse(await f.text())));
                          });
                      }}
                    />
                  </label>
                </div>
              </section>
              <div className="section-heading">
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
                    <p>服务器修订 {p.revision}</p>
                    <div className="row">
                      <button
                        className="primary"
                        onClick={() =>
                          void action(async () =>
                            openProject(await api<Project>('/projects/' + p.id)),
                          )
                        }
                      >
                        继续创作
                      </button>
                      <button onClick={() => download(p.document)}>导出</button>
                      <button
                        onClick={() =>
                          void action(() =>
                            create({
                              ...p.document,
                              title: (p.document.title + ' 副本').slice(0, 60),
                            }),
                          )
                        }
                      >
                        复制作品
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
                  <span className="eyebrow">创作中的小世界</span>
                  <h1>{history.present.title || '未命名作品'}</h1>
                </div>
                <div className="row">
                  <button
                    onClick={() => {
                      try {
                        validateDocument(history.present, true);
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
                        const p = dirty ? await save() : project;
                        await api('/projects/' + p.id + '/submit', 'POST', {
                          revision: p.revision,
                        });
                        await refreshHistory(p.id);
                        setMessage('已提交给老师，等待确认展示');
                      })
                    }
                  >
                    提交给老师
                  </button>
                </div>
              </div>
              {preview ? (
                <Play key={project.id} document={history.present} />
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
                        gridTemplateColumns: 'repeat(' + history.present.level.width + ',1fr)',
                      }}
                    >
                      {Array.from(
                        { length: history.present.level.width * history.present.level.height },
                        (_, i) => {
                          const x = i % history.present.level.width,
                            y = Math.floor(i / history.present.level.width),
                            o = history.present.level.objects.find((o) => o.x === x && o.y === y);
                          return (
                            <button
                              type="button"
                              data-testid={'cell-' + x + ',' + y}
                              aria-label={'格 ' + x + ',' + y + ' ' + (o ? labels[o.type] : '空地')}
                              className={'cell ' + (o?.type ?? '')}
                              key={i}
                              onClick={() =>
                                persist(
                                  changeHistory(history, editCell(history.present, x, y, tool)),
                                )
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
                          persist(
                            changeHistory(history, editTitle(history.present, e.target.value)),
                          )
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
                  {draftState} · {dirty ? '有尚未上传的修改' : '服务器修订 ' + project.revision}
                </span>
                <div className="row">
                  <button onClick={() => download(history.present)}>导出当前草稿</button>
                  <button
                    onClick={() =>
                      void action(() =>
                        create({
                          ...history.present,
                          title: (history.present.title + ' 副本').slice(0, 60),
                        }),
                      )
                    }
                  >
                    另存副本
                  </button>
                  <button onClick={() => void action(loadServer)}>重新加载服务器版本</button>
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
              <Play key={playing.id} document={playing.document} />
              {playing.status === 'approved' && (
                <form
                  className="panel feedback-form"
                  onSubmit={(e) => {
                    const data = fields(e),
                      form = e.currentTarget;
                    void action(async () => {
                      await api('/versions/' + playing.id + '/feedback', 'POST', data);
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
                      <p>
                        {v.authorName} · 修订 {v.sourceRevision} · <b>{statusLabels[v.status]}</b>
                      </p>
                    </div>
                    <div className="row">
                      <button
                        onClick={() => {
                          setPlaying(v);
                          setView('play');
                        }}
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
