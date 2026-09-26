import { describe, it, expect } from 'vitest';
import {
  template,
  validateDocument,
  startGame,
  movePlayer,
  editCell,
  editTitle,
  createHistory,
  changeHistory,
  undoHistory,
  redoHistory,
} from '../../src/shared/game.js';

describe('C01 document validation', () => {
  it('accepts the built-in template and rejects unknown data', () => {
    expect(validateDocument(template(), true)).toEqual(template());
    for (const change of [
      { schemaVersion: 2 },
      { gameType: 'script' },
      { assetPack: 'https://evil.test/a' },
      { title: '' },
      { title: 'x'.repeat(61) },
      { script: 'alert(1)' },
    ])
      expect(() => validateDocument({ ...template(), ...change })).toThrow();
    expect(() => validateDocument(null)).toThrow();
    expect(() => validateDocument([])).toThrow();
  });
  it('allows incomplete drafts while playable documents require a start and goal', () => {
    const doc = template();
    doc.level.objects = [];
    expect(validateDocument(doc)).toEqual(doc);
    expect(() => validateDocument(doc, true)).toThrow();
  });
  it('rejects out of bounds, overlapping, duplicate id and unknown objects', () => {
    for (const obj of [
      { id: 'bad', type: 'wall', x: -1, y: 0 },
      { id: 'bad', type: 'wall', x: 100, y: 0 },
      { id: 'bad', type: 'script', x: 1, y: 0 },
      { id: 'bad', type: 'wall', x: 0, y: 0 },
      { id: 'spawn-1', type: 'wall', x: 1, y: 0 },
    ]) {
      const doc = template();
      doc.level.objects.push(obj as never);
      expect(() => validateDocument(doc)).toThrow();
    }
    const doc = template();
    doc.level.width = 100;
    expect(() => validateDocument(doc)).toThrow();
  });
  it('moves unique start markers and supports removing objects', () => {
    const original = template();
    const changed = editCell(original, 1, 0, 'spawn');
    expect(changed.level.objects.filter((o) => o.type === 'spawn')).toHaveLength(1);
    expect(original.level.objects.find((o) => o.type === 'spawn')?.x).toBe(0);
    expect(editCell(changed, 1, 0, 'erase').level.objects.some((o) => o.x === 1 && o.y === 0)).toBe(
      false,
    );
  });
});

describe('C01 runtime isolation and movement', () => {
  it('blocks walls/edges, collects once, requires all flowers and restarts', () => {
    const doc = template();
    doc.level.objects = [
      { id: 'spawn-1', type: 'spawn', x: 0, y: 0 },
      { id: 'goal-1', type: 'goal', x: 2, y: 0 },
      { id: 'flower-1', type: 'collectible', x: 1, y: 1 },
      { id: 'wall-1', type: 'wall', x: 0, y: 1 },
    ];
    const before = JSON.stringify(doc);
    let state = startGame(doc);
    expect(movePlayer(state, -1, 0).x).toBe(0);
    expect(movePlayer(state, 0, 1).y).toBe(0);
    state = movePlayer(movePlayer(state, 1, 0), 1, 0);
    expect(state.won).toBe(false);
    state = movePlayer(movePlayer(state, 0, 1), -1, 0);
    expect(state.collected).toHaveLength(1);
    state = movePlayer(movePlayer(state, 1, 0), 0, -1);
    expect(state.won).toBe(true);
    expect(movePlayer(state, -1, 0)).toEqual(state);
    expect(startGame(doc).collected).toHaveLength(0);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('permits zero collectibles and refuses diagonal moves', () => {
    const doc = template();
    doc.level.objects = [
      { id: 's', type: 'spawn', x: 0, y: 0 },
      { id: 'g', type: 'goal', x: 1, y: 0 },
    ];
    const state = startGame(doc);
    expect(movePlayer(state, 1, 1)).toEqual(state);
    expect(movePlayer(state, 1, 0).won).toBe(true);
  });
});

describe('C01 edit history', () => {
  it('undoes/redoes title and tile changes, clears redo after a new edit', () => {
    let h = createHistory(template());
    h = changeHistory(h, editTitle(h.present, '另一个花园'));
    h = changeHistory(h, editCell(h.present, 1, 0, 'wall'));
    h = undoHistory(h);
    expect(h.present.title).toBe('另一个花园');
    h = redoHistory(h);
    expect(h.present.level.objects.some((o) => o.type === 'wall' && o.x === 1 && o.y === 0)).toBe(
      true,
    );
    h = undoHistory(h);
    h = changeHistory(h, editTitle(h.present, '新分支'));
    expect(h.future).toHaveLength(0);
    expect(redoHistory(h)).toEqual(h);
  });
  it('keeps at most 100 past documents and returns unchanged empty histories', () => {
    let h = createHistory(template());
    expect(undoHistory(h)).toEqual(h);
    for (let i = 0; i < 110; i++) h = changeHistory(h, editTitle(h.present, '关卡' + i));
    expect(h.past).toHaveLength(100);
  });
});

it('keeps imported object ids unique when placing a new object', () => {
  const doc = template();
  doc.level.objects.push({ id: 'wall-0-1', type: 'wall', x: 0, y: 2 });
  expect(() => validateDocument(editCell(doc, 0, 1, 'wall'))).not.toThrow();
});
