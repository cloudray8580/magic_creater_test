import { expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { startPlatform, stepPlatform } from '../../src/shared/adventure/platform.js';
import { startStory, storyAction } from '../../src/shared/adventure/story.js';
for (const id of ['cloud-post', 'moving-bridge', 'rooftop-secret'] as const) {
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
for (const id of ['forest-letter', 'lighthouse', 'secret-home'] as const) {
  for (const choice of id === 'secret-home' ? [0, 1] : [0])
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
      if (id === 'secret-home') {
        move(1, 0, 3);
        move(0, -1);
        s = storyAction(s, { type: 'interact' });
        s = storyAction(s, { type: 'choose', index: choice });
        expect(s.state.ending).toContain(choice === 0 ? '星星' : '信静静');
        expect(s.state.flags).toContain('stayed');
      } else {
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
      }
      expect(s.state.collected).toContain('gift');
      expect(JSON.stringify(doc)).toBe(before);
    });
}
