import type { AdventureDocument, Room, WorldObject } from './document.js';
export const TEMPLATE_IDS = [
  'cloud-post',
  'moving-bridge',
  'rooftop-secret',
  'forest-letter',
  'lighthouse',
  'secret-home',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const TEMPLATE_INFO: Record<
  TemplateId,
  { title: string; description: string; kind: 'platformer' | 'story' }
> = {
  'cloud-post': {
    title: '云间邮差',
    description: '跃上树梢，收集邮票，把信送到树屋。',
    kind: 'platformer',
  },
  'moving-bridge': {
    title: '会移动的桥',
    description: '按下开关，搭上小桥，走向另一边的灯火。',
    kind: 'platformer',
  },
  'rooftop-secret': {
    title: '屋顶秘密',
    description: '屋顶上的路牌藏着线索，试着找到三枚星星。',
    kind: 'platformer',
  },
  'forest-letter': {
    title: '森林里的来信',
    description: '把信带给狐狸。先想办法打开通往森林的门。',
    kind: 'story',
  },
  lighthouse: {
    title: '找回灯塔的光',
    description: '找到电池，帮助守灯人照亮回家的路。',
    kind: 'story',
  },
  'secret-home': {
    title: '我的秘密小屋',
    description: '来做客吧！一间可以藏故事、礼物与秘密的小屋。',
    kind: 'story',
  },
};
function room(
  id: string,
  name: string,
  width: number,
  height: number,
  ground: Room['ground'] = 'grass',
): Room {
  return { id, name, width, height, ground, tiles: [], objects: [] };
}
function border(r: Room) {
  for (let x = 0; x < r.width; x++)
    for (let y = 0; y < r.height; y++)
      if (x === 0 || y === 0 || x === r.width - 1 || y === r.height - 1)
        r.tiles.push({ x, y, kind: 'solid' });
}
export function adventureTemplate(id: TemplateId = 'cloud-post'): AdventureDocument {
  const info = TEMPLATE_INFO[id];
  const doc: AdventureDocument = {
    schemaVersion: 2,
    rulesVersion: 1,
    gameType: info.kind,
    assetPack: 'storybook-v1',
    title: info.title,
    description: info.description,
    theme: id === 'secret-home' ? 'cottage' : id === 'rooftop-secret' ? 'dusk' : 'forest',
    music: id === 'rooftop-secret' || id === 'secret-home' ? 'night' : 'meadow',
    hero: { skin: 'fox', tint: '#ffffff', accessory: 'scarf' },
    flags: [],
    rooms: [],
    start: null,
  };
  if (info.kind === 'platformer') {
    const r = room('trail', '云间小径', 42, 16);
    doc.rooms = [r];
    doc.start = { roomId: r.id, x: 2, y: 12 };
    // A safe lower route with optional raised discoveries. The bridge template has a real gap.
    for (let x = 0; x < r.width; x++)
      if (!(id === 'moving-bridge' && x >= 16 && x <= 20))
        for (let y = 14; y < 16; y++) r.tiles.push({ x, y, kind: 'solid' });
    for (const [left, top, length] of [
      [7, 11, 3],
      [12, 9, 3],
      [25, 11, 4],
      [33, 10, 3],
    ])
      for (let x = left; x < left + length; x++) r.tiles.push({ x, y: top, kind: 'oneway' });
    r.objects = [
      {
        id: 'intro',
        kind: 'sign',
        x: 3,
        y: 13,
        text: '方向键或 A / D 移动，空格跳跃。按住会跳得更高，E 阅读路牌。',
      },
      { id: 'stamp-1', kind: 'collectible', x: 9, y: 10, name: '屋顶邮票' },
      { id: 'stamp-2', kind: 'collectible', x: 14, y: 8, name: '云朵邮票' },
      { id: 'stamp-3', kind: 'collectible', x: 27, y: 10, name: '叶子邮票' },
      { id: 'spring', kind: 'spring', x: 11, y: 13 },
      { id: 'rest', kind: 'checkpoint', x: 15, y: 13, name: '小小营地' },
      { id: 'lantern-switch', kind: 'switch', x: 24, y: 13, name: '灯笼开关' },
      {
        id: 'gate',
        kind: 'door',
        x: 30,
        y: 12,
        height: 2,
        condition: { mode: 'all', sources: ['lantern-switch'] },
      },
      { id: 'finish', kind: 'goal', x: 39, y: 13, ending: '信送到了！谢谢你走过这段小小的冒险。' },
      { id: 'home', kind: 'decoration', x: 37, y: 11, width: 3, height: 3, skin: 'house' },
      { id: 'tree-a', kind: 'decoration', x: 4, y: 10, width: 2, height: 4, skin: 'tree' },
      { id: 'flower-a', kind: 'decoration', x: 21, y: 13, skin: 'flower' },
    ];
    if (id === 'moving-bridge')
      r.objects.push({
        id: 'bridge',
        kind: 'mover',
        x: 16,
        y: 13,
        width: 3,
        route: { x: 20, y: 13 },
        speed: 'slow',
      });
    if (id === 'rooftop-secret') {
      for (const o of r.objects) if (o.kind === 'collectible') o.required = true;
      r.objects.push({
        id: 'patrol',
        kind: 'patrol',
        x: 19,
        y: 13,
        route: { x: 22, y: 13 },
        speed: 'slow',
        skin: 'mushroom',
      });
      r.objects.find((o) => o.id === 'finish')!.ending =
        '三枚星星亮起来了。原来，屋顶也有自己的星空。';
    }
    return doc;
  }
  const garden = room(
    'garden',
    id === 'secret-home' ? '温暖的小屋' : '林间花园',
    16,
    12,
    id === 'secret-home' ? 'wood' : 'grass',
  );
  border(garden);
  doc.rooms = [garden];
  doc.start = { roomId: garden.id, x: 2, y: 7 };
  garden.objects = [
    {
      id: 'welcome',
      kind: 'sign',
      x: 2,
      y: 6,
      text: '方向键走动，E 与旁边的人或物互动。Z 撤销一步，R 重置房间。',
    },
    {
      id: 'gift',
      kind: 'collectible',
      x: 3,
      y: 8,
      skin: id === 'lighthouse' ? 'battery' : 'letter',
      name: id === 'lighthouse' ? '电池' : '一封来信',
      required: true,
    },
    { id: 'crate', kind: 'box', x: 5, y: 7 },
    { id: 'plate', kind: 'plate', x: 6, y: 7, name: '叶子石板' },
    { id: 'door', kind: 'door', x: 9, y: 7, condition: { mode: 'all', sources: ['plate'] } },
    { id: 'flower', kind: 'decoration', x: 4, y: 3, skin: 'flower' },
    { id: 'garden-bench', kind: 'decoration', x: 2, y: 2, width: 2, skin: 'bench' },
    { id: 'garden-lamp', kind: 'decoration', x: 7, y: 2, skin: 'lamp' },
    { id: 'garden-mushroom', kind: 'decoration', x: 7, y: 9, skin: 'mushroom' },
    { id: 'garden-flowers', kind: 'decoration', x: 12, y: 9, width: 2, skin: 'flower' },
    { id: 'tree', kind: 'decoration', x: 12, y: 2, width: 2, height: 3, skin: 'tree' },
  ];
  for (let y = 1; y < 11; y++) if (y !== 7) garden.tiles.push({ x: 9, y, kind: 'solid' });
  if (id === 'secret-home') {
    doc.flags = ['stayed'];
    garden.objects.push(
      {
        id: 'host',
        kind: 'npc',
        x: 11,
        y: 5,
        skin: 'cat',
        name: '小猫',
        dialogue: [
          {
            id: 'hello',
            text: '欢迎来我的小屋。你想在这里做什么？',
            choices: [
              {
                label: '一起看星星',
                setFlag: 'stayed',
                ending: '我们把灯关小，一起听见了星星的声音。',
              },
              {
                label: '把信放在桌上',
                takeItem: 'gift',
                setFlag: 'stayed',
                ending: '信静静躺在桌上。明天，会有人带着新的故事来。',
              },
            ],
          },
        ],
      },
      {
        id: 'home-end',
        kind: 'goal',
        x: 13,
        y: 8,
        ending: '谢谢你来做客。也去做一间属于你的小屋吧！',
      },
      { id: 'bench', kind: 'decoration', x: 11, y: 3, width: 2, skin: 'bench' },
    );
  } else {
    const forest = room('forest', id === 'lighthouse' ? '灯塔前' : '狐狸的树屋', 16, 12);
    border(forest);
    doc.rooms.push(forest);
    doc.flags = ['delivered'];
    garden.objects.push({
      id: 'forest-door',
      kind: 'portal',
      x: 13,
      y: 7,
      name: '去森林',
      target: { roomId: forest.id, x: 2, y: 7 },
    });
    const friend: WorldObject = {
      id: 'friend',
      kind: 'npc',
      x: 8,
      y: 5,
      skin: id === 'lighthouse' ? 'robot' : 'fox',
      name: id === 'lighthouse' ? '守灯人' : '狐狸',
      dialogue: [
        {
          id: 'done',
          condition: { mode: 'all', sources: ['flag:delivered'] },
          text: '谢谢你！沿着小路看看前面的灯光吧。',
          choices: [],
        },
        {
          id: 'receive',
          condition: { mode: 'all', sources: ['gift'] },
          text:
            id === 'lighthouse'
              ? '你找到了电池！可以把它交给我吗？'
              : '这是写给我的信吗？谢谢你走了这么远。',
          choices: [
            {
              label: id === 'lighthouse' ? '交出电池' : '把信交给狐狸',
              takeItem: 'gift',
              setFlag: 'delivered',
              next: 'done',
            },
          ],
        },
        {
          id: 'waiting',
          text:
            id === 'lighthouse'
              ? '灯塔还缺一块电池。听说花园里有一块。'
              : '我在等一封信。你在花园里见过它吗？',
          choices: [],
        },
      ],
    };
    forest.objects = [
      friend,
      { id: 'forest-tree', kind: 'decoration', x: 3, y: 1, width: 2, height: 3, skin: 'tree' },
      { id: 'forest-flowers', kind: 'decoration', x: 5, y: 9, width: 2, skin: 'flower' },
      { id: 'forest-bench', kind: 'decoration', x: 10, y: 9, width: 2, skin: 'bench' },
      {
        id: 'back',
        kind: 'portal',
        x: 1,
        y: 7,
        name: '返回花园',
        target: { roomId: garden.id, x: 12, y: 7 },
      },
      {
        id: 'finish',
        kind: 'goal',
        x: 12,
        y: 7,
        condition: { mode: 'all', sources: ['flag:delivered'] },
        ending:
          id === 'lighthouse'
            ? '灯塔亮起来了。每一艘小船，都能找到回家的方向。'
            : '狐狸读到了远方的问候。一个小小的世界，因为你变得温暖。',
      },
      { id: 'cottage', kind: 'decoration', x: 10, y: 2, width: 3, height: 3, skin: 'house' },
      { id: 'lamp', kind: 'decoration', x: 11, y: 7, skin: 'lamp' },
    ];
  }
  return doc;
}
