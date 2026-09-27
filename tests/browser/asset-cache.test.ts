import { it, expect, vi, afterEach } from 'vitest';
import { loadAsset, cacheAsset, exportPortable, uploadImage } from '../../src/client/assets.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
function png() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'orange';
  ctx.fillRect(70, 80, 60, 60);
  return c.toDataURL('image/png').split(',')[1];
}
afterEach(() => vi.unstubAllGlobals());
it('persists canonical image bytes per account for offline export and rejects cross-account reuse', async () => {
  const user = crypto.randomUUID(),
    asset = { id: 'image-a', name: '小太阳', data: png() };
  await cacheAsset(user, asset);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await loadAsset(user, asset.id)).asset).toEqual(asset);
  const doc = adventureTemplate();
  doc.hero.skin = 'asset:' + asset.id;
  const bundle = await exportPortable(user, doc);
  expect(bundle).toMatchObject({ document: doc, assets: [asset] });
  await expect(loadAsset(crypto.randomUUID(), asset.id)).rejects.toThrow(/图片/);
  await expect(cacheAsset(user, { ...asset, data: btoa('<svg/>') })).rejects.toThrow(/图片/);
});
it('fetches missing PNGs and reuses them while preserving legacy exports', async () => {
  const user = crypto.randomUUID(),
    data = png(),
    bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetch);
  expect((await loadAsset(user, 'remote')).asset.data).toBe(data);
  fetch.mockRejectedValue(new Error('offline'));
  expect((await loadAsset(user, 'remote')).asset.data).toBe(data);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await exportPortable(user, adventureTemplate())).toEqual(adventureTemplate());
  fetch.mockResolvedValue(new Response('missing', { status: 404 }));
  await expect(loadAsset(user, 'missing')).rejects.toThrow(/图片/);
});
it('uploads through the authenticated endpoint, caches canonical response and enforces local size limits', async () => {
  const user = crypto.randomUUID(),
    asset = { id: 'upload', name: '角色', data: png() };
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(asset), { headers: { 'content-type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetch);
  expect((await uploadImage(user, '角色', new Blob(['input']))).asset).toEqual(asset);
  expect(fetch.mock.calls[0][0]).toBe('/api/assets');
  fetch.mockRejectedValue(new Error('offline'));
  expect((await loadAsset(user, 'upload')).asset.data).toBe(asset.data);
  await expect(
    uploadImage(user, 'too-large', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])),
  ).rejects.toThrow(/2MiB/);
});
