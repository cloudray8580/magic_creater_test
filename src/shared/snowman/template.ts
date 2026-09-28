import type { SnowmanDocument, Cell, CellKind, Pickup } from './document.js';
export function snowmanTemplate(): SnowmanDocument {
  const cells: Cell[] = [];
  const put = (x: number, y: number, kind: CellKind = 'road') => {
    const old = cells.find((c) => c.x === x && c.y === y);
    if (old) old.kind = kind;
    else cells.push({ x, y, kind });
  };
  for (let x = 2; x <= 23; x++) put(x, 8);
  for (let y = 4; y <= 12; y++) {
    put(5, y);
    put(20, y);
  }
  for (let x = 5; x <= 20; x++) {
    put(x, 4);
    put(x, 12);
  }
  put(10, 8, 'broken');
  put(14, 8, 'fire');
  put(9, 4, 'gap');
  put(10, 4, 'gap');
  const pickups: Pickup[] = [
    { x: 16, y: 4, kind: 'hat', style: 'berry' },
    { x: 17, y: 4, kind: 'hat', style: 'pine' },
    { x: 12, y: 12, kind: 'carrot' },
    { x: 15, y: 12, kind: 'hat', style: 'star' },
    { x: 19, y: 12, kind: 'snowball' },
  ];
  put(7, 12, 'shade');
  put(18, 8, 'ice');
  for (const [x, y] of [
    [2, 3],
    [3, 4],
    [22, 3],
    [24, 4],
    [2, 12],
    [3, 13],
    [23, 12],
    [24, 13],
    [11, 6],
    [17, 10],
  ])
    put(x, y, 'tree');
  return {
    schemaVersion: 3,
    rulesVersion: 2,
    gameType: 'snowman',
    assetPack: 'winter-v1',
    title: '雪人回家',
    description: '短路有火，近路断桥，远路藏着帽子。用有限的材料，铺好最后一段归途。',
    width: 28,
    height: 17,
    cells,
    pickups,
    preparationSeconds: 3,
    start: { x: 2, y: 8 },
    home: { x: 23, y: 8 },
    mass: 18,
    materials: { wood: 6, water: 1, signs: 2, snowballs: 2 },
  };
}
