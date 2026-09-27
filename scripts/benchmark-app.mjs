import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../dist/server/app.js';
import { bootstrap } from '../dist/server/admin.js';
import { adventureTemplate } from '../dist/shared/adventure/templates.js';
import { PLATFORM_LIMITS } from '../dist/shared/adventure/document.js';
const count = Number(process.argv[2] ?? 100);
if (!Number.isInteger(count) || count < 10 || count > 100) throw Error('Edit count must be 10–100');
const temp = mkdtempSync(join(tmpdir(), 'magic-app-bench-')),
  origin = 'http://127.0.0.1:4388';
const { app, db } = await createApp({
  databasePath: join(temp, 'bench.sqlite'),
  origins: [origin],
  staticDir: resolve('dist/web'),
});
let browser;
try {
  await bootstrap(db, {
    username: 'bench',
    password: 'bench-only-password',
    displayName: '性能测试',
    classroomName: '临时测试',
  });
  await app.listen({ host: '127.0.0.1', port: 4388 });
  browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin);
  await page.getByLabel('账号', { exact: true }).fill('bench');
  await page.getByLabel('密码', { exact: true }).fill('bench-only-password');
  await page.getByRole('button', { name: '进入工坊' }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  const document = adventureTemplate(),
    r = document.rooms[0];
  document.title = '完整界面性能';
  r.width = PLATFORM_LIMITS.width;
  r.height = 64;
  const floor = 64 - Math.ceil(PLATFORM_LIMITS.tiles / r.width);
  document.start = { roomId: r.id, x: 2, y: floor - 2 };
  r.tiles = Array.from({ length: PLATFORM_LIMITS.tiles }, (_, i) => ({
    x: i % r.width,
    y: floor + Math.floor(i / r.width),
    kind: 'solid',
  }));
  r.objects = [{ id: 'goal', kind: 'goal', x: r.width - 3, y: floor - 2 }];
  for (let i = 0; i < PLATFORM_LIMITS.objects - 1; i++)
    r.objects.push({
      id: 'mover-' + i,
      kind: 'mover',
      x: 10 + (i % 20),
      y: 24 + Math.floor(i / 20),
      route: { x: 40 + (i % 20), y: 24 + Math.floor(i / 20) },
      width: 2,
      speed: 'fast',
    });
  const res = await page.request.post(origin + '/api/projects', {
    headers: { origin },
    data: { document },
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  const openStart = Date.now();
  await page
    .locator('.cards article')
    .filter({ hasText: document.title })
    .getByRole('button', { name: '继续创作' })
    .click();
  await expect(page.getByRole('application', { name: '关卡画布' })).toBeVisible();
  const openMs = Date.now() - openStart;
  await page.getByRole('button', { name: '水面', exact: true }).click();
  await page.locator('.editor-scroll').scrollIntoViewIfNeeded();
  const edits = [];
  for (let i = 0; i < count; i++) {
    const point = await page.evaluate(async (i) => {
      const s = document.querySelector('.editor-scroll');
      s.scrollTo(i * 36 - s.clientWidth / 2, 63 * 36 - s.clientHeight / 2);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const svg = document.querySelector('.world-canvas'),
        b = svg.getBoundingClientRect(),
        v = svg.viewBox.baseVal;
      return {
        x: b.x + (((i + 0.5) * 40) / v.width) * b.width,
        y: b.y + ((63.5 * 40) / v.height) * b.height,
      };
    }, i);
    await page.evaluate(() => {
      window.__editSample = new Promise((resolve, reject) => {
        let start = 0,
          saving = false;
        const begin = () => {
          start = performance.now();
        };
        document.addEventListener('pointerdown', begin, { once: true, capture: true });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(Error('edit did not persist'));
        }, 10000);
        const observer = new MutationObserver(() => {
          const text = document.body.textContent;
          if (text.includes('正在保存本地草稿')) saving = true;
          if (saving && text.includes('本地草稿已保存')) {
            observer.disconnect();
            clearTimeout(timer);
            requestAnimationFrame(() => resolve(performance.now() - start));
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      });
    });
    await page.mouse.click(point.x, point.y);
    edits.push(await page.evaluate(() => window.__editSample));
  }
  const saveStart = Date.now();
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByText('已保存到服务器', { exact: true })).toBeVisible();
  const serverSaveMs = Date.now() - saveStart;
  const sorted = [...edits].sort((a, b) => a - b);
  const report = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    frontendIndexSha256: createHash('sha256')
      .update(readFileSync('dist/web/index.html'))
      .digest('hex'),
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    host: 'i7-11700',
    viewport: '1440x1000',
    width: r.width,
    tiles: r.tiles.length,
    objects: r.objects.length,
    edits: count,
    measurement:
      'Production App; trusted Playwright mouse clicks; pointerdown through actual App.persist, IndexedDB acknowledgement and next rAF; opening/server save include browser-control roundtrip',
    openMs,
    serverSaveMs,
    editP50Ms: sorted[Math.floor(count * 0.5)],
    editP95Ms: sorted[Math.floor(count * 0.95)],
    editMaxMs: sorted.at(-1),
    samples: edits,
  };
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync('artifacts/benchmarks/app.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, samples: undefined }));
} finally {
  await browser?.close();
  await app.close();
  rmSync(temp, { recursive: true, force: true });
}
