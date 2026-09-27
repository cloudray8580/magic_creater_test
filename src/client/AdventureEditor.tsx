import { tileTexture } from './adventure/view.js';
import {
  selectArea,
  selectionBounds,
  transformSelection,
  deleteSelection,
  type WorldSelection,
} from '../shared/adventure/selection.js';
import { validateCreative } from '../shared/creative.js';
import { AssetPanel } from './AssetPanel.js';
import { HeroPreview } from './HeroPreview.js';
import { useAssetUrls, imageUrl } from './assets.js';
import { flushSync } from 'react-dom';
import { updateDialoguePage } from '../shared/adventure/story-editor.js';
import { NumberInput } from './EditorInputs.js';
import { ConditionEditor, StoryObjectPanel, StoryWorldPanel } from './StoryPanels.js';
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BUILTIN_SKINS,
  type AdventureDocument,
  type Location,
  type WorldObject,
} from '../shared/adventure/document.js';
import {
  paintWorld,
  moveObject,
  copyObject,
  removeObject,
  updateObject,
  resizeRoom,
  referencesTo,
  strokeCells,
  objectLayer,
  type PaintTool,
  type EditLayer,
  type Cell,
} from '../shared/adventure/editor.js';
const CELL = 40;
const NAMES: Record<string, string> = {
  select: '选择 / 移动',
  marquee: '框选',
  spawn: '起点',
  solid: '地面',
  oneway: '单向平台',
  water: '水面',
  collectible: '星星',
  key: '钥匙',
  checkpoint: '检查点',
  spring: '弹簧',
  mover: '移动平台',
  switch: '开关',
  door: '门',
  hazard: '危险',
  patrol: '巡逻物',
  sign: '路牌',
  goal: '终点',
  erase: '橡皮擦',
  tree: '树',
  flower: '花',
  house: '小屋',
  lamp: '灯',
  mushroom: '蘑菇',
  bench: '长椅',
  rock: '石头',
  box: '箱子',
  plate: '压力板',
  portal: '传送门',
  npc: '朋友',
};
const PLATFORM_TOOLS = [
  'spawn',
  'solid',
  'oneway',
  'water',
  'collectible',
  'key',
  'checkpoint',
  'spring',
  'mover',
  'switch',
  'door',
  'hazard',
  'patrol',
  'sign',
  'goal',
] as PaintTool[];
const STORY_TOOLS = [
  'spawn',
  'solid',
  'water',
  'collectible',
  'key',
  'box',
  'plate',
  'switch',
  'door',
  'portal',
  'npc',
  'sign',
  'goal',
] as PaintTool[];
const DECOR = ['tree', 'flower', 'house', 'lamp', 'mushroom', 'bench', 'rock'] as PaintTool[];
function texture(tool: string) {
  if (tool === 'decoration') return 'tree';
  return tool === 'solid'
    ? 'grass-edge'
    : tool === 'patrol'
      ? 'bird'
      : tool === 'npc'
        ? 'cat'
        : tool;
}
interface Props {
  userId?: string;
  onAssetBusy?: (busy: boolean) => void;
  document: AdventureDocument;
  onChange: (document: AdventureDocument) => void;
  onPreviewFrom: (from: Location) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
export function AdventureEditor({
  document: doc,
  userId = '',
  onAssetBusy,
  onChange,
  onPreviewFrom,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const assets = useAssetUrls(doc, userId);
  const [roomId, setRoomId] = useState(doc.rooms[0].id),
    [tool, setTool] = useState<PaintTool | 'select' | 'marquee'>('select'),
    [layer, setLayer] = useState<EditLayer>('objects');
  const [selected, setSelected] = useState(''),
    [zoom, setZoom] = useState(0.9),
    [notice, setNotice] = useState('选一个素材，再把它放进世界。');
  const [draft, setDraft] = useState<AdventureDocument>(),
    [pick, setPick] = useState<'route' | 'condition' | { pageId: string } | null>(null),
    [cursor, setCursor] = useState<Cell>({ x: 2, y: 2 }),
    [previewCell, setPreviewCell] = useState<Cell>({ x: 2, y: 2 });
  const scroll = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const stroke = useRef<{ next: AdventureDocument; last: Cell } | null>(null),
    drag = useRef<{ id: string; start: Cell; offset: Cell } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [portalPick, setPortalPick] = useState<{ objectId: string; returnRoom: string } | null>(
    null,
  );
  const [group, setGroup] = useState<WorldSelection | null>(null),
    [copyGroup, setCopyGroup] = useState(false),
    [marquee, setMarquee] = useState<{ start: Cell; end: Cell } | null>(null);
  const groupDrag = useRef<{ selection: WorldSelection; start: Cell } | null>(null);
  function clearGroup() {
    setGroup(null);
    setCopyGroup(false);
    setMarquee(null);
    groupDrag.current = null;
  }
  function historyAction(redo = false) {
    clearGroup();
    redo ? onRedo() : onUndo();
  }
  let groupBounds: ReturnType<typeof selectionBounds> = null;
  if (group) {
    try {
      groupBounds = selectionBounds(doc, group);
    } catch {
      /* A changed draft requires a new selection. */
    }
  }
  const gridId = useId();
  const current = draft ?? doc,
    room = current.rooms.find((r) => r.id === roomId) ?? current.rooms[0];
  const object = room.objects.find((o) => o.id === selected);
  const latest = useRef({ doc, room, onChange });
  latest.current = { doc, room, onChange };
  function chooseImage(skin: string, objectId?: string) {
    const current = latest.current;
    const apply = (document: AdventureDocument) =>
      objectId
        ? updateObject(document, objectId, { skin })
        : (validateCreative({
            ...document,
            hero: { ...document.hero, skin },
          }) as AdventureDocument);
    const next = apply(current.doc);
    const pending = stroke.current ? apply(stroke.current.next) : undefined;
    current.onChange(next);
    if (pending && stroke.current) {
      stroke.current.next = pending;
      setDraft(pending);
    }
  }
  function safely(work: () => void) {
    try {
      work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '这一步没有完成');
    }
  }
  function change(work: () => AdventureDocument) {
    safely(() => onChange(work()));
  }
  function selectRoom(id: string) {
    clearGroup();
    setRoomId(id);
    setSelected('');
    setPortalPick(null);
    setPick(null);
    setCursor({ x: 2, y: 2 });
    setPreviewCell({ x: 2, y: 2 });
  }
  function choose(next: PaintTool | 'select' | 'marquee') {
    clearGroup();
    if (next === 'marquee') setSelected('');
    setTool(next);
    setPick(null);
    if (['solid', 'oneway', 'water'].includes(next)) setLayer('terrain');
    else if (DECOR.includes(next as PaintTool)) setLayer('decoration');
    else if (next !== 'erase' && next !== 'select' && next !== 'marquee') setLayer('objects');
    setNotice(
      next === 'marquee'
        ? '拖出矩形选择当前图层，拖动选区整体移动。'
        : next === 'select'
          ? '点选物体查看属性，拖动可以移动。'
          : `已选择${NAMES[next]}，点击或拖动画布放置。`,
    );
  }
  function point(e: ReactPointerEvent<SVGSVGElement>): Cell {
    const room = latest.current.room;
    const bounds = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - bounds.left) / bounds.width) * room.width),
      y: Math.floor(((e.clientY - bounds.top) / bounds.height) * room.height),
    };
  }

  function hit(p: Cell): WorldObject | undefined {
    return [...latest.current.room.objects]
      .reverse()
      .find(
        (o) =>
          objectLayer(o) === layer &&
          p.x >= o.x &&
          p.y >= o.y &&
          p.x < o.x + (o.width ?? 1) &&
          p.y < o.y + (o.height ?? 1),
      );
  }
  function draw(p: Cell) {
    if (!stroke.current || tool === 'select' || tool === 'marquee') return;
    try {
      const next = paintWorld(
        stroke.current.next,
        room.id,
        strokeCells(stroke.current.last, p),
        tool,
        layer,
      );
      stroke.current = { next, last: p };
      setDraft(next);
    } catch (e) {
      stroke.current = null;
      setDraft(undefined);
      setNotice((e as Error).message);
      const existing = hit(p);
      if (existing) setSelected(existing.id);
    }
  }
  function pointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.preventDefault();
    // Commit any focused property before the map captures the next editing snapshot.
    const canvas = e.currentTarget;
    flushSync(() => canvas.focus({ preventScroll: true }));
    const currentDoc = latest.current.doc,
      currentRoom = latest.current.room;
    const currentObject = currentRoom.objects.find((o) => o.id === selected);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.altKey) {
      const s = scroll.current!;
      pan.current = { x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop };
      return;
    }
    if (e.button !== 0) return;
    const p = point(e);
    setCursor(p);
    setPreviewCell(p);
    if (portalPick) {
      safely(() => {
        const next = updateObject(currentDoc, portalPick.objectId, {
          target: { roomId: currentRoom.id, ...p },
        });
        onChange(next);
        selectRoom(portalPick.returnRoom);
        setSelected(portalPick.objectId);
        setNotice('已设置落点。试玩时会检查是否能站立。');
      });
      return;
    }
    if (pick && currentObject) {
      if (pick === 'route') change(() => updateObject(currentDoc, currentObject.id, { route: p }));
      else {
        const target = [...currentRoom.objects]
          .reverse()
          .find(
            (o) =>
              o.x === p.x &&
              o.y === p.y &&
              ['collectible', 'key', 'switch', 'plate'].includes(o.kind),
          );
        if (!target) {
          setNotice('请点击开关、压力板或收集物。');
          return;
        }
        const previous =
          typeof pick === 'object'
            ? currentObject.dialogue?.find((page) => page.id === pick.pageId)?.condition
            : currentObject.condition;
        const sources = previous?.sources ?? [];
        const condition = {
          mode: previous?.mode ?? ('all' as const),
          sources: sources.includes(target.id)
            ? sources.filter((id) => id !== target.id)
            : [...sources, target.id],
        };
        change(() =>
          typeof pick === 'object'
            ? updateDialoguePage(currentDoc, currentObject.id, pick.pageId, { condition })
            : updateObject(currentDoc, currentObject.id, { condition }),
        );
      }
      setPick(null);
      return;
    }
    if (tool === 'marquee') {
      setSelected('');
      if (copyGroup && group) {
        safely(() => {
          const bounds = selectionBounds(currentDoc, { ...group, includesStart: false });
          if (!bounds) throw new Error('起点只有一个，不能复制；请框选其他内容');
          const result = transformSelection(
            currentDoc,
            group,
            p.x - bounds.x,
            p.y - bounds.y,
            true,
          );
          latest.current.onChange(result.document);
          setGroup(result.selection);
          setCopyGroup(false);
          setNotice('已复制选区，组内连接也已复制。');
        });
      } else if (
        group &&
        groupBounds &&
        p.x >= groupBounds.x &&
        p.y >= groupBounds.y &&
        p.x < groupBounds.x + groupBounds.width &&
        p.y < groupBounds.y + groupBounds.height
      ) {
        groupDrag.current = { selection: group, start: p };
      } else {
        setGroup(null);
        setMarquee({ start: p, end: p });
      }
      return;
    }
    if (tool === 'select') {
      const o = hit(p);
      const start =
        currentDoc.start?.roomId === currentRoom.id &&
        currentDoc.start.x === p.x &&
        currentDoc.start.y === p.y;
      const id = o?.id ?? (start ? '@start' : '');
      setSelected(id);
      if (id)
        drag.current = {
          id,
          start: p,
          offset: o ? { x: p.x - o.x, y: p.y - o.y } : { x: 0, y: 0 },
        };
    } else {
      stroke.current = { next: currentDoc, last: p };
      draw(p);
    }
  }
  function finish(e: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    if (!cancel && marquee) {
      safely(() => {
        const selection = selectArea(
          latest.current.doc,
          latest.current.room.id,
          layer,
          marquee.start,
          point(e),
        );
        setGroup(selection);
        setNotice(
          selectionBounds(latest.current.doc, selection)
            ? '选区已建立，可以移动、复制或删除。'
            : '选区为空，请重新框选。',
        );
      });
    }
    if (!cancel && groupDrag.current) {
      const d = groupDrag.current,
        p = point(e);
      if (p.x !== d.start.x || p.y !== d.start.y)
        safely(() => {
          const result = transformSelection(
            latest.current.doc,
            d.selection,
            p.x - d.start.x,
            p.y - d.start.y,
            false,
          );
          latest.current.onChange(result.document);
          setGroup(result.selection);
          setNotice('已移动选区，可一次撤销。');
        });
    }
    groupDrag.current = null;
    setMarquee(null);
    if (!cancel && stroke.current) onChange(stroke.current.next);
    if (!cancel && drag.current) {
      const p = point(e),
        d = drag.current;
      if (p.x !== d.start.x || p.y !== d.start.y)
        change(() =>
          d.id === '@start'
            ? paintWorld(doc, room.id, [p], 'spawn', 'objects')
            : moveObject(doc, d.id, p.x - d.offset.x, p.y - d.offset.y),
        );
    }
    stroke.current = null;
    drag.current = null;
    pan.current = null;
    setDraft(undefined);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function patch(patch: Partial<WorldObject>) {
    if (object) change(() => updateObject(doc, object.id, patch));
  }
  function remove() {
    if (group) {
      const external = group.objectIds
        .flatMap((id) => referencesTo(doc, id))
        .filter((id) => !group.objectIds.includes(id));
      if (
        external.length &&
        !window.confirm('外部机关或对话引用了选区。删除会清理连接，空条件的门会打开。确认删除？')
      )
        return;
      safely(() => {
        onChange(deleteSelection(doc, group, true));
        clearGroup();
        setNotice('已删除选区，可一次撤销。');
      });
      return;
    }
    if (!object) return;
    const refs = referencesTo(doc, object.id);
    if (
      refs.length &&
      !window.confirm(
        `有 ${refs.length} 个机关或对话引用这个物体。删除会清除连接，空条件的门会打开。确认删除？`,
      )
    )
      return;
    change(() => removeObject(doc, object.id, true));
    setSelected('');
  }
  const tools = doc.gameType === 'platformer' ? PLATFORM_TOOLS : STORY_TOOLS;
  return (
    <div className="world-editor">
      <aside className="editor-palette panel">
        <h3>放进世界</h3>
        <div className="palette-grid">
          {(['select', 'marquee', ...tools, ...DECOR, 'erase'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tool === t ? 'selected' : ''}
              aria-pressed={tool === t}
              aria-label={NAMES[t]}
              onClick={() => choose(t)}
            >
              {!['select', 'marquee', 'spawn', 'erase'].includes(t) ? (
                <img src={`/art/storybook-v1/${texture(t)}.svg`} alt="" />
              ) : (
                <b>{t === 'spawn' ? '起' : t === 'erase' ? '⌫' : t === 'marquee' ? '▧' : '↖'}</b>
              )}
              <span>{NAMES[t]}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="editor-workbench">
        <div className="editor-toolbar row">
          <label>
            图层
            <select
              aria-label="编辑图层"
              value={layer}
              onChange={(e) => {
                clearGroup();
                setSelected('');
                setLayer(e.target.value as EditLayer);
                setTool('select');
                setPick(null);
              }}
            >
              <option value="terrain">地形</option>
              <option value="objects">物体</option>
              <option value="decoration">装饰</option>
            </select>
          </label>
          <button disabled={!canUndo} onClick={() => historyAction()}>
            撤销
          </button>
          <button disabled={!canRedo} onClick={() => historyAction(true)}>
            重做
          </button>
          <button aria-label="缩小地图" onClick={() => setZoom(Math.max(0.35, zoom - 0.15))}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button aria-label="放大地图" onClick={() => setZoom(Math.min(1.8, zoom + 0.15))}>
            ＋
          </button>
          <button
            onClick={() => {
              setZoom(Math.min(1, (scroll.current?.clientWidth ?? 700) / (room.width * CELL)));
              scroll.current?.scrollTo(0, 0);
            }}
          >
            适合窗口
          </button>
        </div>
        {doc.rooms.length > 1 && (
          <div className="row">
            {doc.rooms.map((r) => (
              <button
                key={r.id}
                disabled={Boolean(portalPick)}
                aria-pressed={room.id === r.id}
                onClick={() => {
                  selectRoom(r.id);
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        {portalPick && (
          <div className="portal-pick">
            <strong>在这个房间点击门的落点</strong>
            <button
              onClick={() => {
                const prior = portalPick;
                selectRoom(prior.returnRoom);
                setSelected(prior.objectId);
              }}
            >
              取消选落点
            </button>
          </div>
        )}
        <div className="editor-scroll" ref={scroll}>
          <svg
            ref={svg}
            className="world-canvas"
            role="application"
            aria-label="关卡画布"
            tabIndex={0}
            width={room.width * CELL * zoom}
            height={room.height * CELL * zoom}
            viewBox={`0 0 ${room.width * CELL} ${room.height * CELL}`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={pointerDown}
            onPointerMove={(e) => {
              if (pan.current) {
                scroll.current!.scrollTo(
                  pan.current.left - e.clientX + pan.current.x,
                  pan.current.top - e.clientY + pan.current.y,
                );
                return;
              }
              const p = point(e);
              setCursor(p);
              if (marquee) setMarquee({ ...marquee, end: p });
              if (stroke.current) draw(p);
            }}
            onPointerUp={(e) => finish(e)}
            onPointerCancel={(e) => finish(e, true)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                historyAction(e.shiftKey);
              }
              if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                remove();
              }
            }}
          >
            <defs>
              <pattern
                id={gridId + '-floor'}
                width={CELL}
                height={CELL}
                patternUnits="userSpaceOnUse"
              >
                <image
                  href={'/art/storybook-v1/' + room.ground + '.svg'}
                  width={CELL}
                  height={CELL}
                  opacity=".65"
                />
              </pattern>
              <pattern id={gridId} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                <path d={`M${CELL} 0H0V${CELL}`} fill="none" stroke="#638578" strokeOpacity=".22" />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill={doc.gameType === 'story' ? `url(#${gridId}-floor)` : '#d5e8df'}
            />
            {room.tiles.map((t) => (
              <image
                key={`${t.x},${t.y}`}
                x={t.x * CELL}
                y={t.y * CELL}
                width={CELL}
                height={CELL}
                href={`/art/storybook-v1/${tileTexture(doc.gameType, room, t)}.svg`}
              />
            ))}
            {room.objects.map((o) => (
              <g
                key={o.id}
                data-object-id={o.id}
                aria-label={`${o.name || NAMES[o.kind]} ${o.x},${o.y}`}
                opacity={objectLayer(o) !== layer && tool === 'erase' ? 0.45 : 1}
              >
                <image
                  x={o.x * CELL}
                  y={o.y * CELL}
                  width={(o.width ?? 1) * CELL}
                  height={(o.height ?? 1) * CELL}
                  href={imageUrl(o.skin ?? texture(o.kind), assets.urls)}
                  preserveAspectRatio={o.skin?.startsWith('asset:') ? 'xMidYMax meet' : 'none'}
                />
                {o.required && (
                  <text
                    x={(o.x + 0.72) * CELL}
                    y={(o.y + 0.25) * CELL}
                    fontSize="12"
                    fill="#825326"
                  >
                    ★
                  </text>
                )}
                {(selected === o.id || group?.objectIds.includes(o.id)) && (
                  <rect
                    x={o.x * CELL + 1}
                    y={o.y * CELL + 1}
                    width={(o.width ?? 1) * CELL - 2}
                    height={(o.height ?? 1) * CELL - 2}
                    fill="none"
                    stroke="#bd7926"
                    strokeWidth="3"
                  />
                )}
              </g>
            ))}
            {room.objects.flatMap((o) =>
              [
                ...new Set([
                  ...(o.condition?.sources ?? []),
                  ...(o.dialogue ?? []).flatMap((page) => page.condition?.sources ?? []),
                ]),
              ].map((source) => {
                const target = room.objects.find((t) => t.id === source);
                return target ? (
                  <line
                    key={o.id + source}
                    x1={(o.x + 0.5) * CELL}
                    y1={(o.y + 0.5) * CELL}
                    x2={(target.x + 0.5) * CELL}
                    y2={(target.y + 0.5) * CELL}
                    stroke="#9976b0"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                    opacity={selected === o.id ? 1 : 0.3}
                  />
                ) : null;
              }),
            )}
            {object?.route && (
              <>
                <line
                  x1={(object.x + 0.5) * CELL}
                  y1={(object.y + 0.5) * CELL}
                  x2={(object.route.x + 0.5) * CELL}
                  y2={(object.route.y + 0.5) * CELL}
                  stroke="#bd7926"
                  strokeWidth="3"
                  strokeDasharray="5"
                />
                <circle
                  cx={(object.route.x + 0.5) * CELL}
                  cy={(object.route.y + 0.5) * CELL}
                  r="6"
                  fill="#bd7926"
                />
              </>
            )}
            {doc.start?.roomId === room.id && (
              <g data-object-id="@start">
                <circle
                  cx={(doc.start.x + 0.5) * CELL}
                  cy={(doc.start.y + 0.5) * CELL}
                  r="16"
                  fill="#fff3bc"
                  stroke="#648568"
                  strokeWidth="2"
                />
                <text
                  x={(doc.start.x + 0.5) * CELL}
                  y={(doc.start.y + 0.62) * CELL}
                  textAnchor="middle"
                  fill="#365e4c"
                  fontSize="14"
                >
                  起
                </text>
              </g>
            )}
            <rect width="100%" height="100%" fill={`url(#${gridId})`} pointerEvents="none" />
            {(marquee || groupBounds) &&
              (() => {
                const b = marquee
                  ? {
                      x: Math.min(marquee.start.x, marquee.end.x),
                      y: Math.min(marquee.start.y, marquee.end.y),
                      width: Math.abs(marquee.end.x - marquee.start.x) + 1,
                      height: Math.abs(marquee.end.y - marquee.start.y) + 1,
                    }
                  : groupBounds!;
                return (
                  <rect
                    data-testid="group-selection"
                    x={b.x * CELL}
                    y={b.y * CELL}
                    width={b.width * CELL}
                    height={b.height * CELL}
                    fill="#edc875"
                    fillOpacity=".16"
                    stroke="#92591c"
                    strokeWidth="3"
                    strokeDasharray="8 4"
                    pointerEvents="none"
                  />
                );
              })()}
          </svg>
        </div>
        <div className="editor-status">
          <span role="status">{notice}</span>
          <span>
            {cursor.x},{cursor.y}
          </span>
        </div>
        {(assets.error || assets.warning) && <p role="alert">{assets.error || assets.warning}</p>}
        <p className="editor-help">
          拖动画笔连续铺设 · Alt＋拖动或鼠标中键平移 · 滚动条查看远处 · 在画布上 Ctrl/Cmd＋Z 撤销
        </p>
        <button onClick={() => onPreviewFrom({ roomId: room.id, ...previewCell })}>
          从格 {previewCell.x},{previewCell.y} 试玩
        </button>
      </section>
      <aside className="editor-properties panel">
        {group && (
          <section aria-label="选区操作">
            <h3>
              选区：{group.objectIds.length + group.tiles.length + Number(group.includesStart)} 项
            </h3>
            <p>只操作当前图层。起点只有一个，不会被复制。</p>
            <button
              onClick={() =>
                safely(() => {
                  if (!selectionBounds(doc, { ...group, includesStart: false }))
                    throw new Error('没有可复制的内容，起点不能复制');
                  setCopyGroup(true);
                  setNotice('点击空白位置作为副本左上角；组内连接跟随副本，传送落点保持原处。');
                })
              }
            >
              复制选区
            </button>
            <button onClick={remove}>删除选区</button>
            <button onClick={clearGroup}>清除选区</button>
            {copyGroup && <p role="status">点击副本的左上角位置</p>}
          </section>
        )}

        {object ? (
          <>
            <h3>{NAMES[object.kind] || '装饰'}的设置</h3>
            <label>
              物体名称
              <input
                maxLength={40}
                value={object.name ?? ''}
                onChange={(e) => patch({ name: e.target.value || undefined })}
              />
            </label>
            <div className="property-pair">
              <label>
                横坐标
                <NumberInput
                  value={object.x}
                  onCommit={(value) => change(() => moveObject(doc, object.id, value, object.y))}
                />
              </label>
              <label>
                纵坐标
                <NumberInput
                  value={object.y}
                  onCommit={(value) => change(() => moveObject(doc, object.id, object.x, value))}
                />
              </label>
            </div>
            <div className="row">
              <button
                onClick={() =>
                  safely(() => {
                    const copied = copyObject(doc, object.id);
                    onChange(copied.document);
                    setSelected(copied.id);
                    setNotice('已复制。新物体沿用原来的机关连接，可在下方修改。');
                  })
                }
              >
                复制物体
              </button>
              <button onClick={remove}>删除物体</button>
            </div>
            {['mover', 'door', 'hazard', 'decoration'].includes(object.kind) && (
              <label>
                宽度（格）
                <NumberInput
                  min={1}
                  max={12}
                  value={object.width ?? 1}
                  onCommit={(value) => patch({ width: value })}
                />
              </label>
            )}
            {['door', 'hazard', 'decoration'].includes(object.kind) && (
              <label>
                高度（格）
                <NumberInput
                  min={1}
                  max={12}
                  value={object.height ?? 1}
                  onCommit={(value) => patch({ height: value })}
                />
              </label>
            )}
            {object.kind === 'collectible' && (
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={Boolean(object.required)}
                  onChange={(e) => patch({ required: e.target.checked })}
                />
                通关必须收集
              </label>
            )}
            {object.kind === 'switch' && doc.gameType === 'platformer' && (
              <label>
                自动关闭秒数（0 为保持）
                <NumberInput
                  min={0}
                  max={30}
                  value={object.seconds ?? 0}
                  onCommit={(value) => patch({ seconds: value })}
                />
              </label>
            )}
            {['mover', 'patrol'].includes(object.kind) && (
              <>
                <label>
                  速度
                  <select
                    value={object.speed ?? 'slow'}
                    onChange={(e) => patch({ speed: e.target.value as 'slow' | 'normal' | 'fast' })}
                  >
                    <option value="slow">慢</option>
                    <option value="normal">中</option>
                    <option value="fast">快</option>
                  </select>
                </label>
                <button
                  onClick={() => {
                    setPick('route');
                    setNotice('请在地图上点击移动的另一端。');
                  }}
                >
                  在地图上设置路线终点
                </button>
              </>
            )}
            {['door', 'goal'].includes(object.kind) && (
              <>
                <h4>开启条件</h4>
                <ConditionEditor
                  document={doc}
                  value={object.condition}
                  onChange={(condition) => patch({ condition })}
                />
                <button
                  onClick={() => {
                    setPick('condition');
                    setNotice('请点击要连接的开关、压力板或收集物，再次点击会断开。');
                  }}
                >
                  在地图上连接机关
                </button>
              </>
            )}
            {object.kind === 'sign' && (
              <label>
                路牌文字
                <textarea
                  maxLength={240}
                  value={object.text ?? ''}
                  onChange={(e) => patch({ text: e.target.value })}
                />
              </label>
            )}
            {object.kind === 'goal' && (
              <label>
                结束时的话
                <textarea
                  maxLength={240}
                  value={object.ending ?? ''}
                  onChange={(e) => patch({ ending: e.target.value })}
                />
              </label>
            )}
            {userId && ['npc', 'decoration', 'collectible', 'key'].includes(object.kind) && (
              <AssetPanel
                key={userId + ':' + object.id}
                userId={userId}
                onBusyChange={onAssetBusy}
                onChoose={(skin) => chooseImage(skin, object.id)}
              />
            )}
            {doc.gameType === 'story' && (
              <StoryObjectPanel
                key={object.id}
                document={doc}
                object={object}
                change={change}
                pickCondition={(pageId) => {
                  setPick({ pageId });
                  setNotice('请点击本房间的开关、压力板或收集物，再次连接会断开。');
                }}
                pickPortal={(id) => {
                  setPortalPick({ objectId: object.id, returnRoom: room.id });
                  clearGroup();
                  setRoomId(id);
                  setSelected('');
                  setPick(null);
                  setNotice('请在目的房间的空闲位置点击。');
                }}
              />
            )}
            <button onClick={() => setSelected('')}>查看世界设置</button>
          </>
        ) : (
          <>
            <h3>世界设置</h3>
            <label>
              作品名称
              <input
                maxLength={60}
                value={doc.title}
                onChange={(e) => onChange({ ...doc, title: e.target.value })}
              />
            </label>
            <label>
              作品简介
              <textarea
                maxLength={240}
                value={doc.description}
                onChange={(e) => onChange({ ...doc, description: e.target.value })}
              />
            </label>
            <label>
              世界氛围
              <select
                value={doc.theme}
                onChange={(e) =>
                  onChange({ ...doc, theme: e.target.value as AdventureDocument['theme'] })
                }
              >
                <option value="forest">清晨森林</option>
                <option value="dusk">黄昏故事</option>
                <option value="cottage">温暖小屋</option>
              </select>
            </label>
            <label>
              背景音乐
              <select
                value={doc.music}
                onChange={(e) =>
                  onChange({ ...doc, music: e.target.value as AdventureDocument['music'] })
                }
              >
                <option value="meadow">林间小调</option>
                <option value="night">夜晚来信</option>
                <option value="none">安静</option>
              </select>
            </label>
            <label>
              主角
              <select
                value={doc.hero.skin}
                onChange={(e) => onChange({ ...doc, hero: { ...doc.hero, skin: e.target.value } })}
              >
                {doc.hero.skin.startsWith('asset:') && (
                  <option value={doc.hero.skin}>我的图片</option>
                )}
                {BUILTIN_SKINS.filter((s) => ['fox', 'cat', 'robot', 'bird'].includes(s)).map(
                  (s) => (
                    <option key={s} value={s}>
                      {
                        (
                          { fox: '小狐狸', cat: '小猫', robot: '小机器人', bird: '小鸟' } as Record<
                            string,
                            string
                          >
                        )[s]
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
            <HeroPreview url={imageUrl(doc.hero.skin, assets.urls)} hero={doc.hero} />
            <label>
              主角色调
              <input
                type="color"
                value={doc.hero.tint}
                onChange={(e) => onChange({ ...doc, hero: { ...doc.hero, tint: e.target.value } })}
              />
            </label>
            <button onClick={() => onChange({ ...doc, hero: { ...doc.hero, tint: '#ffffff' } })}>
              恢复原图颜色
            </button>
            <label>
              主角配件
              <select
                value={doc.hero.accessory}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    hero: {
                      ...doc.hero,
                      accessory: e.target.value as AdventureDocument['hero']['accessory'],
                    },
                  })
                }
              >
                <option value="none">无</option>
                <option value="scarf">围巾</option>
                <option value="hat">帽子</option>
              </select>
            </label>
            {userId && (
              <AssetPanel
                key={userId + ':hero'}
                userId={userId}
                onBusyChange={onAssetBusy}
                onChoose={(skin) => chooseImage(skin)}
              />
            )}
            <div className="property-pair">
              <label>
                地图宽度
                <NumberInput
                  value={room.width}
                  min={4}
                  max={doc.gameType === 'platformer' ? 128 : 32}
                  onCommit={(value) => change(() => resizeRoom(doc, room.id, value, room.height))}
                />
              </label>
              <label>
                地图高度
                <NumberInput
                  value={room.height}
                  min={4}
                  max={doc.gameType === 'platformer' ? 32 : 24}
                  onCommit={(value) => change(() => resizeRoom(doc, room.id, room.width, value))}
                />
              </label>
            </div>
            {doc.gameType === 'story' && (
              <StoryWorldPanel document={doc} room={room} change={change} selectRoom={selectRoom} />
            )}
            <p>先做一小段让人愿意玩的旅程。随时试玩，再回来继续改变它。</p>
          </>
        )}
      </aside>
    </div>
  );
}
