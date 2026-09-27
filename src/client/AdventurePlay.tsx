import { useEffect, useRef, useState } from 'react';
import type { AdventureDocument, Location } from '../shared/adventure/document.js';
import { useAssetUrls } from './assets.js';
import type { GameControls } from './adventure/renderer.js';
import type { GameFrame } from './adventure/view.js';
const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'KeyE',
  'KeyZ',
  'KeyR',
]);
function preference(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem('world-' + key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}
export function AdventurePlay({
  document: doc,
  from,
  userId = '',
  onLocation,
}: {
  document: AdventureDocument;
  from?: Location;
  userId?: string;
  onLocation?: (location: Location | null) => void;
}) {
  const assets = useAssetUrls(doc, userId);
  const reportLocation = useRef(onLocation);
  reportLocation.current = onLocation;
  const canvas = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLElement>(null),
    controls = useRef<GameControls>(null);
  const [frame, setFrame] = useState<GameFrame>(),
    [error, setError] = useState(''),
    [paused, setPaused] = useState(true);
  const [music, setMusic] = useState(() => preference('music', false)),
    [effects, setEffects] = useState(() => preference('effects', true)),
    [motion, setMotion] = useState(() => preference('motion', true));
  const [assist, setAssist] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFrame(undefined);
    setError('');
    setPaused(true);
    if (!assets.ready) return;
    import('./adventure/renderer.js')
      .then(({ mountAdventure }) => {
        if (cancelled || !canvas.current) return;
        controls.current = mountAdventure(canvas.current, doc, {
          assetUrls: assets.urls,
          assist,
          from,
          onFrame: (f) => {
            if (!cancelled) {
              setFrame(f);
              const x = Math.floor(f.hero.x),
                y = Math.ceil(f.hero.y) - 1;
              reportLocation.current?.(
                x >= 0 && y >= 0 && x < f.room.width && y < f.room.height
                  ? { roomId: f.room.id, x, y }
                  : null,
              );
            }
          },
          onError: (e) => {
            if (!cancelled) setError(e);
          },
        });
        controls.current.motion(preference('motion', true));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '游戏加载失败');
      });
    return () => {
      cancelled = true;
      controls.current?.destroy();
      controls.current = null;
    };
  }, [doc, from, assist, assets.ready, assets.urls]);
  useEffect(() => {
    const pause = () => {
      controls.current?.pause(true);
      setPaused(true);
    };
    window.addEventListener('blur', pause);
    const hidden = () => {
      if (globalThis.document.hidden) pause();
    };
    globalThis.document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', pause);
      globalThis.document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  function focus() {
    if (!controls.current || !frame) return;
    surface.current?.focus();
    controls.current?.pause(false);
    controls.current?.sound(music, effects);
    setPaused(false);
  }
  function action(type: Parameters<GameControls['action']>[0], index?: number) {
    controls.current?.action(type, index);
    focus();
  }
  function setPreference(key: 'music' | 'effects' | 'motion', value: boolean) {
    try {
      localStorage.setItem('world-' + key, String(value));
    } catch {
      /* Private browsing still permits session settings. */
    }
    if (key === 'music') {
      setMusic(value);
      controls.current?.sound(value, effects);
    } else if (key === 'effects') {
      setEffects(value);
      controls.current?.sound(music, value);
    } else {
      setMotion(value);
      controls.current?.motion(value);
    }
  }
  return (
    <section
      className="adventure-play"
      aria-label="绘本游戏"
      ref={surface}
      tabIndex={0}
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget as Node | null) ||
          e.relatedTarget !== e.currentTarget
        ) {
          controls.current?.pause(true);
          setPaused(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || !GAME_KEYS.has(e.code)) return;
        e.preventDefault();
        controls.current?.key(e.code, true);
      }}
      onKeyUp={(e) => {
        if (GAME_KEYS.has(e.code)) {
          if (e.target === e.currentTarget) e.preventDefault();
          controls.current?.key(e.code, false);
        }
      }}
    >
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            {doc.gameType === 'platformer' ? '奔跑 · 跳跃 · 发现' : '探索 · 选择 · 改变'}
          </span>
          <h2>{doc.title}</h2>
        </div>
        <span>{frame?.room.name}</span>
      </div>
      <div
        className="game-stage"
        onPointerDown={(e) => {
          if (!(e.target as Element).closest('button')) focus();
        }}
      >
        <div className="phaser-host" ref={canvas} aria-label="游戏画面" />
        {!frame && !error && !assets.error && (
          <div className="game-overlay">
            <p>正在打开小世界…</p>
          </div>
        )}
        {frame && paused && !frame.dialogue && !frame.ending && (
          <div className="game-overlay">
            <button className="primary" onClick={focus}>
              点击进入小世界
            </button>
            <p>键盘和鼠标已准备好</p>
          </div>
        )}
        {frame?.prompt && !paused && !frame.dialogue && (
          <div className="game-prompt">{frame.prompt}</div>
        )}
        {frame?.dialogue && (
          <div className="dialogue-card" role="dialog" aria-label={frame.dialogue.title}>
            <strong>{frame.dialogue.title}</strong>
            <p>{frame.dialogue.text}</p>
            <div className="row">
              {frame.dialogue.choices.map((choice, i) => (
                <button key={i} onClick={() => action('choose', i)}>
                  {choice.label}
                </button>
              ))}
              <button onClick={() => action('close')}>
                {frame.dialogue.choices.length ? '稍后再聊' : '继续旅程'}
              </button>
            </div>
          </div>
        )}
        {frame?.ending && (
          <div className="game-overlay ending">
            <span className="eyebrow">一个想法，一段旅程</span>
            <h2>你让这个世界发生了变化</h2>
            <p>{frame.ending}</p>
            {(assist || from) && <p>这是辅助／指定位置试玩</p>}
            <button onClick={() => action('restart')}>再走一遍，看看不同的风景</button>
          </div>
        )}
      </div>
      {assets.warning && <p role="status">{assets.warning}</p>}
      {(error || assets.error) && (
        <p role="alert" className="error">
          {error || assets.error}
        </p>
      )}
      <div className="game-hud">
        <span>
          收集 {frame?.collected ?? 0} / {frame?.total ?? 0}
        </span>
        <span role="status">{frame?.notice || '沿着好奇心，向前走一点。'}</span>
        <span className="game-coordinate">
          {frame ? `${Math.floor(frame.hero.x)},${Math.ceil(frame.hero.y) - 1}` : ''}
        </span>
      </div>
      {doc.gameType === 'story' && (
        <p className="inventory">背包：{frame?.inventory.join(' · ') || '还没有物品'}</p>
      )}
      <div className="game-footer">
        <p>
          {doc.gameType === 'platformer'
            ? 'A/D 或 ←/→ 移动 · 空格跳跃（按住跳得更高） · E 互动'
            : 'WASD 或方向键移动 · E 互动 · Z 撤销一步'}
        </p>
        <div className="row">
          {doc.gameType === 'story' ? (
            <>
              <button onClick={() => action('undo')}>撤销一步</button>
              <button onClick={() => action('reset-room')}>重置此房间</button>
            </>
          ) : (
            <button onClick={() => action('respawn')}>回检查点</button>
          )}
          <button onClick={() => action('restart')}>重新开始</button>
          {doc.gameType === 'platformer' && (
            <label>
              <input
                type="checkbox"
                checked={assist}
                onChange={(e) => setAssist(e.target.checked)}
              />
              辅助跳跃（重开）
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={music}
              onChange={(e) => setPreference('music', e.target.checked)}
            />
            音乐
          </label>
          <label>
            <input
              type="checkbox"
              checked={effects}
              onChange={(e) => setPreference('effects', e.target.checked)}
            />
            音效
          </label>
          <label>
            <input
              type="checkbox"
              checked={motion}
              onChange={(e) => setPreference('motion', e.target.checked)}
            />
            动态效果
          </label>
        </div>
      </div>
    </section>
  );
}
