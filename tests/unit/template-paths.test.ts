import { expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { startPlatform, stepPlatform } from '../../src/shared/adventure/platform.js';
import { startStory, storyAction } from '../../src/shared/adventure/story.js';
for (const id of ['cloud-post'] as const) {
  it(
    'completes ' +
      id +
      ' through ordinary directional/jump/interact inputs and all three discoveries',
    () => {
      const doc = adventureTemplate(id),
        before = JSON.stringify(doc);
      let s = startPlatform(doc);
      const tick = (move = 0, jump = false, interact = false) => {
        s = stepPlatform(s, { move, jump, interact }, 1 / 60);
      };
      const stop = () => {
        for (let i = 0; i < 30; i++) tick();
      };
      const go = (x: number, jump: boolean, n: number) => {
        for (let i = 0; i < n; i++) {
          const delta = x - (s.state.x + 0.31);
          tick(Math.abs(delta) < 0.15 ? 0 : Math.sign(delta), jump);
        }
        stop();
      };
      stop();
      go(6.5, false, 70);
      go(9.3, true, 65);
      expect(s.state.collected).toContain('stamp-1');
      go(14.3, true, 75);
      expect(s.state.collected).toContain('stamp-2');
      go(24.3, true, 150);
      tick(0, false, true);
      stop();
      expect(s.state.switches['lantern-switch']).toBe(-1);
      go(27.3, true, 80);
      expect(s.state.collected).toHaveLength(3);
      go(39.5, false, 150);
      expect(s.state.ending).toBeTruthy();
      expect(s.state.deaths).toBe(0);
      expect(s.assist).toBe(false);
      expect(s.preview).toBe(false);
      expect(JSON.stringify(doc)).toBe(before);
    },
  );
}
for (const id of ['forest-letter'] as const) {
  for (const choice of [0])
    it('completes ' + id + ' choice ' + choice + ' with normal moves and dialogue', () => {
      const doc = adventureTemplate(id),
        before = JSON.stringify(doc);
      let s = startStory(doc);
      const move = (dx: number, dy: number, n = 1) => {
        for (let i = 0; i < n; i++) s = storyAction(s, { type: 'move', dx, dy });
      };
      move(0, 1);
      move(1, 0, 2);
      move(0, -1);
      move(1, 0);
      expect(s.state.boxes.crate).toEqual({ x: 6, y: 7 });
      move(0, -1);
      move(1, 0, 3);
      move(0, 1);
      move(1, 0, 5);
      expect(s.state.roomId).toBe('forest');
      move(1, 0, 5);
      move(0, -1, 2);
      s = storyAction(s, { type: 'interact' });
      s = storyAction(s, { type: 'choose', index: 0 });
      s = storyAction(s, { type: 'close' });
      expect(s.state.flags).toContain('delivered');
      expect(s.state.inventory).toEqual([]);
      move(0, 1, 2);
      move(1, 0, 5);
      expect(s.state.ending).toBeTruthy();
      expect(s.state.collected).toContain('gift');
      expect(JSON.stringify(doc)).toBe(before);
    });
}
it('crosses the wide valley by actually riding the bridge with zero movement input', () => {
  const doc = adventureTemplate('moving-bridge'),
    before = JSON.stringify(doc);
  let s = startPlatform(doc);
  const tick = (move = 0, jump = false, interact = false) => {
    s = stepPlatform(s, { move, jump, interact }, 1 / 60);
  };
  const stop = () => {
    for (let i = 0; i < 30; i++) tick();
  };
  const go = (x: number, jump = false, n = 150) => {
    for (let i = 0; i < n; i++) {
      const delta = x - (s.state.x + 0.31);
      tick(Math.abs(delta) < 0.15 ? 0 : Math.sign(delta), jump);
    }
    stop();
  };
  stop();
  go(14.3);
  while (s.state.elapsed < 14.8) tick();
  go(18.2, true, 65);
  expect(s.state.groundId).toBe('bridge');
  const x = s.state.x;
  for (let i = 0; i < 240; i++) tick();
  expect(s.state.groundId).toBe('bridge');
  expect(s.state.x - x).toBeGreaterThan(3);
  while (s.state.elapsed < 23.5) tick();
  go(29.3, true, 95);
  tick(0, false, true);
  stop();
  expect(s.state.switches['lantern-switch']).toBe(-1);
  go(39.5, false, 150);
  expect(s.state.ending).toBeTruthy();
  expect(s.state.deaths).toBe(0);
  expect(s.assist || s.preview).toBe(false);
  expect(JSON.stringify(doc)).toBe(before);
});
it('explores the independent rooftops and collects three required stars with normal jumps', () => {
  const doc = adventureTemplate('rooftop-secret'),
    before = JSON.stringify(doc);
  let s = startPlatform(doc);
  const tick = (move = 0, jump = false) => {
    s = stepPlatform(s, { move, jump, interact: false }, 1 / 60);
  };
  const stop = () => {
    for (let i = 0; i < 30; i++) tick();
  };
  const go = (x: number, jump = false, n = 90) => {
    for (let i = 0; i < n; i++) {
      const delta = x - (s.state.x + 0.31);
      tick(Math.abs(delta) < 0.15 ? 0 : Math.sign(delta), jump);
    }
    stop();
  };
  stop();
  go(5.5, false, 50);
  go(7.5, true, 70);
  expect(s.state.collected).toContain('stamp-1');
  go(12.5, true, 85);
  expect(s.state.collected).toContain('stamp-2');
  go(18.5, true, 95);
  go(23.5, true, 85);
  expect(s.state.collected).toHaveLength(3);
  go(28.5, false, 90);
  expect(s.state.ending).toBeTruthy();
  expect(s.state.deaths).toBe(0);
  expect(s.assist || s.preview).toBe(false);
  expect(JSON.stringify(doc)).toBe(before);
});
it('opens the battery store only with both switches and delivers the battery using normal moves', () => {
  const d = adventureTemplate('lighthouse'),
    before = JSON.stringify(d);
  let s = startStory(d);
  const move = (dx: number, dy: number, n = 1) => {
    for (let i = 0; i < n; i++) s = storyAction(s, { type: 'move', dx, dy });
  };
  const interact = () => {
    s = storyAction(s, { type: 'interact' });
  };
  move(1, 0, 6);
  move(1, 0);
  expect(s.state.x).toBe(8);
  move(-1, 0, 4);
  move(0, -1, 3);
  interact();
  move(0, 1, 3);
  move(1, 0, 4);
  move(1, 0);
  expect(s.state.x).toBe(8);
  move(-1, 0, 2);
  move(0, 1, 2);
  interact();
  move(0, -1, 2);
  move(1, 0, 4);
  expect(s.state.x).toBe(10);
  move(0, -1, 3);
  move(1, 0, 2);
  expect(s.state.inventory).toContain('gift');
  move(0, 1, 3);
  move(1, 0);
  expect(s.state.roomId).toBe('forest');
  move(1, 0, 5);
  move(0, -1, 2);
  interact();
  s = storyAction(s, { type: 'choose', index: 0 });
  s = storyAction(s, { type: 'close' });
  expect(s.state.inventory).toEqual([]);
  expect(s.state.flags).toContain('delivered');
  expect(s.state.collected).toContain('gift');
  move(0, 1, 2);
  move(1, 0, 5);
  expect(s.state.ending).toBeTruthy();
  expect(JSON.stringify(d)).toBe(before);
});
for (const gift of [false, true])
  it('welcomes a cottage guest ' + (gift ? 'with a letter' : 'without a gift'), () => {
    const d = adventureTemplate('secret-home'),
      before = JSON.stringify(d);
    let s = startStory(d);
    const move = (dx: number, dy: number, n = 1) => {
      for (let i = 0; i < n; i++) s = storyAction(s, { type: 'move', dx, dy });
    };
    if (gift) {
      move(0, 1);
      move(1, 0);
      move(0, -1);
    }
    move(0, -1, 2);
    move(1, 0, gift ? 7 : 8);
    s = storyAction(s, { type: 'interact' });
    expect(s.state.dialogue?.pageId).toBe(gift ? 'hello' : 'welcome-empty');
    s = storyAction(s, { type: 'choose', index: gift ? 1 : 0 });
    expect(s.state.ending).toContain(gift ? '信静静' : '星星');
    expect(s.state.flags).toContain('stayed');
    expect(JSON.stringify(d)).toBe(before);
  });

it('requires a cottage conversation before the walk-to-exit ending, and permits it after choosing to explore', () => {
  let s = startStory(adventureTemplate('secret-home'));
  const move = (dx: number, dy: number, n = 1) => {
    for (let i = 0; i < n; i++) s = storyAction(s, { type: 'move', dx, dy });
  };
  move(1, 0, 11);
  move(0, 1);
  expect(s.state.ending).toBeNull();
  move(-1, 0, 3);
  move(0, -1, 3);
  s = storyAction(s, { type: 'interact' });
  s = storyAction(s, { type: 'choose', index: 2 });
  expect(s.state.ending).toBeNull();
  expect(s.state.flags).toContain('stayed');
  move(0, 1, 3);
  move(1, 0, 3);
  expect(s.state.ending).toContain('谢谢你来做客');
});
