import type { CreativeDocument } from '../shared/creative.js';
import type { Location } from '../shared/adventure/document.js';
export function FeedbackMap({
  document: doc,
  location,
}: {
  document: CreativeDocument;
  location: Location;
}) {
  const room =
    doc.schemaVersion === 2 ? doc.rooms.find((r) => r.id === location.roomId) : undefined;
  if (!room) return <p role="alert">这个版本没有对应的房间。</p>;
  return (
    <figure className="feedback-map">
      <figcaption>
        当时版本：{doc.title} · {room.name} · 格 {location.x},{location.y}
      </figcaption>
      <svg
        role="img"
        aria-label={'反馈位置 ' + room.name + ' ' + location.x + ',' + location.y}
        viewBox={'0 0 ' + room.width * 12 + ' ' + room.height * 12}
      >
        <rect width="100%" height="100%" fill="#e0ebd7" />
        {room.tiles.map((t) => (
          <rect
            key={t.x + ',' + t.y}
            x={t.x * 12}
            y={t.y * 12}
            width={12}
            height={12}
            fill={t.kind === 'water' ? '#91bbd0' : '#739080'}
          />
        ))}
        {room.objects.map((o) => (
          <rect
            key={o.id}
            x={o.x * 12 + 1}
            y={o.y * 12 + 1}
            width={(o.width ?? 1) * 12 - 2}
            height={(o.height ?? 1) * 12 - 2}
            rx={2}
            fill={o.kind === 'decoration' ? '#aec493' : '#b397bd'}
          />
        ))}
        <circle
          cx={(location.x + 0.5) * 12}
          cy={(location.y + 0.5) * 12}
          r={6}
          fill="#f0b14b"
          stroke="#713f27"
          strokeWidth={2}
        />
        <path
          d={'M' + (location.x + 0.5) * 12 + ' ' + (location.y + 0.5) * 12 + 'v-16l10 4-10 4'}
          fill="#bc4e45"
          stroke="#713f27"
        />
      </svg>
      <p>黄点是玩家主动记录的位置。背景是该次提交的地图示意。</p>
    </figure>
  );
}
