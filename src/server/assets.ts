import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import { HttpError, text } from './input.js';
import { ASSET_LIMITS, documentAssets } from '../shared/portable.js';
import type { CreativeDocument } from '../shared/creative.js';
export interface AssetRow {
  id: string;
  owner_id: string;
  name: string;
  digest: string;
  data: Buffer;
  created_at: number;
}
export function assetView(a: AssetRow) {
  return { id: a.id, name: a.name, bytes: a.data.length, createdAt: a.created_at };
}
export async function normalizeImage(value: unknown): Promise<Buffer> {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > Math.ceil(ASSET_LIMITS.inputBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new HttpError(400, '图片编码无效或超过2MiB');
  const data = Buffer.from(value, 'base64');
  if (data.length > ASSET_LIMITS.inputBytes) throw new HttpError(400, '图片不能超过2MiB');
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new HttpError(400, '请选择PNG、JPEG或WebP静态图片');
  // libvips may expose only the default frame of APNG; reject its animation chunk explicitly.
  if (png)
    for (let offset = 8; offset + 12 <= data.length;) {
      const length = data.readUInt32BE(offset);
      if (length > data.length - offset - 12) break;
      if (data.toString('ascii', offset + 4, offset + 8) === 'acTL')
        throw new HttpError(400, '暂不支持动画图片');
      offset += length + 12;
    }
  try {
    const image = sharp(data, { limitInputPixels: ASSET_LIMITS.pixels, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? ''))
      throw new HttpError(400, '图片格式无效');
    if ((metadata.pages ?? 1) > 1) throw new HttpError(400, '暂不支持动画图片');
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > ASSET_LIMITS.edge ||
      metadata.height > ASSET_LIMITS.edge
    )
      throw new HttpError(400, '图片尺寸不能超过4096像素');
    const result = await image
      .rotate()
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    if (result.length > ASSET_LIMITS.storedBytes) throw new HttpError(400, '处理后的图片过大');
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '图片无法解码或尺寸过大，请换一张图片');
  }
}
/** Receives decoded canonical PNGs only; called within the surrounding write transaction. */
export function storeImage(db: Db, ownerId: string, name: string, data: Buffer): AssetRow {
  text(name, '素材名称', 1, 40);
  const digest = createHash('sha256').update(data).digest('hex');
  const previous = db
    .prepare('SELECT * FROM assets WHERE owner_id=? AND digest=?')
    .get(ownerId, digest) as AssetRow | undefined;
  if (previous) return previous;
  const quota = db
    .prepare(
      'SELECT COUNT(*) AS n,COALESCE(SUM(length(data)),0) AS bytes FROM assets WHERE owner_id=?',
    )
    .get(ownerId) as { n: number; bytes: number };
  if (quota.n >= ASSET_LIMITS.count || quota.bytes + data.length > ASSET_LIMITS.totalBytes)
    throw new HttpError(400, '个人素材额度已满（100张/32MiB），请重用已有图片');
  const id = randomUUID(),
    created_at = Date.now();
  db.prepare(
    'INSERT INTO assets(id,owner_id,name,digest,data,created_at) VALUES (?,?,?,?,?,?)',
  ).run(id, ownerId, name, digest, data, created_at);
  return { id, owner_id: ownerId, name, digest, data, created_at };
}
export function requireOwnedAssets(db: Db, ownerId: string, document: CreativeDocument) {
  for (const id of documentAssets(document))
    if (!db.prepare('SELECT id FROM assets WHERE id=? AND owner_id=?').get(id, ownerId))
      throw new HttpError(400, '作品含不存在或不属于你的素材，请导入带图片的作品包');
}
