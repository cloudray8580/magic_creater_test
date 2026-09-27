import { it, expect } from 'vitest';
import { parsePortable, remapAssets, documentAssets } from '../../src/shared/portable.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { template } from '../../src/shared/game.js';
it('preserves raw legacy documents and validates complete self-contained bundles', () => {
  expect(parsePortable(template()).document).toEqual(template());
  const doc = adventureTemplate('forest-letter');
  doc.hero.skin = 'asset:old';
  doc.rooms[1].objects.find((o) => o.kind === 'npc')!.skin = 'asset:old';
  const bundle = {
    format: 'magic-creater-bundle',
    bundleVersion: 1,
    document: doc,
    assets: [{ id: 'old', name: 'me', data: 'aGVsbG8=' }],
    source: { versionId: 'v1', title: '来源', authorName: '同学', verified: true },
  };
  const parsed = parsePortable(bundle);
  expect(parsed.source?.verified).toBe(false);
  expect(documentAssets(parsed.document)).toEqual(['old']);
  const mapped = remapAssets(parsed.document, new Map([['old', 'new']]));
  expect(documentAssets(mapped)).toEqual(['new']);
  expect(documentAssets(doc)).toEqual(['old']);
  expect(() => remapAssets(doc, new Map())).toThrow(/素材/);
  for (const assets of [
    [],
    [...bundle.assets, ...bundle.assets],
    [...bundle.assets, { id: 'extra', name: 'extra', data: 'aGVsbG8=' }],
  ])
    expect(() => parsePortable({ ...bundle, assets })).toThrow(/素材/);
  expect(() => parsePortable(doc)).toThrow(/素材/);
  expect(() => parsePortable({ ...bundle, bundleVersion: 2 })).toThrow();
  expect(() => parsePortable({ ...bundle, unknown: 1 })).toThrow();
});
