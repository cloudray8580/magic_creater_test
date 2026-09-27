import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers.js';
async function member(t: Page, name: string) {
  await t.getByLabel('学生账号').fill(name);
  await t.getByLabel('学生昵称').fill(name);
  await t.getByLabel('初始密码').fill('test-password-123');
  await t.getByRole('button', { name: '添加学生' }).click();
  await expect(t.getByText(name + ' · ' + name)).toBeVisible();
}
async function point(p: Page, x: number, y: number) {
  const canvas = p.getByRole('application', { name: '关卡画布' });
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  const dims = await canvas.evaluate((el) => ({
    width: (el as SVGSVGElement).viewBox.baseVal.width / 40,
    height: (el as SVGSVGElement).viewBox.baseVal.height / 40,
  }));
  return {
    x: b.x + ((x + 0.5) / dims.width) * b.width,
    y: b.y + ((y + 0.5) / dims.height) * b.height,
  };
}
async function cell(p: Page, x: number, y: number) {
  const pos = await point(p, x, y);
  await p.mouse.click(pos.x, pos.y);
}
async function finish(p: Page) {
  await p.getByRole('button', { name: '点击进入小世界' }).click();
  await p.keyboard.down('ArrowRight');
  await expect(p.getByRole('heading', { name: '你让这个世界发生了变化' })).toBeVisible({
    timeout: 10000,
  });
  await p.keyboard.up('ArrowRight');
}
test('desktop platform creation, preview, review, peer completion and feedback', async ({
  browser,
}) => {
  const t = await browser.newPage(),
    a = await browser.newPage(),
    b = await browser.newPage();
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  await member(t, 'platformauthor');
  await member(t, 'platformpeer');
  await login(a, 'platformauthor');
  await a.getByRole('button', { name: '创作云间邮差' }).click();
  await a.getByLabel('作品名称').fill('写给同伴的小路');
  await a.getByRole('button', { name: '适合窗口', exact: true }).click();
  await a.getByRole('button', { name: '地面', exact: true }).click();
  const begin = await point(a, 3, 5),
    end = await point(a, 6, 5);
  await a.mouse.move(begin.x, begin.y);
  await a.mouse.down();
  await a.mouse.move(end.x, end.y, { steps: 4 });
  await a.mouse.up();
  await a.getByRole('button', { name: '撤销', exact: true }).click();
  await a.getByRole('button', { name: '重做', exact: true }).click();
  await a.getByRole('button', { name: '花', exact: true }).click();
  await cell(a, 5, 13);
  await a.getByLabel('编辑图层').selectOption('objects');
  await a.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await cell(a, 39, 13);
  await a.getByLabel('横坐标', { exact: true }).fill('7');
  await a.getByLabel('结束时的话').fill('这是送给你的第一封信。');
  await a.screenshot({ path: 'artifacts/m3-editor.png', fullPage: true });
  const widthBefore = await a.getByRole('application', { name: '关卡画布' }).getAttribute('width');
  await a.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await finish(a);
  await a.getByRole('button', { name: '返回编辑', exact: true }).click();
  await expect(a.getByLabel('横坐标', { exact: true })).toHaveValue('7');
  await expect(a.getByRole('application', { name: '关卡画布' })).toHaveAttribute(
    'width',
    widthBefore!,
  );
  await a.getByRole('button', { name: '选择 / 移动', exact: true }).click();
  await cell(a, 2, 13);
  const bottom = await point(a, 0, 15);
  await a.mouse.move(bottom.x, bottom.y, { steps: 12 });
  await a.getByRole('button', { name: '从格 2,13 试玩', exact: true }).click();
  await finish(a);
  await expect(a.getByText('这是辅助／指定位置试玩', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: '返回编辑', exact: true }).click();
  await cell(a, 7, 13);
  await a.getByRole('button', { name: '地面', exact: true }).click();
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await a.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PUT') await saveGate;
    await route.continue();
  });
  const imagesBefore = await a.locator('.world-canvas > image').count();
  await a.getByRole('button', { name: '保存到服务器' }).click();
  let imagesDuring: number;
  try {
    await expect(a.getByRole('button', { name: '保存到服务器' })).toBeDisabled();
    await cell(a, 0, 2);
    imagesDuring = await a.locator('.world-canvas > image').count();
  } finally {
    releaseSave();
  }
  await expect(a.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await a.unroute('**/api/projects/*');
  expect(imagesDuring).toBe(imagesBefore);
  await a.getByRole('button', { name: '提交给老师' }).click();
  await expect(a.getByText('已提交给老师，等待确认展示')).toBeVisible();
  await t.getByRole('button', { name: '刷新管理页' }).click();
  const review = t.locator('article.review').filter({ hasText: '写给同伴的小路' });
  await review.getByRole('button', { name: '确认展示' }).click();
  await expect(review.getByText('展示中', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: '查看世界设置' }).click();
  await a.getByLabel('作品名称').fill('尚未发布的新改稿');
  await a.getByRole('button', { name: '保存到服务器' }).click();
  await expect(a.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await login(b, 'platformpeer');
  await b.getByRole('button', { name: '同伴作品', exact: true }).click();
  await b
    .locator('article.card')
    .filter({ hasText: '写给同伴的小路' })
    .getByRole('button', { name: '试玩作品' })
    .click();
  await finish(b);
  await expect(b.getByText('这是送给你的第一封信。', { exact: true })).toBeVisible();
  await b.getByLabel('给创作者的反馈').fill('我喜欢你在路边放的小花');
  await b.getByRole('button', { name: '送出反馈' }).click();
  await expect(b.getByText('反馈已送出，谢谢你的发现')).toBeVisible();
  // Parent updates must not restart a completed game.
  await expect(b.getByRole('heading', { name: '你让这个世界发生了变化' })).toBeVisible();
  await a.getByRole('button', { name: '刷新版本与反馈' }).click();
  await expect(a.getByText('我喜欢你在路边放的小花')).toBeVisible();
  await b.screenshot({ path: 'artifacts/m3-peer-finished.png', fullPage: true });
  await review.getByRole('button', { name: '撤回展示' }).click();
  await t.close();
  await a.close();
  await b.close();
});
test('V2 offline draft, revision conflict and exported JSON retain all authored content', async ({
  browser,
}) => {
  const t = await browser.newPage();
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  await member(t, 'platformdraft');
  const context = await browser.newContext(),
    p = await context.newPage();
  await login(p, 'platformdraft');
  await p.getByRole('button', { name: '创作屋顶秘密' }).click();
  await p.getByLabel('作品名称').fill('云上的秘密');
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByText('已保存到服务器', { exact: true })).toBeVisible();
  const otherContext = await browser.newContext({ storageState: await context.storageState() }),
    other = await otherContext.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '继续创作' }).click();
  await context.setOffline(true);
  await p.getByLabel('作品名称').fill('离线创作的秘密');
  await expect(p.getByText('本地草稿已保存', { exact: false })).toBeVisible();
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByRole('alert')).toContainText('连接暂时不可用');
  await context.setOffline(false);
  await p.reload();
  await p.getByRole('button', { name: '继续创作' }).click();
  await expect(p.getByLabel('作品名称')).toHaveValue('离线创作的秘密');
  await other.getByLabel('作品名称').fill('另一窗口');
  await other.getByRole('button', { name: '保存到服务器' }).click();
  await expect(other.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByRole('alert')).toContainText('其他页面已保存了新版本');
  const downloaded = p.waitForEvent('download');
  await p.getByRole('button', { name: '导出当前草稿' }).click();
  const file = await (await downloaded).path();
  await p.getByRole('button', { name: '我的作品', exact: true }).click();
  await p.getByLabel('导入作品', { exact: true }).setInputFiles(file!);
  await expect(p.getByLabel('作品名称')).toHaveValue('离线创作的秘密');
  await expect(p.locator('[data-object-id="patrol"]')).toHaveCount(1);
  await otherContext.close();
  await context.close();
  await t.close();
});
