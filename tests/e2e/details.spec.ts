import { test, expect } from '@playwright/test';
import { login } from './helpers.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
test('fit zoom is monotonic, selected spawn deletes and undoes, and a long dialogue retains reachable choices', async ({
  page,
}) => {
  await login(page, 'teacher');
  await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
  await page.getByRole('button', { name: '适合窗口', exact: true }).click();
  const canvas = page.getByRole('application', { name: '关卡画布' });
  const fitted = Number(await canvas.getAttribute('width'));
  await page.getByRole('button', { name: '缩小地图' }).click();
  expect(Number(await canvas.getAttribute('width'))).toBeLessThan(fitted);
  await page.getByRole('button', { name: '放大地图' }).click();
  expect(Number(await canvas.getAttribute('width'))).toBeCloseTo(fitted);
  await page.getByLabel('编辑图层').selectOption('objects');
  await page.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await page.locator('[data-object-id="@start"]').click();
  await canvas.focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-object-id="@start"]')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('[data-object-id="@start"]')).toHaveCount(1);
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.evaluate(() => {
    globalThis.document.body.style.zoom = '1.25';
  });
  const document = adventureTemplate('forest-letter');
  document.title = '长对话体验验证';
  const npc = document.rooms[1].objects.find((o) => o.kind === 'npc')!;
  document.start = { roomId: document.rooms[1].id, x: npc.x - 1, y: npc.y };
  npc.dialogue = [
    {
      id: 'long',
      text: '一行可读的故事。\n'.repeat(20),
      choices: [
        { label: '继续探索'.repeat(10) },
        { label: '留下一份礼物'.repeat(10) },
        { label: '等一阵晚风'.repeat(10) },
      ],
    },
  ];
  const response = await page.request.post('/api/projects', {
    headers: { origin: 'http://127.0.0.1:4273' },
    data: { document },
  });
  expect(response.status()).toBe(201);
  await page.reload();
  await page.evaluate(() => {
    globalThis.document.body.style.zoom = '1.25';
  });
  await page
    .locator('.cards article')
    .filter({ hasText: document.title })
    .getByRole('button', { name: '继续创作' })
    .click();
  await page.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  await page.keyboard.press('e');
  const dialogue = page.getByRole('dialog');
  await expect(dialogue).toBeVisible();
  expect(await dialogue.locator('p').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const stage = await page.locator('.game-stage').boundingBox(),
    box = await dialogue.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(box!.y + box!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  await page.screenshot({ path: 'artifacts/m8-long-dialogue.png', fullPage: true });
  await page.getByRole('button', { name: '等一阵晚风'.repeat(10), exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialogue).toHaveCount(0);
});
