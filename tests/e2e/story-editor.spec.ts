import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers.js';
async function cell(page: Page, x: number, y: number) {
  const canvas = page.getByRole('application', { name: '关卡画布' });
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const view = await canvas.evaluate((el) => ({
    width: (el as SVGSVGElement).viewBox.baseVal.width,
    height: (el as SVGSVGElement).viewBox.baseVal.height,
  }));
  await page.mouse.click(
    bounds.x + (((x + 0.5) * 40) / view.width) * bounds.width,
    bounds.y + (((y + 0.5) * 40) / view.height) * bounds.height,
  );
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
async function finishStory(page: Page) {
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  await step(page, 'ArrowDown', '2,8');
  await step(page, 'ArrowRight', '3,8');
  await expect(page.locator('.inventory')).toContainText('一封来信');
  await step(page, 'ArrowRight', '4,8');
  await step(page, 'ArrowUp', '4,7');
  await step(page, 'ArrowRight', '5,7');
  await step(page, 'ArrowUp', '5,6');
  await step(page, 'ArrowRight', '8,6');
  await step(page, 'ArrowDown', '8,7');
  await step(page, 'ArrowRight', '2,7');
  await expect(page.locator('.game-heading')).toContainText('狐狸的树屋');
  await step(page, 'ArrowRight', '7,7');
  await step(page, 'ArrowUp', '7,5');
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toContainText('我在等这封星光来信');
  await page.getByRole('button', { name: '交出星光来信', exact: true }).click();
  await expect(page.locator('.inventory')).toContainText('还没有物品');
  await page.getByRole('button', { name: '继续旅程' }).click();
  await step(page, 'ArrowDown', '7,7');
  await step(page, 'ArrowRight', '2,2');
  await expect(page.locator('.game-heading')).toContainText('星光阳台');
  await step(page, 'ArrowRight', '5,2');
  await expect(page.getByRole('heading', { name: '你让这个世界发生了变化' })).toBeVisible();
  await expect(page.getByText('这盏灯，因为你的来信亮了。', { exact: true })).toBeVisible();
}
test('a student authors three rooms, dialogue and a task ending; a peer plays and responds', async ({
  browser,
}) => {
  const t = await browser.newPage(),
    author = await browser.newPage(),
    peer = await browser.newPage();
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  for (const name of ['storyauthor', 'storypeer']) {
    await t.getByLabel('学生账号').fill(name);
    await t.getByLabel('学生昵称').fill(name);
    await t.getByLabel('初始密码').fill('test-password-123');
    await t.getByRole('button', { name: '添加学生' }).click();
    await expect(t.getByText(name + ' · ' + name)).toBeVisible();
  }
  await login(author, 'storyauthor');
  await author.getByRole('button', { name: '创作森林里的来信' }).click();
  await author.getByLabel('作品名称').fill('星光邮局');
  await author.getByLabel('事件名称').fill('已点亮星光');
  await author.getByRole('button', { name: '狐狸的树屋', exact: true }).click();
  await author.getByRole('button', { name: '适合窗口', exact: true }).click();
  await cell(author, 8, 5);
  await author.getByLabel('物体名称').fill('守星人');
  await author.getByLabel('物体外形').selectOption('robot');
  const receive = author.locator('details.dialogue-page').nth(1);
  await receive.locator('summary').click();
  await receive.getByLabel('人物说的话').fill('我在等这封星光来信。愿意交给我吗？');
  await receive.getByLabel('选项文字').fill('交出星光来信');
  await author.getByRole('button', { name: '查看世界设置' }).click();
  await author.getByRole('button', { name: '添加房间' }).click();
  await author.getByLabel('房间名称').fill('星光阳台');
  await author.getByLabel('地板').selectOption('wood');
  await author.getByRole('button', { name: '适合窗口', exact: true }).click();
  await author.getByRole('button', { name: '终点', exact: true }).click();
  await cell(author, 5, 2);
  await author.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await cell(author, 5, 2);
  await author.getByLabel('结束时的话').fill('这盏灯，因为你的来信亮了。');
  await author.getByLabel('添加条件').selectOption('flag:已点亮星光');
  await author.getByRole('button', { name: '花', exact: true }).click();
  await cell(author, 4, 2);
  await author.getByRole('button', { name: '狐狸的树屋', exact: true }).click();
  await author.getByLabel('编辑图层').selectOption('objects');
  await author.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await cell(author, 12, 7);
  await author.getByRole('button', { name: '删除物体' }).click();
  await author.getByRole('button', { name: '传送门', exact: true }).click();
  await cell(author, 12, 7);
  await author.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await cell(author, 12, 7);
  await author.getByLabel('目的房间').selectOption({ label: '星光阳台' });
  await author.getByRole('button', { name: '在目的房间选落点' }).click();
  await cell(author, 2, 2);
  await expect(author.getByText('当前落点：星光阳台 (2,2)')).toBeVisible();
  await author.screenshot({ path: 'artifacts/m4-story-editor.png', fullPage: true });
  await author.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await finishStory(author);
  await author.getByRole('button', { name: '返回编辑', exact: true }).click();
  await author.getByRole('button', { name: '保存到服务器' }).click();
  await expect(author.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await author.getByRole('button', { name: '提交给老师' }).click();
  await expect(author.getByText('已提交给老师，等待确认展示')).toBeVisible();
  await t.getByRole('button', { name: '刷新管理页' }).click();
  const review = t.locator('article.review').filter({ hasText: '星光邮局' });
  await review.getByRole('button', { name: '确认展示' }).click();
  await expect(review.getByText('展示中', { exact: true })).toBeVisible();
  await login(peer, 'storypeer');
  await peer.getByRole('button', { name: '同伴作品', exact: true }).click();
  await peer
    .locator('article.card')
    .filter({ hasText: '星光邮局' })
    .getByRole('button', { name: '试玩作品' })
    .click();
  await finishStory(peer);
  await peer.getByLabel('给创作者的反馈').fill('我喜欢交出信后去阳台的设计');
  await peer.getByRole('button', { name: '送出反馈' }).click();
  await expect(peer.getByText('反馈已送出，谢谢你的发现')).toBeVisible();
  await author.getByRole('button', { name: '刷新版本与反馈' }).click();
  await expect(author.getByText('我喜欢交出信后去阳台的设计')).toBeVisible();
  await peer.screenshot({ path: 'artifacts/m4-story-finished.png', fullPage: true });
  await review.getByRole('button', { name: '撤回展示' }).click();
  await t.close();
  await author.close();
  await peer.close();
});
