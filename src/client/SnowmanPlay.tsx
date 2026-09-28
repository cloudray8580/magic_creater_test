import { useEffect, useRef, useState } from 'react';
import { key, type SnowmanDocument, type Point } from '../shared/snowman/document.js';
import {
  createRun,
  advance,
  perform,
  liveFrame,
  liveRoute,
  TICKS_PER_SECOND,
  type LiveRun,
  type LiveTool,
  type Direction,
  type TimedAction,
  type LiveAction,
} from '../shared/snowman/engine.js';
import { SnowmanMap, SnowFigure } from './SnowmanMap.js';

export function SnowmanPlay({
  document: d,
  onWin,
}: {
  document: SnowmanDocument;
  onWin?: (actions: TimedAction[]) => void;
}) {
  const runRef = useRef<LiveRun>(null!);
  if (!runRef.current) runRef.current = createRun(d);
  const routeRef = useRef<{ key: string; route: Point[] }>({ key: '', route: [] });
  const completedRef = useRef<TimedAction[]>([]);
  const replayIndex = useRef(0);
  const winRef = useRef(onWin);
  winRef.current = onWin;
  const [, update] = useState(0);
  const [mode, setMode] = useState<'intro' | 'active' | 'result' | 'replay'>('intro');
  const [tool, setTool] = useState<LiveTool>('repair');
  const [direction, setDirection] = useState<Direction>('right');
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showRoute, setShowRoute] = useState(true);
  const run = runRef.current;
  const frame = liveFrame(run);
  const routeKey = key(run.cell) + ':' + run.actions.length;
  if (showRoute && routeRef.current.key !== routeKey)
    routeRef.current = {
      key: routeKey,
      route: run.routeDirty ? liveRoute(run, false) : run.routeCache,
    };
  const route = showRoute ? routeRef.current.route : [];
  useEffect(() => {
    if ((mode !== 'active' && mode !== 'replay') || paused) return;
    let last = performance.now();
    let carry = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      if (document.hidden) {
        last = now;
        return;
      }
      carry += Math.max(0, Math.min(150, now - last)) * (mode === 'replay' ? speed : 1);
      last = now;
      const steps = Math.min(8, Math.floor(carry / 25));
      carry -= steps * 25;
      const s = runRef.current;
      try {
        for (let i = 0; i < steps && (s.phase === 'prep' || s.phase === 'run'); i++) {
          if (mode === 'replay') {
            while (completedRef.current[replayIndex.current]?.tick === s.tick) {
              perform(s, completedRef.current[replayIndex.current].action);
              replayIndex.current++;
            }
          }
          advance(s);
        }
      } catch (cause) {
        s.phase = 'lost';
        s.reason = (cause as Error).message;
      }
      if (steps) update((n) => n + 1);
      if (s.phase === 'won' || s.phase === 'lost') {
        if (mode === 'active' && s.phase === 'won') winRef.current?.(structuredClone(s.actions));
        setMode('result');
      }
    }, 25);
    const resetClock = () => {
      last = performance.now();
      carry = 0;
    };
    document.addEventListener('visibilitychange', resetClock);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resetClock);
    };
  }, [mode, paused, speed]);

  function reset() {
    runRef.current = createRun(d);
    completedRef.current = [];
    replayIndex.current = 0;
    setMode('intro');
    setPaused(false);
    setError('');
    update((n) => n + 1);
  }
  function act(action: LiveAction) {
    if (paused || mode !== 'active') return;
    try {
      perform(runRef.current, action);
      setError('');
      update((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function paint(points: Point[]) {
    for (const p of points)
      act({ type: 'place', tool, ...p, ...(tool === 'sign' ? { direction } : {}) });
  }
  function undoPrep() {
    const original = runRef.current;
    const actions = original.actions.slice(0, -1);
    const next = createRun(d);
    for (const a of actions) {
      advance(next, a.tick - next.tick);
      perform(next, a.action);
    }
    advance(next, original.tick - next.tick);
    runRef.current = next;
    update((n) => n + 1);
  }
  function retryKeep() {
    const placements = structuredClone(runRef.current.placements);
    const next = createRun(d);
    for (const placement of placements) perform(next, { type: 'place', ...placement });
    runRef.current = next;
    setMode('intro');
    setPaused(false);
    setError('');
    update((n) => n + 1);
  }
  function playAgain() {
    completedRef.current = structuredClone(runRef.current.actions);
    replayIndex.current = 0;
    runRef.current = createRun(d);
    setMode('replay');
    setPaused(false);
    setSpeed(1);
    update((n) => n + 1);
  }
  const canEdit = mode === 'active' && !paused;
  return (
    <section className="snow-game" aria-label="雪人回家游戏">
      <div className="snow-intro">
        <div>
          <span className="eyebrow">一段小小的归途</span>
          <h2>{d.title}</h2>
          <p>{d.description}</p>
        </div>
        <div className="snow-mass">
          <strong>{Math.ceil(frame.mass)}</strong>
          <span>剩余体积 / 初始 {d.mass}</span>
          <meter min="0" max={d.mass * 1.5} value={frame.mass} />
        </div>
      </div>
      <p className="snow-rules">
        查看地图后点击开始。默认准备 {d.preparationSeconds} 秒，到时雪人自动出发；
        出发后仍能在前方修路、架桥、灭火和放雪球。它自己寻找最短通路， 路牌指定出口。雪球恢复 8
        点体积，上限为初始的 150%。
      </p>
      <div className="snow-supplies" aria-label="剩余材料">
        <span>
          木材 <b>{run.inventory.wood}</b>
        </span>
        <span>
          清水 <b>{run.inventory.water}</b>
        </span>
        <span>
          路牌 <b>{run.inventory.signs}</b>
        </span>
        <span>
          雪球 <b>{run.inventory.snowballs}</b>
        </span>
        <span>
          帽子 <b>{run.hats.length}</b> · {run.ski ? '已穿滑雪板' : '步行中'}
        </span>
      </div>
      {mode === 'intro' ? (
        <div className="row">
          <button className="primary" onClick={() => setMode('active')}>
            开始救援
          </button>
          <span>可以先滚动或缩放查看地图；准备计时从点击开始救援时算起。</span>
        </div>
      ) : (
        <div className="row">
          <strong aria-live="off">
            {mode === 'active' && run.phase === 'prep'
              ? '准备倒计时 ' +
                Math.ceil((d.preparationSeconds * TICKS_PER_SECOND - run.tick) / TICKS_PER_SECOND) +
                ' 秒'
              : mode === 'active'
                ? '雪人正在回家'
                : mode === 'replay'
                  ? '观看回放'
                  : '旅程结束'}
          </strong>
          <span>{(run.tick / TICKS_PER_SECOND).toFixed(1)} 秒</span>
          {mode === 'active' && run.phase === 'prep' && (
            <button disabled={paused} onClick={() => act({ type: 'depart' })}>
              提前出发
            </button>
          )}
          {(mode === 'active' || mode === 'replay') && (
            <button onClick={() => setPaused(!paused)}>{paused ? '继续旅程' : '暂停旅程'}</button>
          )}
          {mode === 'replay' && (
            <label>
              回放速度{' '}
              <select
                aria-label="回放速度"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>
          )}
          <button onClick={reset}>重新开始</button>
        </div>
      )}
      {mode === 'active' && (
        <div className="snow-tools" role="group" aria-label="救援工具">
          {(
            [
              ['repair', '修路 · 1 木'],
              ['bridge', '架桥 · 2 木'],
              ['water', '灭火 · 1 水'],
              ['sign', '路牌 · 1 牌'],
              ['skis', '滑雪板 · 2 木'],
              ['snowball', '雪球 · 1 个'],
            ] as [LiveTool, string][]
          ).map(([v, label]) => (
            <button key={v} disabled={paused} aria-pressed={tool === v} onClick={() => setTool(v)}>
              {label}
            </button>
          ))}
          <label>
            路牌方向{' '}
            <select
              aria-label="路牌方向"
              disabled={paused}
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as Direction);
                setTool('sign');
              }}
            >
              <option value="right">向右 →</option>
              <option value="down">向下 ↓</option>
              <option value="left">向左 ←</option>
              <option value="up">向上 ↑</option>
            </select>
          </label>
          {run.phase === 'prep' && (
            <button disabled={!run.actions.length || paused} onClick={undoPrep}>
              撤销布置
            </button>
          )}
          {run.phase === 'run' && (
            <span>撤回未使用道具：再次选择该工具后，按住 Shift 点击道具格。</span>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === 'result' && (
        <div className={'snow-result ' + (run.phase === 'won' ? 'won' : 'lost')} role="status">
          <svg
            width="90"
            height={Math.max(100, 70 + run.hats.length * 8)}
            viewBox={
              '-10 ' + (-30 - run.hats.length * 8) + ' 65 ' + Math.max(90, 80 + run.hats.length * 8)
            }
          >
            <SnowFigure {...frame} initial={d.mass} hatStyles={run.hats} />
          </svg>
          <div>
            <h3>{run.phase === 'won' ? '雪人平安到家了！' : '雪人融化了，再试一次吧'}</h3>
            <p>
              {run.phase === 'lost'
                ? run.reason
                : '带回 ' +
                  run.hats.length +
                  ' 顶帽子' +
                  (run.carrot ? '和一根胡萝卜' : '') +
                  '，还剩 ' +
                  Math.ceil(run.mass) +
                  ' 体积。'}
            </p>
            <button onClick={playAgain}>观看回放</button>
            <button onClick={retryKeep}>保留布置重试</button>
            <button onClick={reset}>清空后重试</button>
          </div>
        </div>
      )}
      <SnowmanMap
        document={d}
        plan={run.placements}
        route={route}
        frame={frame}
        hatStyles={run.hats}
        follow={(mode === 'active' && run.phase === 'run') || mode === 'replay'}
        collected={run.collected}
        onPaint={canEdit ? paint : undefined}
        onRemove={
          canEdit
            ? (p) => act({ type: 'remove', tool: tool as Exclude<LiveTool, 'water'>, ...p })
            : undefined
        }
      />
    </section>
  );
}
