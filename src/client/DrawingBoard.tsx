import { useRef, useState, type PointerEvent } from 'react';
export function DrawingBoard({
  onSave,
  onBusyChange,
}: {
  onSave: (image: Blob) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    past = useRef<ImageData[]>([]),
    drawing = useRef(false);
  const [color, setColor] = useState('#e99b63'),
    [width, setWidth] = useState(12),
    [eraser, setEraser] = useState(false),
    [count, setCount] = useState(0),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const context = () => canvas.current!.getContext('2d')!;
  function remember() {
    past.current.push(context().getImageData(0, 0, 256, 256));
    if (past.current.length > 20) past.current.shift();
    setCount(past.current.length);
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - b.left) * 256) / b.width, y: ((e.clientY - b.top) * 256) / b.height };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 || saving) return;
    e.preventDefault();
    remember();
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = context(),
      p = point(e);
    c.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(p.x, p.y);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (drawing.current) {
      const p = point(e);
      context().lineTo(p.x, p.y);
      context().stroke();
    }
  }
  function finish(e: PointerEvent<HTMLCanvasElement>, cancel = false) {
    if (!drawing.current) return;
    drawing.current = false;
    if (cancel) {
      context().putImageData(past.current.pop()!, 0, 0);
      setCount(past.current.length);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  async function save() {
    if (
      !context()
        .getImageData(0, 0, 256, 256)
        .data.some((v, i) => i % 4 === 3 && v)
    ) {
      setError('先画一点喜欢的东西吧。');
      return;
    }
    setSaving(true);
    onBusyChange?.(true);
    setError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('画作暂时无法导出'))),
          'image/png',
        ),
      );
      await onSave(blob);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }
  return (
    <fieldset className="drawing-board" disabled={saving}>
      <legend>画一个自己的角色或物件</legend>
      <canvas
        ref={canvas}
        width={256}
        height={256}
        aria-label="个人涂鸦画板"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
      />
      <div className="row">
        <label>
          画笔颜色
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          画笔粗细
          <input
            type="range"
            min="2"
            max="40"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="row">
        <button type="button" aria-pressed={eraser} onClick={() => setEraser(!eraser)}>
          {eraser ? '改用画笔' : '使用橡皮'}
        </button>
        <button
          type="button"
          disabled={!count}
          onClick={() => {
            context().putImageData(past.current.pop()!, 0, 0);
            setCount(past.current.length);
          }}
        >
          撤销一笔
        </button>
        <button
          type="button"
          onClick={() => {
            remember();
            context().clearRect(0, 0, 256, 256);
          }}
        >
          清空画板
        </button>
      </div>
      <button type="button" onClick={() => void save()}>
        把画作用到这里
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
