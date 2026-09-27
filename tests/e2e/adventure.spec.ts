import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers.js';
async function samples(page: Page) {
  await login(page, 'teacher');
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

test('remaining story templates: lighthouse delivery and both cottage choices with real keyboard input', async ({
  page,
}) => {
  await samples(page);
  await page
    .getByRole('button', { name: '找回灯塔的光 点亮两处电源，取出电池，帮助守灯人照亮归途。' })
    .click();
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  await step(page, 'ArrowRight', '4,7');
  await step(page, 'ArrowUp', '4,4');
  await page.keyboard.press('e');
  await step(page, 'ArrowDown', '4,9');
  await step(page, 'ArrowRight', '6,9');
  await page.keyboard.press('e');
  await step(page, 'ArrowUp', '6,7');
  await step(page, 'ArrowRight', '10,7');
  await step(page, 'ArrowUp', '10,4');
  await step(page, 'ArrowRight', '12,4');
  await expect(page.locator('.inventory')).toContainText('电池');
  await step(page, 'ArrowDown', '12,7');
  await step(page, 'ArrowRight', '2,7');
  await step(page, 'ArrowRight', '7,7');
  await step(page, 'ArrowUp', '7,5');
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '交出电池', exact: true }).click();
  await page.getByRole('button', { name: '继续旅程' }).click();
  await step(page, 'ArrowDown', '7,7');
  await step(page, 'ArrowRight', '12,7');
  await expect(
    page.getByText('灯塔亮起来了。每一艘小船，都能找到回家的方向。', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/m6-lighthouse-finished.png', fullPage: true });
  for (const choice of ['一起看星星', '把信放在桌上']) {
    if (choice === '一起看星星') {
      await page
        .getByRole('button', { name: '我的秘密小屋 来做客吧！一间可以藏故事、礼物与秘密的小屋。' })
        .click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.screenshot({ path: 'artifacts/m6-cottage-start.png', fullPage: true });
    } else await page.getByRole('button', { name: '再走一遍，看看不同的风景' }).click();
    if (choice === '把信放在桌上') {
      await step(page, 'ArrowDown', '2,8');
      await step(page, 'ArrowRight', '3,8');
      await step(page, 'ArrowUp', '3,7');
    }
    await step(page, 'ArrowUp', choice === '把信放在桌上' ? '3,5' : '2,5');
    await step(page, 'ArrowRight', '10,5');
    await page.keyboard.press('e');
    await page.getByRole('button', { name: choice, exact: true }).click();
    await expect(
      page.getByText(
        choice === '一起看星星'
          ? '我们把灯关小，一起听见了星星的声音。'
          : '信静静躺在桌上。明天，会有人带着新的故事来。',
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({
      path:
        choice === '一起看星星'
          ? 'artifacts/m6-cottage-stars.png'
          : 'artifacts/m6-cottage-letter.png',
      fullPage: true,
    });
  }
});
