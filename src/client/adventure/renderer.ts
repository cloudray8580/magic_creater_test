import Phaser from 'phaser';
import {
  BUILTIN_SKINS,
  assetReferences,
  type AdventureDocument,
  type Location,
} from '../../shared/adventure/document.js';
import {
  startPlatform,
  stepPlatform,
  platformAction,
  clearPlatformInput,
} from '../../shared/adventure/platform.js';
import { startStory, storyAction, type StoryAction } from '../../shared/adventure/story.js';
import {
  framePlatform,
  frameStory,
  keyboardDirection,
  tileTexture,
  ReadableNotice,
  type GameFrame,
} from './view.js';
import { composeCharacter } from '../character.js';
import { GameAudio } from './audio.js';
const TILE = 48;
const TEXTURES = [
  ...BUILTIN_SKINS,
  'background',
  'cottage-background',
  'grass',
  'earth',
  'grass-edge',
  'stone',
  'wood',
  'water',
  'oneway',
  'mover',
  'collectible',
  'key',
  'box',
  'plate',
  'plate-on',
  'switch',
  'switch-on',
  'door',
  'door-open',
  'checkpoint',
  'checkpoint-on',
  'spring',
  'hazard',
  'sign',
  'portal',
  'goal',
];
export interface GameControls {
  key(code: string, down: boolean): void;
  action(action: StoryAction['type'] | 'respawn', index?: number): void;
  pause(value: boolean): void;
  sound(music: boolean, effects: boolean): void;
  motion(enabled: boolean): void;
  destroy(): void;
}
export function mountAdventure(
  parent: HTMLElement,
  document: AdventureDocument,
  options: {
    assetUrls?: Record<string, string>;
    assist?: boolean;
    from?: Location;
    onFrame: (frame: GameFrame) => void;
    onError: (message: string) => void;
  },
): GameControls {
  let platform = document.gameType === 'platformer' ? startPlatform(document, options) : null;
  let story = document.gameType === 'story' ? startStory(document) : null;
  let frame = platform ? framePlatform(platform) : frameStory(story!);
  const keys = new Set<string>(),
    audio = new GameAudio(document.music);
  let ready = false;
  let paused = true,
    motion = true,
    destroyed = false,
    nextMove = 0,
    reportAt = 0,
    currentTime = 0;
  let previous = frame;
  const readableNotice = new ReadableNotice();
  let snapCamera = false;
  const publish = () => {
    frame = platform ? framePlatform(platform) : frameStory(story!);
    if (frame.deaths !== previous.deaths || frame.room.id !== previous.room.id) snapCamera = true;
    frame.notice = readableNotice.update(frame.notice, currentTime, frame.noticeKey);
    if (frame.ending && !previous.ending) audio.cue('win');
    else if (frame.deaths > previous.deaths) audio.cue('recover');
    else if (frame.collected > previous.collected) audio.cue('collect');
    else if (frame.room.id !== previous.room.id) audio.cue('arrive');
    else if (frame.hero.airborne && !previous.hero.airborne) audio.cue('jump');
    previous = frame;
  };
  class World extends Phaser.Scene {
    private roomId = '';
    private pictures = new Map<string, Phaser.GameObjects.Image>();
    private world: Phaser.GameObjects.GameObject[] = [];
    private hero!: Phaser.GameObjects.Image;
    private shadow!: Phaser.GameObjects.Ellipse;
    private halo!: Phaser.GameObjects.Ellipse;
    preload() {
      for (const name of new Set(TEXTURES))
        this.load.svg(name, '/art/storybook-v1/' + name + '.svg');
      for (const id of assetReferences(document))
        this.load.image(
          'asset:' + id,
          options.assetUrls?.[id] ?? '/api/assets/' + encodeURIComponent(id),
        );
      this.load.on('loaderror', () => options.onError('画面素材加载失败，请刷新后再试。'));
    }
    create() {
      const original = this.textures.get(document.hero.skin).getSourceImage() as HTMLImageElement;
      this.textures.addCanvas(
        'hero-customized',
        composeCharacter(original, document.hero.tint, document.hero.accessory),
      );
      ready = true;
      this.add
        .image(480, 288, document.theme === 'cottage' ? 'cottage-background' : 'background')
        .setDisplaySize(960, 576)
        .setScrollFactor(0)
        .setDepth(-10);
      if (document.theme === 'dusk')
        this.add.rectangle(480, 288, 960, 576, 0x37355c, 0.25).setScrollFactor(0).setDepth(-9);
      this.halo = this.add.ellipse(0, 0, 38, 14, 0xffe9a4, 0.28).setDepth(1);
      this.shadow = this.add.ellipse(0, 0, 28, 8, 0x294c43, 0.2);
      this.hero = this.add
        .image(0, 0, 'hero-customized')
        .setOrigin(0.5, 1)
        .setDisplaySize(40, 50)
        .setDepth(5);
      this.buildRoom();
      options.onFrame(frame);
    }
    private buildRoom() {
      for (const item of this.world) item.destroy();
      this.world = [];
      this.pictures.clear();
      this.roomId = frame.room.id;
      const room = frame.room;
      this.cameras.main.setBounds(
        Math.min(0, (room.width * TILE - 960) / 2),
        Math.min(0, (room.height * TILE - 576) / 2),
        Math.max(960, room.width * TILE),
        Math.max(576, room.height * TILE),
      );
      if (frame.mode === 'story') {
        const ground = this.add
          .tileSprite(
            (room.width * TILE) / 2,
            (room.height * TILE) / 2,
            room.width * TILE,
            room.height * TILE,
            room.ground,
          )
          .setTileScale(TILE / 128)
          .setDepth(-2);
        this.world.push(ground);
      }
      for (const tile of room.tiles) {
        const texture = tileTexture(frame.mode, room, tile);
        const item = this.add
          .image((tile.x + 0.5) * TILE, (tile.y + 0.5) * TILE, texture)
          .setDisplaySize(TILE + 0.5, TILE + 0.5)
          .setDepth(0);
        this.world.push(item);
      }
      for (const o of frame.objects) {
        const item = this.add.image(o.x * TILE, o.y * TILE, o.texture).setOrigin(0.5, 1);
        this.pictures.set(o.id, item);
        this.world.push(item);
      }
      this.hero.setPosition(frame.hero.x * TILE, frame.hero.y * TILE);
      if (frame.mode === 'platformer')
        this.cameras.main.startFollow(this.hero, false, 0.09, 0.09, -140, 25);
      else {
        this.cameras.main.startFollow(this.hero, false, 0.15, 0.15);
      }
      this.cameras.main.centerOn(this.hero.x, this.hero.y);
    }
    update(time: number, delta: number) {
      if (destroyed || !this.hero) return;
      currentTime = time;
      if (!paused) {
        const d = keyboardDirection(keys);
        if (platform)
          platform = stepPlatform(
            platform,
            {
              move: d.x,
              jump: keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW'),
              interact: keys.has('KeyE'),
            },
            delta / 1000,
          );
        if (story && time >= nextMove && (d.x || d.y)) {
          story = storyAction(story, { type: 'move', dx: d.x, dy: d.x ? 0 : d.y });
          nextMove = time + 150;
        }
        publish();
      }
      if (frame.room.id !== this.roomId) this.buildRoom();
      for (const o of frame.objects) {
        const image = this.pictures.get(o.id)!;
        image
          .setTexture(o.texture)
          .setVisible(o.visible)
          .setDisplaySize(o.width * TILE, o.height * TILE)
          .setDepth(o.depth);
        if (o.texture.startsWith('asset:')) {
          const size = Math.min(o.width, o.height) * TILE;
          image.setDisplaySize(size, size);
        }
        const float =
          motion && ['collectible', 'key', 'portal'].includes(o.texture)
            ? Math.sin(time / 400 + o.x) * 2.5
            : 0;
        image.setPosition(o.x * TILE, o.y * TILE + float);
      }
      const targetX = frame.hero.x * TILE,
        targetY = frame.hero.y * TILE;
      const smooth =
        !snapCamera &&
        frame.mode === 'story' &&
        motion &&
        Math.hypot(this.hero.x - targetX, this.hero.y - targetY) < TILE * 3;
      const t = smooth ? 1 - Math.exp(-delta / 45) : 1;
      const moving =
        frame.hero.moving || Math.abs(this.hero.x - targetX) + Math.abs(this.hero.y - targetY) > 2;
      this.hero.setPosition(
        Phaser.Math.Linear(this.hero.x, targetX, t),
        Phaser.Math.Linear(this.hero.y, targetY, t),
      );
      if (snapCamera) {
        this.cameras.main.centerOn(targetX, targetY);
        snapCamera = false;
      }
      this.hero
        .setFlipX(frame.hero.facing < 0)
        .setAngle(motion && moving ? Math.sin(time / 80) * 4 : 0);
      this.hero.setDisplaySize(40, 50).setDepth(frame.mode === 'story' ? frame.hero.y + 3.5 : 5);
      this.shadow.setPosition(this.hero.x, this.hero.y - 2).setDepth(this.hero.depth - 0.1);
      this.halo.setPosition(this.hero.x, this.hero.y - 2).setVisible(Boolean(frame.prompt));
      if (time >= reportAt) {
        reportAt = time + 100;
        options.onFrame(frame);
      }
    }
  }
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: 960,
    height: 576,
    backgroundColor: '#cfe2d5',
    banner: false,
    audio: { noAudio: true },
    scene: World,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    input: { keyboard: false },
    fps: { target: 60, forceSetTimeOut: false },
  });
  return {
    key(code, down) {
      if (paused || (down && frame.dialogue)) return;
      if (down) {
        if (keys.has(code)) return;
        if (story && code === 'KeyE') {
          story = storyAction(story, { type: 'interact' });
          publish();
        }
        if (story && code === 'KeyZ') {
          story = storyAction(story, { type: 'undo' });
          publish();
        }
        if (story && code === 'KeyR') {
          story = storyAction(story, { type: 'reset-room' });
          publish();
        }
        keys.add(code);
        const d = keyboardDirection(new Set([code]));
        if (story && (d.x || d.y)) {
          story = storyAction(story, { type: 'move', dx: d.x, dy: d.y });
          nextMove = currentTime + 300;
        }
      } else keys.delete(code);
      if (platform) {
        const d = keyboardDirection(keys);
        platform = stepPlatform(
          platform,
          {
            move: d.x,
            jump: keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW'),
            interact: keys.has('KeyE'),
          },
          0,
        );
      }
      publish();
      options.onFrame(frame);
    },
    action(action, index) {
      if (!ready) return;
      keys.clear();
      if (['restart', 'respawn', 'reset-room', 'undo'].includes(action)) {
        snapCamera = true;
        readableNotice.clear();
      }
      if (story && action !== 'respawn')
        story = storyAction(
          story,
          action === 'choose'
            ? { type: 'choose', index: index ?? 0 }
            : ({ type: action } as StoryAction),
        );
      if (platform && ['restart', 'respawn', 'close'].includes(action))
        platform = clearPlatformInput(
          platformAction(platform, action as 'restart' | 'respawn' | 'close'),
        );
      publish();
      options.onFrame(frame);
    },
    pause(value) {
      paused = ready ? value : true;
      keys.clear();
      if (platform) platform = clearPlatformInput(platform);
      audio.pause(paused);
      if (ready) {
        publish();
        options.onFrame(frame);
      }
    },
    sound(music, effects) {
      audio.music = music;
      audio.effects = effects;
      void audio
        .unlock()
        .then(() => {
          if (paused) audio.pause(true);
        })
        .catch(() => options.onError('浏览器暂未启用声音，仍可继续游玩。'));
    },
    motion(enabled) {
      motion = enabled;
    },
    destroy() {
      destroyed = true;
      keys.clear();
      audio.destroy();
      game.destroy(true);
    },
  };
}
