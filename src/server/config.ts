import { resolve } from 'node:path';
import type { AppOptions } from './app.js';
export interface ServerConfig extends AppOptions {
  host: string;
  port: number;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (!env.APP_DATABASE || !env.APP_ORIGINS) throw new Error('需要 APP_DATABASE 和 APP_ORIGINS');
  const origins = env.APP_ORIGINS.split(',').map((s) => s.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
      throw new Error('APP_ORIGINS 必须是完整来源地址');
  }
  const port = Number(env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 无效');
  return {
    databasePath: resolve(env.APP_DATABASE),
    origins,
    host: env.HOST ?? '127.0.0.1',
    port,
    secureCookies: origins.every((o) => o.startsWith('https://')),
    staticDir: resolve(env.APP_STATIC_DIR ?? 'dist/web'),
    logger: env.APP_LOGGER !== 'false',
  };
}
