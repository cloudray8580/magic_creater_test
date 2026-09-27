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
it('fits a full 1MiB document and sixteen maximum stored-image byte budgets within the 8MiB export ceiling', async () => {
  const { DOCUMENT_BYTES } = await import('../../src/shared/creative.js');
  const { ASSET_LIMITS, BUNDLE_BYTES } = await import('../../src/shared/portable.js');
  const doc = adventureTemplate('forest-letter');
  doc.start = null;
  doc.rooms.forEach((r) => (r.objects = []));
  doc.rooms[0].objects = Array.from({ length: 200 }, (_, i) => ({
    id: 'writer-' + i,
    kind: 'npc',
    x: 4,
    y: 4,
    ...(i < 16 ? { skin: 'asset:art-' + i } : {}),
    dialogue: Array.from({ length: 8 }, (_, j) => ({ id: 'page-' + j, text: 'x', choices: [] })),
  }));
  for (const page of doc.rooms[0].objects.flatMap((o) => o.dialogue!)) {
    const n = Math.min(720, DOCUMENT_BYTES - Buffer.byteLength(JSON.stringify(doc)) + 1);
    if (n <= 0) break;
    page.text = '界'.repeat(Math.floor(n / 3)) + (n % 3 === 2 ? 'é' : n % 3 === 1 ? 'x' : '');
  }
  expect(Buffer.byteLength(JSON.stringify(doc))).toBe(DOCUMENT_BYTES);
  // Synthetic byte budgets test the envelope; decoding/normalization is covered by server image tests.
  const bundle = {
    format: 'magic-creater-bundle',
    bundleVersion: 1,
    document: doc,
    assets: Array.from({ length: 16 }, (_, i) => ({
      id: 'art-' + i,
      name: '最大素材' + i,
      data: Buffer.alloc(ASSET_LIMITS.storedBytes, i).toString('base64'),
    })),
  };
  expect(Buffer.byteLength(JSON.stringify(bundle))).toBeLessThan(BUNDLE_BYTES);
  expect(parsePortable(bundle).document).toEqual(doc);
  bundle.assets[0].data = Buffer.alloc(ASSET_LIMITS.inputBytes).toString('base64');
  expect(() => parsePortable(bundle)).toThrow('8MiB');
});
