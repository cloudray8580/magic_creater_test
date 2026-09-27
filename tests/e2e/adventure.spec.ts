import { test, expect, type Page } from '@playwright/test';
async function samples(page: Page) {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill('teacher');
  await page.getByLabel('密码', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: '进入工坊' }).click();
  await page.getByRole('button', { name: '灵感样板', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: '点击进入小世界' }).click();
}
async function step(page: Page, key: string, position: string) {
  await page.keyboard.down(key);
  await page.waitForFunction(
    (p) => document.querySelector('.game-coordinate')?.textContent === p,
    position,
    { timeout: 7000 },
  );
  await page.keyboard.up(key);
}
test('platform sample: keyboard, pause, switches, ending and scene disposal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await samples(page);
  await expect(page.locator('.game-coordinate')).toHaveText('2,13');
  await page.waitForTimeout(300); // Allow the initial short fall to reach the ground.
  await page.keyboard.down('Space');
  await expect(page.locator('.game-coordinate')).not.toHaveText('2,13');
  await page.keyboard.up('Space');
  await expect(page.locator('.game-coordinate')).toHaveText('2,13');
  await page.screenshot({ path: 'artifacts/platform-sample.png', fullPage: true });
  await step(page, 'ArrowRight', '24,13');
  await page.keyboard.press('e');
  await expect(page.getByRole('status').last()).toContainText('开关亮起来');
  await page.keyboard.down('ArrowRight');
  await expect(page.getByText('你让这个世界发生了变化')).toBeVisible();
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: '再走一遍，看看不同的风景' }).click();
  await expect(page.locator('.game-coordinate')).toHaveText('2,13');
  await page
    .getByRole('button', { name: '森林里的来信 把信带给狐狸。先想办法打开通往森林的门。' })
    .click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('story sample: push box, inventory, room portal, dialogue choice, ending and undo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await samples(page);
  await page
    .getByRole('button', { name: '森林里的来信 把信带给狐狸。先想办法打开通往森林的门。' })
    .click();
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  await page.screenshot({ path: 'artifacts/story-sample.png', fullPage: true });
  await step(page, 'ArrowDown', '2,8');
  await step(page, 'ArrowRight', '3,8');
  await expect(page.locator('.inventory')).toContainText('一封来信');
  await step(page, 'ArrowRight', '4,8');
  await step(page, 'ArrowUp', '4,7');
  await step(page, 'ArrowRight', '5,7'); // box now rests on the pressure plate
  await step(page, 'ArrowUp', '5,6');
  await step(page, 'ArrowRight', '8,6');
  await step(page, 'ArrowDown', '8,7');
  await step(page, 'ArrowRight', '2,7'); // portal
  await expect(page.locator('.game-heading')).toContainText('狐狸的树屋');
  await step(page, 'ArrowRight', '7,7');
  await step(page, 'ArrowUp', '7,5');
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toContainText('写给我的信');
  await page.getByRole('button', { name: '把信交给狐狸', exact: true }).click();
  await expect(page.locator('.inventory')).toContainText('还没有物品');
  await page.getByRole('button', { name: '继续旅程' }).click();
  await step(page, 'ArrowDown', '7,7');
  await step(page, 'ArrowRight', '12,7');
  await expect(page.getByText('你让这个世界发生了变化')).toBeVisible();
  await page.getByRole('button', { name: '撤销一步', exact: true }).click();
  await expect(page.getByText('你让这个世界发生了变化')).toHaveCount(0);
  expect(errors).toEqual([]);
});
