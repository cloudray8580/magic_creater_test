import { useState } from 'react';
import { startGame, movePlayer, type GameDocument, type ObjectType } from '../shared/game.js';
export const labels: Record<ObjectType | 'erase', string> = {
  spawn: '起点',
  goal: '终点',
  wall: '石墙',
  collectible: '花朵',
  erase: '橡皮擦',
};
export const symbols: Record<ObjectType, string> = {
  spawn: '◉',
  goal: '⚑',
  wall: '▦',
  collectible: '✿',
};
export function Play({ document }: { document: GameDocument }) {
  const [game, setGame] = useState(() => startGame(document));
  const move = (x: number, y: number) => setGame((g) => movePlayer(g, x, y));
  return (
    <section
      className="play"
      aria-label="试玩地图"
      tabIndex={0}
      onKeyDown={(e) => {
        const d: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };
        if (d[e.key]) {
          e.preventDefault();
          move(...d[e.key]);
        }
      }}
    >
      <p>收集所有花朵，再走到旗帜。可以使用方向键或下方按钮。</p>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(' + document.level.width + ',1fr)' }}
      >
        {Array.from({ length: document.level.width * document.level.height }, (_, i) => {
          const x = i % document.level.width,
            y = Math.floor(i / document.level.width),
            obj = document.level.objects.find((o) => o.x === x && o.y === y),
            type = obj && !game.collected.includes(obj.id) ? obj.type : undefined,
            player = x === game.x && y === game.y;
          return (
            <div
              className={'cell ' + (type ?? '') + (player ? ' player' : '')}
              key={i}
              aria-label={
                player ? '玩家 ' + x + ',' + y : (type ? labels[type] : '空地') + ' ' + x + ',' + y
              }
            >
              {player ? '●' : type ? symbols[type] : ''}
            </div>
          );
        })}
      </div>
      <div className="play-status">
        {game.won ? (
          <strong>你完成了这个小世界！</strong>
        ) : (
          <span>
            已收集 {game.collected.length} /{' '}
            {document.level.objects.filter((o) => o.type === 'collectible').length} 朵花 ·{' '}
            {game.steps} 步
          </span>
        )}
      </div>
      <div className="row controls">
        {[
          [0, -1, '向上', '↑'],
          [-1, 0, '向左', '←'],
          [0, 1, '向下', '↓'],
          [1, 0, '向右', '→'],
        ].map(([x, y, label, symbol]) => (
          <button
            type="button"
            key={label}
            aria-label={String(label)}
            onClick={() => move(Number(x), Number(y))}
          >
            {symbol}
          </button>
        ))}
        <button type="button" onClick={() => setGame(startGame(document))}>
          重新开始
        </button>
      </div>
    </section>
  );
}
