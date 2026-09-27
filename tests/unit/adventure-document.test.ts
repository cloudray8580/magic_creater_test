import { describe, expect, it } from 'vitest';
import {
  validateAdventure,
  assetReferences,
  type AdventureDocument,
} from '../../src/shared/adventure/document.js';
import { adventureTemplate, TEMPLATE_IDS } from '../../src/shared/adventure/templates.js';

function change(fn: (d: AdventureDocument) => void) {
  const doc = adventureTemplate('forest-letter');
  fn(doc);
  return doc;
}

describe('C21 two-game documents', () => {
  it('validates all six independently editable templates and returns a deep copy', () => {
    expect(TEMPLATE_IDS).toHaveLength(6);
    for (const id of TEMPLATE_IDS) {
      const doc = adventureTemplate(id);
      const copy = validateAdventure(doc, true);
      expect(copy).toEqual(doc);
      copy.title = '改过的标题';
      expect(doc.title).not.toBe(copy.title);
      expect(adventureTemplate(id)).toEqual(doc);
    }
    expect(adventureTemplate('forest-letter').gameType).toBe('story');
    expect(adventureTemplate('cloud-post').gameType).toBe('platformer');
  });

  it('keeps incomplete drafts, but rejects starting a world without a start or ending', () => {
    const draft = change((d) => {
      d.start = null;
      for (const room of d.rooms) room.objects = [];
    });
    expect(validateAdventure(draft)).toEqual(draft);
    expect(() => validateAdventure(draft, true)).toThrow(/起点/);
    const noGoal = change((d) => {
      for (const room of d.rooms) room.objects = room.objects.filter((o) => o.kind !== 'goal');
    });
    expect(() => validateAdventure(noGoal, true)).toThrow(/终点/);
  });

  it('rejects untrusted executable data, unknown fields, versions and external assets', () => {
    const original = adventureTemplate('forest-letter');
    for (const bad of [
      null,
      [],
      { ...original, script: 'alert(1)' },
      { ...original, schemaVersion: 99 },
      { ...original, rulesVersion: 2 },
      { ...original, gameType: 'custom-js' },
      { ...original, hero: { ...original.hero, skin: 'https://example.com/image.png' } },
      { ...original, assetPack: 'external' },
      { ...original, title: '' },
      { ...original, music: 'https://example.com/music.mp3' },
    ])
      expect(() => validateAdventure(bad)).toThrow();
    expect(() =>
      validateAdventure(
        change((d) => {
          (d.rooms[0] as unknown as Record<string, unknown>).code = 'x';
        }),
      ),
    ).toThrow();
  });

  it('checks finite integer bounds, room budgets, unique tiles and unique entity ids', () => {
    for (const mutation of [
      (d: AdventureDocument) => {
        d.rooms[0].width = 1000;
      },
      (d: AdventureDocument) => {
        d.rooms[0].height = NaN;
      },
      (d: AdventureDocument) => {
        d.rooms[0].objects[0].x = -1;
      },
      (d: AdventureDocument) => {
        d.rooms[0].objects[0].x = 1.5;
      },
      (d: AdventureDocument) => {
        d.rooms[0].objects.push(structuredClone(d.rooms[0].objects[0]));
      },
      (d: AdventureDocument) => {
        d.rooms.push(structuredClone(d.rooms[0]));
      },
      (d: AdventureDocument) => {
        d.rooms[0].tiles.push({ x: 2, y: 2, kind: 'solid' }, { x: 2, y: 2, kind: 'water' });
      },
      (d: AdventureDocument) => {
        d.rooms = [];
      },
      (d: AdventureDocument) => {
        d.hero.tint = 'red; background:url(x)';
      },
    ])
      expect(() => validateAdventure(change(mutation))).toThrow();
  });

  it('verifies links and conditions and prevents blocked landing positions', () => {
    const portal = change((d) => {
      d.rooms[0].objects.push({
        id: 'p',
        kind: 'portal',
        x: 2,
        y: 2,
        target: { roomId: 'missing', x: 1, y: 1 },
      });
    });
    expect(() => validateAdventure(portal, true)).toThrow(/房间/);
    const dangling = change((d) => {
      d.rooms[0].objects.push({
        id: 'd',
        kind: 'door',
        x: 2,
        y: 2,
        condition: { mode: 'all', sources: ['missing'] },
      });
    });
    expect(() => validateAdventure(dangling)).toThrow(/条件/);
    const blocked = change((d) => {
      const p = d.start!;
      const room = d.rooms.find((r) => r.id === p.roomId)!;
      room.tiles.push({ x: p.x, y: p.y, kind: 'solid' });
    });
    expect(() => validateAdventure(blocked, true)).toThrow(/起点/);
    const incomplete = change((d) => {
      d.rooms[0].objects.push({ id: 'p', kind: 'portal', x: 2, y: 2 });
    });
    expect(validateAdventure(incomplete)).toEqual(incomplete);
    expect(() => validateAdventure(incomplete, true)).toThrow(/传送/);
  });

  it('validates story dialogue conditions, choice destinations and item/flag actions', () => {
    const doc = change((d) => {
      d.flags.push('helped');
      d.rooms[0].objects.push({
        id: 'bird',
        kind: 'npc',
        x: 4,
        y: 1,
        dialogue: [
          {
            id: 'start',
            text: '帮帮我',
            choices: [{ label: '好的', setFlag: 'helped', next: 'thanks' }],
          },
          { id: 'thanks', text: '谢谢', choices: [] },
        ],
      });
    });
    expect(() => validateAdventure(doc, true)).not.toThrow();
    const broken = structuredClone(doc);
    broken.rooms[0].objects.at(-1)!.dialogue![0].choices[0].next = 'missing';
    expect(() => validateAdventure(broken)).toThrow(/对话/);
    const unknownFlag = structuredClone(doc);
    unknownFlag.rooms[0].objects.at(-1)!.dialogue![0].choices[0].setFlag = 'undeclared';
    expect(() => validateAdventure(unknownFlag)).toThrow(/标记/);
  });

  it('extracts unique immutable asset references without embedding bytes or accepting URLs', () => {
    const doc = change((d) => {
      d.hero.skin = 'asset:abc-123';
      d.rooms[0].objects.push({
        id: 'painting',
        kind: 'decoration',
        x: 5,
        y: 1,
        skin: 'asset:abc-123',
      });
      d.rooms[0].objects.push({
        id: 'custom-tree',
        kind: 'decoration',
        x: 6,
        y: 1,
        skin: 'asset:second',
      });
    });
    expect(assetReferences(validateAdventure(doc))).toEqual(['abc-123', 'second']);
    expect(() =>
      validateAdventure(
        change((d) => {
          d.hero.skin = 'asset:../secret';
        }),
      ),
    ).toThrow();
  });
});
