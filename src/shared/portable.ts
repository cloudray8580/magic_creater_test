import { validateCreative, type CreativeDocument } from './creative.js';
import { assetReferences } from './adventure/document.js';
import { ValidationError } from './game.js';
export const ASSET_LIMITS = {
  inputBytes: 2 * 1024 * 1024,
  storedBytes: 320 * 1024,
  count: 100,
  totalBytes: 32 * 1024 * 1024,
  pixels: 8_000_000,
  edge: 4096,
} as const;
export const BUNDLE_BYTES = 8 * 1024 * 1024;
export interface SourceCredit {
  versionId: string;
  title: string;
  authorName: string;
  verified: boolean;
}
export interface PortableAsset {
  id: string;
  name: string;
  data: string;
}
export interface PortableBundle {
  format: 'magic-creater-bundle';
  bundleVersion: 1;
  document: CreativeDocument;
  assets: PortableAsset[];
  source?: SourceCredit;
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new ValidationError(message);
}
function record(value: unknown, keys: string[]) {
  check(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((k) => keys.includes(k)),
    '作品包字段无效',
  );
  return value as Record<string, unknown>;
}
function short(value: unknown, max: number): string {
  check(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    '作品包文字长度无效',
  );
  return value;
}
export function documentAssets(doc: CreativeDocument) {
  return doc.schemaVersion === 2 ? assetReferences(doc) : [];
}
export function remapAssets(
  doc: CreativeDocument,
  ids: ReadonlyMap<string, string>,
): CreativeDocument {
  const next = structuredClone(doc);
  if (next.schemaVersion === 2) {
    const remap = (skin: string) => {
      if (!skin.startsWith('asset:')) return skin;
      const replacement = ids.get(skin.slice(6));
      check(replacement, '作品包缺少素材');
      return 'asset:' + replacement;
    };
    next.hero.skin = remap(next.hero.skin);
    for (const room of next.rooms)
      for (const object of room.objects) if (object.skin) object.skin = remap(object.skin);
  }
  return validateCreative(next);
}
export function parsePortable(value: unknown): PortableBundle {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ValidationError('作品包格式无效');
  }
  check(encoded && new TextEncoder().encode(encoded).length <= BUNDLE_BYTES, '作品包容量超出8MiB');
  if (!value || typeof value !== 'object' || !('format' in value)) {
    const document = validateCreative(value);
    check(!documentAssets(document).length, '含个人素材的作品请导入带图片的作品包');
    return { format: 'magic-creater-bundle', bundleVersion: 1, document, assets: [] };
  }
  const raw = record(value, ['format', 'bundleVersion', 'document', 'assets', 'source']);
  check(raw.format === 'magic-creater-bundle' && raw.bundleVersion === 1, '不支持的作品包版本');
  const document = validateCreative(raw.document),
    references = new Set(documentAssets(document));
  check(
    Array.isArray(raw.assets) && raw.assets.length === references.size && raw.assets.length <= 16,
    '作品包素材数量不匹配',
  );
  const seen = new Set<string>();
  const assets = raw.assets.map((item) => {
    const a = record(item, ['id', 'name', 'data']),
      id = short(a.id, 80);
    check(references.has(id) && !seen.has(id), '作品包素材重复或多余');
    seen.add(id);
    check(
      typeof a.data === 'string' &&
        a.data.length > 0 &&
        a.data.length <= Math.ceil(ASSET_LIMITS.inputBytes / 3) * 4 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data),
      '作品包素材编码无效',
    );
    return { id, name: short(a.name, 40), data: a.data };
  });
  let source: SourceCredit | undefined;
  if (raw.source !== undefined) {
    const s = record(raw.source, ['versionId', 'title', 'authorName', 'verified']);
    check(typeof s.verified === 'boolean', '作品来源标记无效');
    source = {
      versionId: short(s.versionId, 80),
      title: short(s.title, 60),
      authorName: short(s.authorName, 30),
      verified: false,
    };
  }
  return {
    format: 'magic-creater-bundle',
    bundleVersion: 1,
    document,
    assets,
    ...(source ? { source } : {}),
  };
}
