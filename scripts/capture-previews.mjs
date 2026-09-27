import { chromium, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../dist/server/app.js';
import { bootstrap } from '../dist/server/admin.js';
import { TEMPLATE_IDS, TEMPLATE_INFO } from '../dist/shared/adventure/templates.js';
const dir = mkdtempSync(join(tmpdir(), 'magic-previews-')),
  origin = 'http://127.0.0.1:4386';
const { app, db } = await createApp({
  databasePath: join(dir, 'preview.sqlite'),
  origins: [origin],
  staticDir: resolve('dist/web'),
});
let browser;
try {
  await bootstrap(db, {
    username: 'preview',
    password: 'preview-only-password',
    displayName: '预览',
    classroomName: '临时预览',
  });
  await app.listen({ host: '127.0.0.1', port: 4386 });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin);
  await page.getByLabel('账号', { exact: true }).fill('preview');
  await page.getByLabel('密码', { exact: true }).fill('preview-only-password');
  await page.getByRole('button', { name: '进入工坊' }).click();
  mkdirSync('public/art/template-previews', { recursive: true });
  for (const id of TEMPLATE_IDS) {
    await page
      .getByRole('button', { name: '先玩一玩' + TEMPLATE_INFO[id].title, exact: true })
      .click();
    await page.getByRole('button', { name: '点击进入小世界' }).click();
    const canvas = page.locator('.game-stage canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(350);
    const native = await canvas.evaluate((el) => el.toDataURL('image/webp', 0.9));
    writeFileSync(
      'public/art/template-previews/' + id + '.webp',
      Buffer.from(native.split(',')[1], 'base64'),
    );
    await page.getByRole('button', { name: '我的作品', exact: true }).click();
  }
  console.log(
    JSON.stringify({ previews: TEMPLATE_IDS, source: 'native game canvas', isolatedData: true }),
  );
} finally {
  await browser?.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
}
