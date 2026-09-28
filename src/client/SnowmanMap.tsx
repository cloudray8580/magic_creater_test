import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  key,
  type SnowmanDocument,
  type Point,
  type CellKind,
} from '../shared/snowman/document.js';
import type { Frame, Plan } from '../shared/snowman/engine.js';
export const SNOW_LABELS: Record<CellKind, string> = {
  road: '道路',
  broken: '破路',
  gap: '断桥',
  fire: '火堆',
  hat: '帽子',
  carrot: '胡萝卜',
  tree: '松树',
  shade: '树荫',
  ice: '冰面',
};
export function WinterIcon({ kind, style = 'berry' }: { kind: string; style?: string }) {
  if (kind === 'tree')
    return (
      <g>
        <path d="M20 2 6 24h8L8 32h24l-6-8h8Z" fill="#437d75" />
        <path d="m20 2-8 13h16Z" fill="#c3e9dc" />
        <path d="M18 32h4v6h-4" fill="#786557" />
      </g>
    );
  if (kind === 'hat') {
    const colors: Record<string, [string, string]> = {
      berry: ['#8f587b', '#ffc18c'],
      pine: ['#407b6e', '#dfca8f'],
      star: ['#546e9f', '#f5df83'],
      wool: ['#c57967', '#fff1ce'],
    };
    const [body, trim] = colors[style] ?? colors.berry;
    return (
      <g transform="rotate(-12 20 22)">
        <path d="M11 11h19v17H11Z" fill={body} />
        <path d="M11 23h19v4H11" fill={trim} />
        <path d="M5 29h31" stroke={body} strokeWidth="5" strokeLinecap="round" />
        {style === 'star' && (
          <text x="20" y="22" fontSize="12" textAnchor="middle" fill={trim}>
            ★
          </text>
        )}
        {style === 'wool' && <circle cx="20" cy="8" r="4" fill={trim} />}
      </g>
    );
  }
  if (kind === 'snowball')
    return (
      <g>
        <circle cx="20" cy="20" r="14" fill="#fff" stroke="#8abec9" strokeWidth="3" />
        <path d="M10 25q10 7 20 0" stroke="#c4e4e6" strokeWidth="2" fill="none" />
      </g>
    );
  if (kind === 'shade')
    return (
      <g>
        <path d="M2 34q18-12 36 0" fill="#96bfba" opacity=".55" />
        <path d="M20 4v28M5 20q15-26 30 0" stroke="#568877" strokeWidth="3" fill="none" />
      </g>
    );
  if (kind === 'ice')
    return (
      <g>
        <path d="M6 30 20 5l14 25Z" fill="#bce4ed" stroke="#75afc5" strokeWidth="2" />
        <path d="m12 25 8-13 7 13" stroke="#fff" strokeWidth="2" fill="none" />
      </g>
    );
  if (kind === 'carrot')
    return (
      <g>
        <path d="m12 13 20 9-22 8Z" fill="#e9944b" />
        <path d="m12 16-7-8m9 5L15 5" stroke="#529878" strokeWidth="3" />
      </g>
    );
  if (kind === 'fire')
    return (
      <g>
        <path d="m8 33 25-3m-23-1 23 6" stroke="#765c50" strokeWidth="4" />
        <path d="M20 3C26 13 37 18 30 28S9 29 10 21c0-7 8-8 10-18Z" fill="#ef8156" />
        <path d="M21 16c9 10 3 15-2 13s-6-7 2-13Z" fill="#ffe48b" />
      </g>
    );
  if (kind === 'broken')
    return <path d="m20 0-7 12 13 9-12 8 6 11" stroke="#608a9c" strokeWidth="5" fill="none" />;
  if (kind === 'gap')
    return (
      <g>
        <rect width="40" height="40" rx="5" fill="#7db5ca" />
        <path
          d="M4 12q8-5 16 0t16 0M4 27q8-5 16 0t16 0"
          stroke="#d4eff4"
          strokeWidth="2"
          fill="none"
        />
      </g>
    );
  if (kind === 'bridge')
    return (
      <g>
        <rect x="2" y="3" width="36" height="34" rx="3" fill="#b08c63" />
        {[8, 16, 24, 32].map((y) => (
          <path key={y} d={`M3 ${y}h34`} stroke="#ead5b3" strokeWidth="3" />
        ))}
      </g>
    );
  if (kind === 'home')
    return (
      <g>
        <rect x="7" y="16" width="27" height="23" rx="3" fill="#d89772" />
        <path
          d="M2 19 20 3l18 16"
          fill="#71909d"
          stroke="#fff8ed"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <rect x="16" y="24" width="10" height="15" rx="4" fill="#775d58" />
        <rect x="28" y="21" width="4" height="6" fill="#ffe7a0" />
      </g>
    );
  if (kind === 'skis')
    return (
      <g stroke="#d77d62" strokeWidth="3" fill="none">
        <path d="M9 5v27q0 5 5 2M25 5v27q0 5 5 2" />
      </g>
    );
  return null;
}
export function SnowFigure({
  mass = 22,
  initial = 22,
  hats = 0,
  hatStyles,
  carrot = false,
  ski = false,
}: {
  mass?: number;
  initial?: number;
  hats?: number;
  hatStyles?: string[];
  carrot?: boolean;
  ski?: boolean;
}) {
  const scale = Math.max(0, Math.sqrt(mass / initial));
  return (
    <g>
      <g transform={`translate(20 36) scale(${scale}) translate(-20 -36)`}>
        <ellipse cx="20" cy="37" rx="16" ry="3" fill="#456a7825" />
        {ski && (
          <g stroke="#bf745b" strokeWidth="3" strokeLinecap="round">
            <path d="M0 35h35l3-3M3 39h35l3-3" />
          </g>
        )}
        <path d="m9 25-7-6m29 6 7-6" stroke="#887262" strokeWidth="2" />
        <circle cx="20" cy="27" r="11" fill="#fffdf6" stroke="#b1d3db" />
        <circle cx="20" cy="13" r="8" fill="#fffdf6" stroke="#b1d3db" />
        <path d="M13 20q7 3 14 0m-4 2 3 8" stroke="#dc7e70" strokeWidth="4" />
        <circle cx="18" cy="11" r="1.1" fill="#304b62" />
        <circle cx="23" cy="11" r="1.1" fill="#304b62" />
        <path
          d={carrot ? 'm21 14 10 2-10 2' : 'm19 16q2 2 4 0'}
          stroke={carrot ? '#ea994d' : '#607c88'}
          fill={carrot ? '#ea994d' : 'none'}
        />
        {[0, 1].map((i) => (
          <circle key={i} cx="20" cy={26 + i * 5} r="1" fill="#66818c" />
        ))}
      </g>
      <g transform={'translate(0 ' + (1 - scale) * 31 + ')'}>
        {(hatStyles ?? Array.from({ length: hats }, () => 'berry')).map((style, i) => (
          <g key={i} data-hat-style={style} transform={`translate(5 ${-12 - i * 8}) scale(.75)`}>
            <WinterIcon kind="hat" style={style} />
          </g>
        ))}
      </g>
    </g>
  );
}
export function SnowmanMap({
  document: d,
  plan = [],
  route = [],
  frame,
  onPaint,
  collected = new Set<string>(),
  follow = false,
  hatStyles,
  onRemove,
}: {
  collected?: ReadonlySet<string>;
  follow?: boolean;
  document: SnowmanDocument;
  plan?: Plan;
  route?: Point[];
  frame?: Frame;
  hatStyles?: string[];
  onPaint?: (points: Point[]) => void;
  onRemove?: (point: Point) => void;
}) {
  const id = useId().replace(/:/g, ''),
    viewport = useRef<HTMLDivElement>(null),
    stroke = useRef<Point[]>([]),
    removing = useRef(false),
    autoScroll = useRef(false),
    followRef = useRef(follow);
  const [zoom, setZoom] = useState(1),
    [bounds, setBounds] = useState({ x: 0, y: 0, w: 1200, h: 560 }),
    [hover, setHover] = useState<Point>(),
    [followPlayer, setFollowPlayer] = useState(follow);
  const hatPad = hatStyles?.length ? hatStyles.length * 8 + 24 : 0;
  useEffect(() => {
    if (follow) {
      followRef.current = true;
      setFollowPlayer(true);
    }
  }, [follow]);
  const stopFollow = () => {
    followRef.current = false;
    setFollowPlayer(false);
  };
  const unit = 40 * zoom;
  const refresh = () => {
    const el = viewport.current;
    if (el) setBounds({ x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
  };
  const locate = (p: Point | null) => {
    if (p && viewport.current) {
      autoScroll.current = true;
      viewport.current.scrollTo({
        left: (p.x + 0.5) * unit - viewport.current.clientWidth / 2,
        top:
          (p.y + 0.5) * unit +
          hatPad * zoom -
          viewport.current.clientHeight / 2 -
          Math.min(280, (hatStyles?.length ?? 0) * 8 * zoom),
      });
      requestAnimationFrame(() => {
        autoScroll.current = false;
      });
    }
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    refresh();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!follow || !followRef.current || !followPlayer || !frame || !viewport.current) return;
    const el = viewport.current,
      x = (frame.x + 0.5) * unit,
      y = (frame.y + 0.5) * unit + hatPad * zoom,
      towerTop = y - (hatStyles?.length ?? 0) * 8 * zoom - unit;
    if (
      x < el.scrollLeft + unit ||
      x > el.scrollLeft + el.clientWidth - unit ||
      towerTop < el.scrollTop + unit ||
      y > el.scrollTop + el.clientHeight - unit
    )
      locate(frame);
  }, [follow, followPlayer, frame?.x, frame?.y, unit, hatPad]);
  function at(e: PointerEvent<SVGSVGElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(d.width - 1, Math.floor((e.clientX - b.left) / unit))),
      y: Math.max(
        0,
        Math.min(d.height - 1, Math.floor((e.clientY - b.top - hatPad * zoom) / unit)),
      ),
    };
  }
  function add(p: Point) {
    const old = stroke.current.at(-1);
    if (old) {
      const n = Math.max(Math.abs(p.x - old.x), Math.abs(p.y - old.y));
      for (let i = 1; i <= n; i++)
        stroke.current.push({
          x: Math.round(old.x + ((p.x - old.x) * i) / n),
          y: Math.round(old.y + ((p.y - old.y) * i) / n),
        });
    } else stroke.current.push(p);
  }
  const visible = (p: Point) =>
    p.x * unit >= bounds.x - unit &&
    p.x * unit < bounds.x + bounds.w + unit &&
    p.y * unit + hatPad * zoom >= bounds.y - unit &&
    p.y * unit + hatPad * zoom < bounds.y + bounds.h + unit;
  const fixed = new Set(
      plan.filter((p) => ['repair', 'bridge', 'water'].includes(p.tool)).map((p) => key(p)),
    ),
    bridges = new Set(plan.filter((p) => p.tool === 'bridge').map(key));
  const miniCells = useMemo(
    () =>
      d.cells.map((c) => (
        <rect
          key={key(c)}
          x={c.x}
          y={c.y}
          width="1"
          height="1"
          fill={c.kind === 'tree' ? '#4b897b' : c.kind === 'fire' ? '#d57b61' : '#fff9e9'}
        />
      )),
    [d.cells],
  );
  return (
    <div className="snow-map-wrap">
      <div className="snow-map-tools">
        <span>
          {onPaint ? '点击或拖动布置' : '观看旅程'} · 滚动探索地图
          {hover && ` · 格 ${hover.x},${hover.y}`}
        </span>
        <label>
          地图缩放{' '}
          <select
            aria-label="地图缩放"
            value={zoom}
            onChange={(e) => {
              setZoom(Number(e.target.value));
              requestAnimationFrame(refresh);
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
              <option key={z} value={z}>
                {z * 100}%
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            followRef.current = true;
            setFollowPlayer(true);
            locate(frame ?? d.start);
          }}
        >
          定位雪人
        </button>
        <button
          onClick={() => {
            stopFollow();
            locate(d.home);
          }}
        >
          定位家
        </button>
      </div>
      <div
        className="snow-map-scroll"
        ref={viewport}
        onScroll={() => {
          refresh();
          if (!autoScroll.current && follow) stopFollow();
        }}
        onWheel={stopFollow}
      >
        <svg
          role="application"
          aria-label="雪地地图"
          width={d.width * unit}
          height={(d.height * 40 + hatPad) * zoom}
          viewBox={`0 ${-hatPad} ${d.width * 40} ${d.height * 40 + hatPad}`}
          onPointerDown={(e) => {
            stopFollow();
            if (!onPaint || e.button !== 0) return;
            e.preventDefault();
            if (e.buttons) e.currentTarget.setPointerCapture(e.pointerId);
            stroke.current = [];
            removing.current = e.shiftKey;
            add(at(e));
          }}
          onPointerMove={(e) => {
            const p = at(e);
            setHover(p);
            if (stroke.current.length) add(p);
          }}
          onPointerUp={(e) => {
            if (!stroke.current.length) return;
            add(at(e));
            const points = [...new Map(stroke.current.map((p) => [key(p), p])).values()];
            stroke.current = [];
            if (removing.current) points.forEach((p) => onRemove?.(p));
            else onPaint?.(points);
          }}
          onPointerCancel={() => {
            stroke.current = [];
          }}
        >
          <defs>
            <linearGradient id={id + 'bg'} x2=".5" y2="1">
              <stop stopColor="#c3e4e6" />
              <stop offset="1" stopColor="#edf5ed" />
            </linearGradient>
            <pattern id={id + 'grid'} width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0v40" fill="none" stroke="#6d9ca31a" />
            </pattern>
          </defs>
          <rect y={-hatPad} width="100%" height={d.height * 40 + hatPad} fill={`url(#${id}bg)`} />
          <rect y={-hatPad} width="100%" height={d.height * 40 + hatPad} fill={`url(#${id}grid)`} />
          {d.cells.filter(visible).map((c) => (
            <g key={key(c)} transform={`translate(${c.x * 40} ${c.y * 40})`}>
              <title>{`格 ${c.x},${c.y} ${SNOW_LABELS[c.kind]}`}</title>
              {c.kind !== 'tree' && (
                <rect x="1" y="1" width="38" height="38" rx="6" fill="#fff9e9" stroke="#dfdccc" />
              )}
              <WinterIcon
                kind={
                  bridges.has(key(c))
                    ? 'bridge'
                    : fixed.has(key(c)) ||
                        (collected.has(key(c)) && ['hat', 'carrot'].includes(c.kind))
                      ? 'road'
                      : c.kind
                }
              />
            </g>
          ))}
          {d.pickups
            .filter((p) => visible(p) && !collected.has(key(p)))
            .map((p) => (
              <g key={'pickup:' + key(p)} transform={`translate(${p.x * 40} ${p.y * 40})`}>
                <title>
                  {p.kind === 'hat' ? '帽子' : p.kind === 'snowball' ? '雪球' : '胡萝卜'}
                </title>
                <WinterIcon kind={p.kind} style={p.kind === 'hat' ? p.style : undefined} />
              </g>
            ))}
          {route.length > 0 && (
            <polyline
              className="snow-route"
              points={route.map((p) => `${p.x * 40 + 20},${p.y * 40 + 20}`).join(' ')}
              fill="none"
              stroke="#5688a0"
              strokeWidth="3"
              strokeDasharray="4 8"
              opacity=".6"
            />
          )}
          {plan
            .filter(
              (p) =>
                visible(p) &&
                ((p.tool === 'skis' && !collected.has(key(p))) ||
                  p.tool === 'sign' ||
                  (p.tool === 'snowball' && !collected.has(key(p)))),
            )
            .map((p) => (
              <g key={key(p) + p.tool} transform={`translate(${p.x * 40} ${p.y * 40})`}>
                {p.tool === 'skis' || p.tool === 'snowball' ? (
                  <WinterIcon kind={p.tool} />
                ) : (
                  <g>
                    <rect
                      x="10"
                      y="4"
                      width="25"
                      height="22"
                      rx="4"
                      fill="#dfbd88"
                      stroke="#977548"
                    />
                    <path d="M22 26v12" stroke="#977548" strokeWidth="3" />
                    <text x="22" y="21" fontSize="20" textAnchor="middle" fill="#65503a">
                      {{ right: '→', down: '↓', left: '←', up: '↑' }[p.direction!]}
                    </text>
                  </g>
                )}
              </g>
            ))}
          {d.home && (
            <g transform={`translate(${d.home.x * 40} ${d.home.y * 40})`}>
              <WinterIcon kind="home" />
            </g>
          )}
          {(frame || d.start) && (
            <g
              className="snow-character"
              transform={`translate(${(frame ?? d.start!).x * 40} ${(frame ?? d.start!).y * 40})`}
            >
              <SnowFigure
                mass={frame?.mass ?? d.mass}
                initial={d.mass}
                hats={frame?.hats}
                hatStyles={hatStyles}
                carrot={frame?.carrot}
                ski={frame?.ski}
              />
            </g>
          )}
        </svg>
      </div>
      <div className="snow-map-footer">
        <span>
          {d.width} × {d.height} 格 · 点击小地图跳转
        </span>
        <svg
          aria-label="雪地小地图"
          role="img"
          width="150"
          height="70"
          viewBox={`0 0 ${d.width} ${d.height}`}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            locate({
              x: ((e.clientX - b.left) / b.width) * d.width,
              y: ((e.clientY - b.top) / b.height) * d.height,
            });
          }}
          preserveAspectRatio="none"
        >
          <rect width={d.width} height={d.height} fill="#c3e4e6" />
          {miniCells}
          <rect
            x={bounds.x / unit}
            y={Math.max(0, bounds.y / unit - hatPad / 40)}
            width={Math.min(d.width, bounds.w / unit)}
            height={Math.min(d.height, bounds.h / unit)}
            fill="none"
            stroke="#356a80"
            strokeWidth=".5"
          />
        </svg>
      </div>
    </div>
  );
}
