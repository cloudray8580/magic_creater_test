export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function bodyObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new HttpError(400, '请求字段无效');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw new HttpError(400, name + '长度需要' + min + '至' + max + '个字符');
  return value;
}
export function username(value: unknown): string {
  const result = text(value, '账号', 3, 32);
  if (!/^[a-z0-9_-]+$/.test(result))
    throw new HttpError(400, '账号仅支持小写字母、数字、下划线和短横线');
  return result;
}
export function password(value: unknown): string {
  return text(value, '密码', 10, 128);
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new HttpError(400, '作品修订号无效');
  return value as number;
}
