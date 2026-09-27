import { chromium, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createApp } from '../dist/server/app.js';
import { bootstrap } from '../dist/server/admin.js';
import { adventureTemplate } from '../dist/shared/adventure/templates.js';
import { PLATFORM_LIMITS } from '../dist/shared/adventure/document.js';
const durationMs = 30 * 60 * 1000,
  origin = 'http://127.0.0.1:4387';
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'public', 'scripts'], {
  encoding: 'utf8',
}).trim();
if (dirty) throw Error('Commit source, art and scripts before the fixed-build stability run');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const temp = mkdtempSync(join(tmpdir(), 'magic-stability-'));
cpSync('dist/web', join(temp, 'web'), { recursive: true });
const frontendIndexSha256 = createHash('sha256')
  .update(readFileSync(join(temp, 'web/index.html')))
  .digest('hex');
const { app, db } = await createApp({
  databasePath: join(temp, 'test.sqlite'),
  origins: [origin],
  staticDir: join(temp, 'web'),
});
let browser;
const report = {
  commit,
  frontendIndexSha256,
  host: 'i7-11700',
  viewport: '1440x1000',
  requiredDurationMs: durationMs,
  isolatedData: true,
  samples: [],
  errors: [],
};
const persist = () => {
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync('artifacts/benchmarks/stability.json', JSON.stringify(report, null, 2) + '\n');
};
try {
  await bootstrap(db, {
    username: 'stability',
    password: 'stability-only-password',
    displayName: '稳定性测试',
    classroomName: '临时测试',
  });
  await app.listen({ host: '127.0.0.1', port: 4387 });
  browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel('账号', { exact: true }).fill('stability');
  await page.getByLabel('密码', { exact: true }).fill('stability-only-password');
  await page.getByRole('button', { name: '进入工坊' }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  const platform = adventureTemplate(),
    room = platform.rooms[0];
  room.width = PLATFORM_LIMITS.width;
  room.height = 64;
  const floor = 64 - Math.ceil(PLATFORM_LIMITS.tiles / room.width);
  platform.start = { roomId: room.id, x: 2, y: floor - 2 };
  platform.title = '稳定性长地图';
  room.tiles = Array.from({ length: PLATFORM_LIMITS.tiles }, (_, i) => ({
    x: i % room.width,
    y: floor + Math.floor(i / room.width),
    kind: 'solid',
  }));
  room.objects = [{ id: 'goal', kind: 'goal', x: room.width - 3, y: floor - 2 }];
  for (let i = 0; i < PLATFORM_LIMITS.objects - 1; i++)
    room.objects.push({
      id: 'flower-' + i,
      kind: 'decoration',
      skin: 'flower',
      x: (i * 7) % room.width,
      y: floor - 2,
    });
  const story = adventureTemplate('lighthouse');
  story.title = '稳定性灯塔';
  const projects = [];
  for (const document of [platform, story]) {
    const response = await page.request.post(origin + '/api/projects', {
      headers: { origin },
      data: { document },
    });
    expect(response.ok()).toBe(true);
    projects.push(await response.json());
  }
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  const started = Date.now();
  report.startedAt = new Date(started).toISOString();
  let cycle = 0;
  while (Date.now() - started < durationMs) {
    const index = cycle % 2,
      project = projects[index];
    await page
      .locator('.cards article')
      .filter({ hasText: project.document.title })
      .getByRole('button', { name: '继续创作' })
      .click();
    const title = '稳定性' + index + '第' + cycle + '次';
    await page.getByLabel('作品名称').fill(title);
    await expect(page.getByText('本地草稿已保存', { exact: false })).toBeVisible();
    if (index === 0) {
      await page.getByRole('button', { name: '定位终点', exact: true }).click();
      await page.getByRole('button', { name: '定位起点', exact: true }).click();
    }
    await page.getByRole('button', { name: '试玩关卡', exact: true }).click();
    await page.getByRole('button', { name: '点击进入小世界' }).click();
    await expect(page.locator('.game-stage canvas')).toHaveCount(1);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');
    // Remain in the real scene; no accelerated or simulated passage of wall-clock time.
    await page.waitForTimeout(9000);
    await page.getByRole('button', { name: '返回编辑', exact: true }).click();
    await expect(page.locator('.game-stage canvas')).toHaveCount(0);
    await expect(page.getByLabel('作品名称')).toHaveValue(title);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByLabel('作品名称')).toHaveValue(project.document.title);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.getByLabel('作品名称')).toHaveValue(title);
    await page.getByRole('button', { name: '保存到服务器' }).click();
    await expect(page.getByText('已保存到服务器', { exact: true })).toBeVisible();
    project.document.title = title;
    await page.getByRole('button', { name: '我的作品', exact: true }).click();
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'),
      dom = await cdp.send('Memory.getDOMCounters');
    const sample = {
      cycle,
      game: index === 0 ? 'platformer' : 'story',
      elapsedMs: Date.now() - started,
      retainedHeapMiB: heap.usedSize / 1048576,
      domNodes: dom.nodes,
      documents: dom.documents,
      jsEventListeners: dom.jsEventListeners,
    };
    report.samples.push(sample);
    persist();
    if (cycle % 6 === 0) console.log(JSON.stringify(sample));
    if (report.errors.length) throw Error(report.errors.join(';'));
    await page.waitForTimeout(10000);
    cycle++;
  }
  report.elapsedMs = Date.now() - started;
  report.byGame = Object.fromEntries(
    ['platformer', 'story'].map((game) => {
      const samples = report.samples.slice(6).filter((s) => s.game === game),
        first = samples[0],
        last = samples.at(-1);
      const retainedHeapGrowthMiB = last.retainedHeapMiB - first.retainedHeapMiB;
      if (retainedHeapGrowthMiB > 40) throw Error(game + ': retained heap growth exceeds 40MiB');
      if (last.documents > first.documents + 3)
        throw Error(game + ': detached documents accumulated');
      return [game, { cycles: samples.length, retainedHeapGrowthMiB, first, last }];
    }),
  );
  report.retainedHeapGrowthMiB = Math.max(
    ...Object.values(report.byGame).map((r) => r.retainedHeapGrowthMiB),
  );
  report.status = 'passed';
  persist();
  console.log(
    JSON.stringify({
      status: report.status,
      elapsedMs: report.elapsedMs,
      cycles: report.samples.length,
      retainedHeapGrowthMiB: report.retainedHeapGrowthMiB,
    }),
  );
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  persist();
  throw error;
} finally {
  await browser?.close();
  await app.close();
  rmSync(temp, { recursive: true, force: true });
}
