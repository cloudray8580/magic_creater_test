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
    description: '等小桥靠岸，搭桥过溪，再用开关打开前方的门。',
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
    description: '点亮两处电源，取出电池，帮助守灯人照亮归途。',
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
        text: '方向键或 A / D 移动，空格跳跃，按住会跳得更高。弹簧会自动把你弹起；邮票可以自由收集。走到灯笼开关旁按 E，就能打开前面的门。',
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
    if (id === 'moving-bridge') {
      r.name = '溪谷往返小桥';
      r.tiles = r.tiles.filter((t) => t.kind === 'solid' && (t.x <= 15 || t.x >= 26));
      r.objects = r.objects.filter((o) => !['collectible', 'spring'].includes(o.kind));
      r.objects.find((o) => o.id === 'intro')!.text =
        '小桥会自己往返。等它靠近左岸，跳上去站稳；过桥后按 E 操作开关，打开前方的门。跌落会回到检查点。';
      r.objects.find((o) => o.id === 'rest')!.x = 14;
      r.objects.find((o) => o.id === 'lantern-switch')!.x = 29;
      r.objects.find((o) => o.id === 'gate')!.x = 33;
      r.objects.find((o) => o.id === 'flower-a')!.x = 28;
      r.objects.find((o) => o.id === 'finish')!.ending =
        '你找到了小桥的节奏。等一等，也是一种前进。';
      r.objects.push({
        id: 'bridge',
        kind: 'mover',
        x: 16,
        y: 13,
        width: 3,
        route: { x: 24, y: 13 },
        speed: 'slow',
      });
    }
    if (id === 'rooftop-secret') {
      r.name = '星光屋顶';
      r.width = 30;
      r.height = 18;
      doc.start = { roomId: r.id, x: 2, y: 14 };
      r.tiles = [];
      for (let x = 0; x < 30; x++)
        for (let y = 16; y < 18; y++) r.tiles.push({ x, y, kind: 'solid' });
      for (const [left, top] of [
        [5, 13],
        [10, 11],
        [16, 13],
        [21, 11],
      ])
        for (let x = left; x < left + 4; x++) r.tiles.push({ x, y: top, kind: 'oneway' });
      r.objects = [
        {
          id: 'intro',
          kind: 'sign',
          x: 3,
          y: 15,
          text: '三处屋檐藏着三枚必需星星。先去左屋檐，再登中央屋顶，最后绕到右边。按住空格能跳得更高。',
        },
        { id: 'stamp-1', kind: 'collectible', x: 7, y: 12, name: '左屋檐星星', required: true },
        { id: 'stamp-2', kind: 'collectible', x: 12, y: 10, name: '中央屋顶星星', required: true },
        { id: 'stamp-3', kind: 'collectible', x: 23, y: 10, name: '右屋檐星星', required: true },
        { id: 'rest', kind: 'checkpoint', x: 14, y: 15, name: '屋檐下的营地' },
        {
          id: 'hint',
          kind: 'sign',
          x: 17,
          y: 12,
          text: '还缺一枚？从这处矮屋顶，向右边更高的屋檐跳过去。',
        },
        {
          id: 'patrol',
          kind: 'patrol',
          x: 15,
          y: 15,
          route: { x: 19, y: 15 },
          speed: 'slow',
          skin: 'mushroom',
        },
        {
          id: 'finish',
          kind: 'goal',
          x: 28,
          y: 15,
          ending: '三枚星星亮起来了。原来，屋顶也有自己的星空。',
        },
        { id: 'home', kind: 'decoration', x: 25, y: 13, width: 3, height: 3, skin: 'house' },
        { id: 'tree-a', kind: 'decoration', x: 1, y: 12, width: 2, height: 4, skin: 'tree' },
        { id: 'roof-house-a', kind: 'decoration', x: 5, y: 13, width: 4, height: 3, skin: 'house' },
        {
          id: 'roof-house-b',
          kind: 'decoration',
          x: 10,
          y: 11,
          width: 4,
          height: 5,
          skin: 'house',
        },
        {
          id: 'roof-house-c',
          kind: 'decoration',
          x: 21,
          y: 11,
          width: 4,
          height: 5,
          skin: 'house',
        },
      ];
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
  if (id === 'lighthouse') {
    garden.name = '海岸机房';
    garden.ground = 'stone';
    doc.theme = 'dusk';
    doc.music = 'night';
    garden.objects = garden.objects.filter(
      (o) => !['crate', 'plate', 'flower', 'garden-mushroom', 'tree'].includes(o.id),
    );
    garden.objects.find((o) => o.id === 'gift')!.x = 12;
    garden.objects.find((o) => o.id === 'gift')!.y = 4;
    garden.objects.find((o) => o.id === 'door')!.condition = {
      mode: 'all',
      sources: ['power-north', 'power-south'],
    };
    garden.objects.find((o) => o.id === 'welcome')!.text =
      '两台电源都亮起来，电池仓门才会打开。去上面和下面找开关，在旁边按 E。拿到电池后，把它交给灯塔的守灯人。';
    garden.objects.push(
      { id: 'power-north', kind: 'switch', x: 4, y: 3, name: '北侧电源' },
      { id: 'power-south', kind: 'switch', x: 7, y: 9, name: '南侧电源' },
      {
        id: 'battery-sign',
        kind: 'sign',
        x: 12,
        y: 3,
        text: '电池在这里。仓门由两处电源共同控制，找到电池后从右侧小门去灯塔。',
      },
    );
  }
  if (id === 'forest-letter')
    garden.objects.push({
      id: 'box-hint',
      kind: 'sign',
      x: 5,
      y: 5,
      text: '你离开石板，门就会关。让箱子留在石板上吧！推错时按 Z 撤销一步。',
    });
  if (id === 'secret-home') {
    garden.objects = garden.objects.filter((o) => !['crate', 'plate', 'door'].includes(o.id));
    garden.tiles = garden.tiles.filter((t) => t.x !== 9 || t.y === 0 || t.y === garden.height - 1);
    garden.objects.find((o) => o.id === 'gift')!.required = false;
    garden.objects.find((o) => o.id === 'welcome')!.text =
      '欢迎做客。去和右边的小猫聊聊吧。你可以带一封信，也可以两手空空来听故事；不同选择会留下不同的结局。';
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
            condition: { mode: 'all', sources: ['gift'] },
            text: '欢迎来我的小屋。你带来了一封信！想在这里做什么？',
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
              { label: '我想再逛逛小屋', setFlag: 'stayed' },
            ],
          },
          {
            id: 'welcome-empty',
            text: '不带礼物也欢迎你。一起看看窗外吧？',
            choices: [
              {
                label: '一起看星星',
                setFlag: 'stayed',
                ending: '我们把灯关小，一起听见了星星的声音。',
              },
              { label: '我去找一份礼物' },
              { label: '我想再逛逛小屋', setFlag: 'stayed' },
            ],
          },
        ],
      },
      {
        id: 'home-end',
        kind: 'goal',
        condition: { mode: 'all', sources: ['flag:stayed'] },
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
      name: id === 'lighthouse' ? '去灯塔' : '去森林',
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
              ? '灯塔还缺一块电池。点亮机房的两台电源，就能打开电池仓。'
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
