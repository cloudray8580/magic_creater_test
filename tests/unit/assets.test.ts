import { it, expect } from 'vitest';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import { normalizeImage, storeImage, requireOwnedAssets } from '../../src/server/assets.js';
import { openDatabase } from '../../src/server/db.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { ASSET_LIMITS } from '../../src/shared/portable.js';
it('decodes PNG JPEG WebP into metadata-free proportionate transparent PNGs', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const input = await sharp({
      create: { width: 80, height: 40, channels: 4, background: '#f08040' },
    })
      .toFormat(format)
      .withMetadata()
      .toBuffer();
    const result = await normalizeImage(input.toString('base64'));
    const meta = await sharp(result).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 256, height: 256, hasAlpha: true });
    expect(meta.exif).toBeUndefined();
    const { data } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(128 * 256 + 128) * 4 + 3]).toBe(255);
  }
});
it('rejects corrupt, disguised, oversized and animated images', async () => {
  for (const bad of [
    '',
    'not-base64',
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
    Buffer.from('GIF89a').toString('base64'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
    Buffer.alloc(ASSET_LIMITS.inputBytes + 1).toString('base64'),
  ])
    await expect(normalizeImage(bad)).rejects.toThrow();
  const wide = await sharp({ create: { width: 4097, height: 1, channels: 4, background: 'red' } })
    .png()
    .toBuffer();
  await expect(normalizeImage(wide.toString('base64'))).rejects.toThrow(/尺寸/);
  const pixels = Buffer.alloc(2 * 2 * 4 * 2, 255);
  for (let i = 16; i < pixels.length; i += 4) {
    pixels[i] = 0;
    pixels[i + 1] = 0;
    pixels[i + 2] = 0;
  }
  const frames = await sharp(pixels, { raw: { width: 2, height: 4, channels: 4, pageHeight: 2 } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(frames).metadata()).pages).toBe(2);
  await expect(normalizeImage(frames.toString('base64'))).rejects.toThrow(/动画/);
});
it('deduplicates per owner, retains immutable bytes and enforces total quota and ownership', async () => {
  const db = openDatabase(':memory:');
  try {
    db.exec(
      "INSERT INTO classrooms VALUES ('c','class'); INSERT INTO users VALUES ('a','c','alice','Alice','student','hash',1),('b','c','bob','Bob','student','hash',1)",
    );
    const png = await normalizeImage(
      (
        await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } })
          .png()
          .toBuffer()
      ).toString('base64'),
    );
    const a = storeImage(db, 'a', 'first', png),
      a2 = storeImage(db, 'a', 'same', png),
      b = storeImage(db, 'b', 'other', png);
    expect(a2.id).toBe(a.id);
    expect(b.id).not.toBe(a.id);
    const doc = adventureTemplate();
    doc.hero.skin = 'asset:' + a.id;
    expect(() => requireOwnedAssets(db, 'a', doc)).not.toThrow();
    expect(() => requireOwnedAssets(db, 'b', doc)).toThrow(/素材/);
    doc.hero.skin = 'asset:missing';
    expect(() => requireOwnedAssets(db, 'a', doc)).toThrow(/素材/);
    for (let i = 1; i < ASSET_LIMITS.count; i++)
      storeImage(db, 'a', 'fixture', Buffer.from('fixture-' + i));
    expect(() => storeImage(db, 'a', 'over', Buffer.from('over'))).toThrow(/额度/);
    expect(storeImage(db, 'a', 'same', png).id).toBe(a.id);
    expect(
      (db.prepare('SELECT data FROM assets WHERE id=?').get(a.id) as { data: Buffer }).data,
    ).toEqual(png);
  } finally {
    db.close();
  }
});

it('rejects PNG animation controls even when the decoder exposes only the default frame', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } })
    .png()
    .toBuffer();
  const control = Buffer.alloc(20);
  control.writeUInt32BE(8, 0);
  control.write('acTL', 4);
  control.writeUInt32BE(2, 8);
  control.writeUInt32BE(crc32(control.subarray(4, 16)), 16);
  const animated = Buffer.concat([png.subarray(0, 33), control, png.subarray(33)]);
  await expect(normalizeImage(animated.toString('base64'))).rejects.toThrow(/动画/);
});
