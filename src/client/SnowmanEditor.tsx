import { useState } from 'react';
import {
  validateSnowman,
  key,
  type SnowmanDocument,
  type Point,
  type CellKind,
  type Pickup,
  type HatStyle,
} from '../shared/snowman/document.js';
import { SnowmanMap, SNOW_LABELS, WinterIcon } from './SnowmanMap.js';
import { NumberInput, TextInput } from './EditorInputs.js';

type Brush =
  | CellKind
  | 'snowball'
  | 'hat:berry'
  | 'hat:pine'
  | 'hat:star'
  | 'hat:wool'
  | 'start'
  | 'home'
  | 'erase';
const TERRAIN: CellKind[] = ['road', 'broken', 'gap', 'fire', 'tree', 'shade', 'ice'];
const HATS: HatStyle[] = ['berry', 'pine', 'star', 'wool'];
export function SnowmanEditor({
  document: raw,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  document: SnowmanDocument;
  onChange: (d: SnowmanDocument) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const d = validateSnowman(raw);
  const [tool, setTool] = useState<Brush>('road');
  const [error, setError] = useState('');
  function change(next: SnowmanDocument) {
    try {
      onChange(validateSnowman(next));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function paint(points: Point[]) {
    const next = structuredClone(d);
    const cells = new Map(next.cells.map((c) => [key(c), c]));
    const pickups = new Map(next.pickups.map((p) => [key(p), p]));
    for (const p of points) {
      const k = key(p);
      if (tool === 'start' || tool === 'home') {
        const other = tool === 'start' ? 'home' : 'start';
        if (next[other] && key(next[other]!) === k) next[other] = null;
        next[tool] = p;
        cells.set(k, { ...p, kind: 'road' });
      } else if (tool === 'erase') {
        if (next.start && key(next.start) === k) next.start = null;
        if (next.home && key(next.home) === k) next.home = null;
        cells.delete(k);
        pickups.delete(k);
      } else if (tool === 'carrot' || tool === 'snowball' || tool.startsWith('hat:')) {
        const item: Pickup = tool.startsWith('hat:')
          ? { ...p, kind: 'hat', style: tool.slice(4) as HatStyle }
          : { ...p, kind: tool as 'carrot' | 'snowball' };
        if (!cells.has(k) || ['tree', 'broken', 'gap'].includes(cells.get(k)!.kind))
          cells.set(k, { ...p, kind: 'road' });
        pickups.set(k, item);
      } else {
        const kind = tool as CellKind;
        if (kind !== 'road') {
          if (next.start && key(next.start) === k) next.start = null;
          if (next.home && key(next.home) === k) next.home = null;
        }
        cells.set(k, { ...p, kind });
        if (['tree', 'broken', 'gap'].includes(kind)) pickups.delete(k);
      }
    }
    next.cells = [...cells.values()];
    next.pickups = [...pickups.values()];
    change(next);
  }
  const brushes: { key: Brush; label: string; icon: string; style?: HatStyle }[] = [
    ...TERRAIN.map((k) => ({ key: k, label: SNOW_LABELS[k], icon: k })),
    ...HATS.map((style) => ({
      key: ('hat:' + style) as Brush,
      label: { berry: '浆果帽', pine: '松针帽', star: '星星帽', wool: '毛线帽' }[style],
      icon: 'hat',
      style,
    })),
    { key: 'carrot', label: '胡萝卜', icon: 'carrot' },
    { key: 'snowball', label: '补给雪球', icon: 'snowball' },
    { key: 'start', label: '雪人起点', icon: 'snowball' },
    { key: 'home', label: '温暖的家', icon: 'home' },
    { key: 'erase', label: '橡皮擦', icon: '' },
  ];
  return (
    <section className="snow-editor panel">
      <div className="snow-editor-settings">
        <label>
          作品名称
          <TextInput value={d.title} maxLength={60} onCommit={(title) => change({ ...d, title })} />
        </label>
        <label>
          旅途介绍
          <TextInput
            value={d.description}
            maxLength={500}
            onCommit={(description) => change({ ...d, description })}
          />
        </label>
        <label>
          地图宽度
          <NumberInput
            value={d.width}
            min={8}
            max={128}
            onCommit={(width) => change({ ...d, width })}
          />
        </label>
        <label>
          地图高度
          <NumberInput
            value={d.height}
            min={8}
            max={128}
            onCommit={(height) => change({ ...d, height })}
          />
        </label>
        <label>
          初始体积
          <NumberInput
            value={d.mass}
            min={1}
            max={300}
            onCommit={(mass) => change({ ...d, mass })}
          />
        </label>
        <label>
          准备时间（秒）
          <NumberInput
            value={d.preparationSeconds}
            min={0}
            max={180}
            onCommit={(preparationSeconds) => change({ ...d, preparationSeconds })}
          />
        </label>
        {(['wood', 'water', 'signs', 'snowballs'] as const).map((k) => (
          <label key={k}>
            {{ wood: '可用木材', water: '可用清水', signs: '可用路牌', snowballs: '可用雪球' }[k]}
            <NumberInput
              value={d.materials[k]}
              min={0}
              max={200}
              onCommit={(v) => change({ ...d, materials: { ...d.materials, [k]: v } })}
            />
          </label>
        ))}
      </div>
      <p>
        先画地形，再点选帽子、胡萝卜或雪球给路上添加惊喜。玩家点击开始后有一段准备时间，
        雪人出发后还能实时救援。地图可扩展到 128 × 128 格；提交前请亲自试玩通关。
      </p>
      <div className="snow-tools" role="group" aria-label="雪地画笔">
        {brushes.map((b) => (
          <button key={b.key} aria-pressed={tool === b.key} onClick={() => setTool(b.key)}>
            {b.icon && (
              <svg width="25" height="25" viewBox="0 0 40 40">
                <WinterIcon kind={b.icon} style={b.style} />
              </svg>
            )}
            {b.label}
          </button>
        ))}
        <button disabled={!canUndo} onClick={onUndo}>
          撤销
        </button>
        <button disabled={!canRedo} onClick={onRedo}>
          重做
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <SnowmanMap document={d} onPaint={paint} />
    </section>
  );
}
