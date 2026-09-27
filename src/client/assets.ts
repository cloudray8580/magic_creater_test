import { useEffect, useState } from 'react';
import { api } from './api.js';
import {
  ASSET_LIMITS,
  BUNDLE_BYTES,
  documentAssets,
  type PortableAsset,
  type PortableBundle,
  type SourceCredit,
} from '../shared/portable.js';
import { validateCreative, type CreativeDocument } from '../shared/creative.js';
export interface LoadedAsset {
  asset: PortableAsset;
  warning: string;
}
function checked(value: PortableAsset): PortableAsset {
  if (
    !value ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 40 ||
    typeof value.data !== 'string' ||
    !value.data.startsWith('iVBORw0KGgo') ||
    value.data.length > Math.ceil(ASSET_LIMITS.storedBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
  )
    throw new Error('本地图片记录无效，请联网重新取得图片');
  return { id: value.id, name: value.name, data: value.data };
}
async function cached(
  user: string,
  id: string,
  value?: PortableAsset,
): Promise<PortableAsset | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('magic-creater-assets', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('images');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('images', value ? 'readwrite' : 'readonly'),
        store = tx.objectStore('images');
      const req = value ? store.put(value, [user, id]) : store.get([user, id]);
      tx.oncomplete = () => resolve(value ?? req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function cacheAsset(user: string, asset: PortableAsset) {
  if (!user) throw new Error('保存图片需要登录账号');
  const value = checked(asset);
  await cached(user, value.id, value);
}
async function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
async function remember(user: string, asset: PortableAsset): Promise<LoadedAsset> {
  const value = checked(asset);
  try {
    await cacheAsset(user, value);
    return { asset: value, warning: '' };
  } catch {
    return {
      asset: value,
      warning: '图片已上传/加载，但本地缓存失败。请保持联网，并及时导出作品包。',
    };
  }
}
export async function loadAsset(user: string, id: string): Promise<LoadedAsset> {
  if (!user) throw new Error('加载个人图片需要登录');
  try {
    const record = await cached(user, id);
    if (record) return { asset: checked(record), warning: '' };
  } catch {
    /* Retry from the authenticated source when local storage is unavailable. */
  }
  try {
    const response = await fetch('/api/assets/' + encodeURIComponent(id), {
      credentials: 'same-origin',
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png'))
      throw new Error('图片不存在或不可访问');
    const blob = await response.blob();
    if (blob.size > ASSET_LIMITS.storedBytes) throw new Error('图片超出大小限制');
    return await remember(user, { id, name: '个人图片', data: await base64(blob) });
  } catch {
    throw new Error('这张图片尚未缓存，或已无法访问。请联网重新打开作品；当前草稿仍保留。');
  }
}
export async function uploadImage(user: string, name: string, file: Blob): Promise<LoadedAsset> {
  if (!user) throw new Error('上传个人图片需要登录');
  if (!file.size || file.size > ASSET_LIMITS.inputBytes)
    throw new Error('请选择不超过2MiB的PNG、JPEG或WebP图片');
  const asset = await api<PortableAsset>('/assets', 'POST', {
    name: name.trim().slice(0, 40) || '我的图片',
    data: await base64(file),
  });
  return remember(user, asset);
}
export async function exportPortable(
  user: string,
  value: CreativeDocument,
  source?: SourceCredit | null,
): Promise<CreativeDocument | PortableBundle> {
  const document = validateCreative(value),
    ids = documentAssets(document);
  if (!ids.length && !source) return document;
  const assets: PortableAsset[] = [];
  for (const id of ids) assets.push((await loadAsset(user, id)).asset);
  const bundle: PortableBundle = {
    format: 'magic-creater-bundle',
    bundleVersion: 1,
    document,
    assets,
    ...(source ? { source } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(bundle)).length > BUNDLE_BYTES)
    throw new Error('作品包超过8MiB，请减少图片');
  return bundle;
}
export function imageUrl(skin: string, urls: Record<string, string>): string | undefined {
  return skin.startsWith('asset:') ? urls[skin.slice(6)] : '/art/storybook-v1/' + skin + '.svg';
}
const EMPTY_URLS: Record<string, string> = {};
export function useAssetUrls(doc: CreativeDocument, user = '') {
  const ids = documentAssets(doc).join(','),
    key = user + ':' + ids;
  const [state, setState] = useState<{
    key: string;
    urls: Record<string, string>;
    warning: string;
    error: string;
  }>({ key: '', urls: {}, warning: '', error: '' });
  useEffect(() => {
    let cancelled = false;
    if (!ids) return;
    void (async () => {
      try {
        const urls: Record<string, string> = {};
        let warning = '';
        for (const id of ids.split(',')) {
          const loaded = await loadAsset(user, id);
          urls[id] = 'data:image/png;base64,' + loaded.asset.data;
          warning ||= loaded.warning;
        }
        if (!cancelled) setState({ key, urls, warning, error: '' });
      } catch (e) {
        if (!cancelled) setState({ key, urls: {}, warning: '', error: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ids, user]);
  return !ids
    ? { urls: EMPTY_URLS, ready: true, error: '', warning: '' }
    : state.key === key
      ? { ...state, ready: !state.error }
      : { urls: EMPTY_URLS, ready: false, error: '', warning: '' };
}
