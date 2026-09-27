import { useEffect, useRef } from 'react';
import type { Room, Location } from '../shared/adventure/document.js';
import type { Area } from '../shared/adventure/spatial.js';
export function WorldMinimap({
  room,
  area,
  start,
  onNavigate,
}: {
  room: Room;
  area: Area;
  start: Location | null;
  onNavigate: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      ctx = c.getContext('2d')!,
      sx = c.width / room.width,
      sy = c.height / room.height;
    ctx.fillStyle = '#e1eadc';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const t of room.tiles) {
      ctx.fillStyle = t.kind === 'water' ? '#689faf' : '#587c62';
      ctx.fillRect(t.x * sx, t.y * sy, Math.max(1, sx), Math.max(1, sy));
    }
    for (const o of room.objects) {
      ctx.fillStyle =
        o.kind === 'goal' ? '#be7840' : o.kind === 'decoration' ? '#a2b68b' : '#996f9f';
      ctx.fillRect(
        o.x * sx,
        o.y * sy,
        Math.max(2, (o.width ?? 1) * sx),
        Math.max(2, (o.height ?? 1) * sy),
      );
    }
    if (start?.roomId === room.id) {
      ctx.fillStyle = '#d14840';
      ctx.fillRect(start.x * sx - 2, start.y * sy - 2, 4, 4);
    }
    ctx.strokeStyle = '#d57832';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.max(1, area.x * sx),
      Math.max(1, area.y * sy),
      Math.min(c.width - 2, area.width * sx),
      Math.min(c.height - 2, area.height * sy),
    );
  }, [room, area, start]);
  const locate = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    onNavigate(
      Math.max(0, Math.min(room.width, ((e.clientX - b.left) / b.width) * room.width)),
      Math.max(0, Math.min(room.height, ((e.clientY - b.top) / b.height) * room.height)),
    );
  };
  return (
    <div className="world-minimap">
      <span>小地图 · 点击定位</span>
      <canvas
        ref={ref}
        width={320}
        height={72}
        role="img"
        aria-label="小地图，点击定位，方向键平移"
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          locate(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) locate(e);
        }}
        onKeyDown={(e) => {
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-8, 0],
            ArrowRight: [8, 0],
            ArrowUp: [0, -4],
            ArrowDown: [0, 4],
          };
          if (d[e.key]) {
            e.preventDefault();
            onNavigate(
              area.x + area.width / 2 + d[e.key][0],
              area.y + area.height / 2 + d[e.key][1],
            );
          }
        }}
      />
    </div>
  );
}
