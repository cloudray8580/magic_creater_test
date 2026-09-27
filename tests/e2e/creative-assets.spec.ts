import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { login } from './helpers.js';
async function cell(page: Page, x: number, y: number) {
  const canvas = page.getByRole('application', { name: '关卡画布' });
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  const size = await canvas.evaluate((el) => ({
    x: (el as SVGSVGElement).viewBox.baseVal.width,
    y: (el as SVGSVGElement).viewBox.baseVal.height,
  }));
  await page.mouse.click(
    b.x + (((x + 0.5) * 40) / size.x) * b.width,
    b.y + (((y + 0.5) * 40) / size.y) * b.height,
  );
}
async function finish(page: Page, mode: 'platformer' | 'story') {
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  if (mode === 'story') {
    const walk = async (key: string, position: string) => {
      await page.keyboard.down(key);
      await page.waitForFunction(
        (p) => document.querySelector('.game-coordinate')?.textContent === p,
        position,
      );
      await page.keyboard.up(key);
    };
    await walk('ArrowUp', '2,5');
    await walk('ArrowRight', '10,5');
    await page.keyboard.press('e');
    await page.getByRole('button', { name: '我想再逛逛小屋', exact: true }).click();
    await walk('ArrowDown', '10,8');
    await page.keyboard.down('ArrowLeft');
    await expect(page.getByRole('heading', { name: '你让这个世界发生了变化' })).toBeVisible();
    await page.keyboard.up('ArrowLeft');
    return;
  }
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('heading', { name: '你让这个世界发生了变化' })).toBeVisible({
    timeout: 10000,
  });
  await page.keyboard.up('ArrowRight');
}
for (const mode of ['platformer', 'story'] as const)
  test(
    mode + ' personal art, peer play, location feedback, remix and offline portable roundtrip',
    async ({ browser }) => {
      test.setTimeout(90000);
      const teacher = await browser.newPage(),
        author = await browser.newPage(),
        peer = await browser.newPage();
      const title = mode === 'platformer' ? '我的小星星旅程' : '小星星来做客',
        suffix = mode === 'platformer' ? 'p' : 's';
      await login(teacher, 'teacher');
      await teacher.getByRole('button', { name: '老师管理', exact: true }).click();
      for (const who of ['artauthor' + suffix, 'artpeer' + suffix]) {
        await teacher.getByLabel('学生账号').fill(who);
        await teacher.getByLabel('学生昵称').fill(who);
        await teacher.getByLabel('初始密码').fill('test-password-123');
        await teacher.getByRole('button', { name: '添加学生' }).click();
        await expect(teacher.getByText(who + ' · ' + who)).toBeVisible();
      }
      await login(author, 'artauthor' + suffix);
      await author
        .getByRole('button', { name: mode === 'platformer' ? '创作云间邮差' : '创作我的秘密小屋' })
        .click();
      await author.getByLabel('作品名称').fill(title);
      await author.getByRole('button', { name: '自己的图片与涂鸦' }).click();
      const picture = await sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 20L157 86L229 96L177 147L191 221L128 185L65 221L79 147L27 96L99 86Z" fill="#f6cd73" stroke="#587f70" stroke-width="8" stroke-linejoin="round"/><circle cx="104" cy="119" r="7" fill="#40574e"/><circle cx="153" cy="119" r="7" fill="#40574e"/><path d="M110 148Q128 164 147 147" fill="none" stroke="#40574e" stroke-width="7" stroke-linecap="round"/></svg>',
        ),
      )
        .png()
        .toBuffer();
      await author
        .getByLabel('上传个人图片')
        .setInputFiles({ name: '我的星星.png', mimeType: 'image/png', buffer: picture });
      await expect(
        author.getByText('已使用这张图片。可以撤销换图。', { exact: true }),
      ).toBeVisible();
      await expect(author.getByRole('combobox', { name: '主角', exact: true })).toHaveValue(
        /^asset:/,
      );
      await author.getByLabel('主角配件').selectOption('none');
      await expect(author.getByAltText('主角外观预览')).toHaveAttribute('src', /^data:image/);
      await author.getByRole('button', { name: '适合窗口', exact: true }).click();
      await cell(author, mode === 'platformer' ? 39 : 13, mode === 'platformer' ? 13 : 8);
      await author.getByLabel('横坐标', { exact: true }).fill(mode === 'platformer' ? '7' : '4');
      await author.getByLabel('结束时的话').fill('谢谢你和我的小星星一起旅行。');
      if (mode === 'platformer') {
        await author.getByRole('button', { name: '花', exact: true }).click();
        await cell(author, 6, 13);
        await author.getByRole('button', { name: '选择 / 移动', exact: true }).click();
        await cell(author, 6, 13);
      } else {
        await cell(author, 3, 8);
      }
      await author.getByRole('button', { name: '自己的图片与涂鸦' }).click();
      const drawing = author.getByLabel('个人涂鸦画板');
      await drawing.scrollIntoViewIfNeeded();
      const bounds = (await drawing.boundingBox())!;
      await author.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5);
      await author.mouse.down();
      for (let i = 0; i <= 16; i++) {
        const a = (i * Math.PI) / 8;
        await author.mouse.move(
          bounds.x + bounds.width * (0.5 + 0.22 * Math.cos(a)),
          bounds.y + bounds.height * (0.5 + 0.22 * Math.sin(a)),
        );
      }
      await author.mouse.up();
      await author.getByRole('button', { name: '把画作用到这里' }).click();
      await expect(
        author.getByText('已使用这张图片。可以撤销换图。', { exact: true }),
      ).toBeVisible();
      await author.getByRole('button', { name: '查看世界设置' }).click();
      await author.getByLabel('保存并允许同伴改编').click();
      await expect(author.getByLabel('保存并允许同伴改编')).toBeChecked();
      await expect(author.getByText('已保存改编设置，下次提交并展示后生效。')).toBeVisible();
      await author.screenshot({ path: 'artifacts/m5-' + mode + '-editor.png', fullPage: true });
      await author.getByRole('button', { name: '试玩关卡', exact: true }).click();
      await finish(author, mode);
      await author.getByRole('button', { name: '返回编辑', exact: true }).click();
      await author.getByRole('button', { name: '提交给老师' }).click();
      await expect(author.getByText('已提交给老师，等待确认展示')).toBeVisible();
      await teacher.getByRole('button', { name: '刷新管理页' }).click();
      const review = teacher.locator('article.review').filter({ hasText: title });
      await review.getByRole('button', { name: '确认展示' }).click();
      await expect(review.getByText('展示中', { exact: true })).toBeVisible();
      await author.getByLabel('作品名称').fill(title + '新改稿');
      await author.getByRole('button', { name: '保存到服务器' }).click();
      await expect(author.getByText('已保存到服务器', { exact: true })).toBeVisible();
      await login(peer, 'artpeer' + suffix);
      await peer.getByRole('button', { name: '同伴作品', exact: true }).click();
      await peer
        .locator('article.card')
        .filter({ hasText: title })
        .getByRole('button', { name: '试玩作品' })
        .click();
      await finish(peer, mode);
      await peer.getByRole('button', { name: '记录当前位置' }).click();
      await expect(peer.getByText('已记录：', { exact: false })).toBeVisible();
      await peer.getByLabel('给创作者的反馈').fill('我喜欢你画的小星星和礼物');
      await peer.getByRole('button', { name: '送出反馈' }).click();
      await expect(peer.getByText('反馈已送出，谢谢你的发现')).toBeVisible();
      await author.getByRole('button', { name: '刷新版本与反馈' }).click();
      await author.getByRole('button', { name: '查看反馈位置' }).click();
      await expect(author.locator('.feedback-map figcaption')).toContainText(title);
      await expect(author.locator('.feedback-map figcaption')).not.toContainText('新改稿');
      await expect(author.getByRole('img', { name: /反馈位置/ })).toBeVisible();
      await peer.getByRole('button', { name: '改编这个作品' }).click();
      await expect(peer.getByLabel('作品名称')).toHaveValue(title + ' 改编');
      await expect(peer.locator('.source-credit')).toContainText('改编自：artauthor' + suffix);
      await expect(peer.getByLabel('保存并允许同伴改编')).not.toBeChecked();
      await expect(peer.getByAltText('主角外观预览')).toHaveAttribute('src', /^data:image/);
      await peer.context().setOffline(true);
      const downloaded = peer.waitForEvent('download');
      await peer.getByRole('button', { name: '导出当前草稿' }).click();
      const file = (await (await downloaded).path())!;
      const bundle = JSON.parse(await readFile(file, 'utf8'));
      expect(bundle.assets).toHaveLength(2);
      expect(bundle.source.verified).toBe(true);
      expect(bundle.document.hero.skin).toMatch(/^asset:/);
      await peer.context().setOffline(false);
      await peer.getByRole('button', { name: '我的作品', exact: true }).click();
      await peer.getByLabel('导入作品', { exact: true }).setInputFiles(file);
      await expect(peer.getByLabel('作品名称')).toHaveValue(title + ' 改编');
      await expect(peer.locator('.source-credit')).toContainText('文件注明来源');
      await expect(peer.getByAltText('主角外观预览')).toHaveAttribute('src', /^data:image/);
      await peer.getByRole('button', { name: '试玩关卡', exact: true }).click();
      await finish(peer, mode);
      await peer.screenshot({ path: 'artifacts/m5-' + mode + '-roundtrip.png', fullPage: true });
      await review.getByRole('button', { name: '撤回展示' }).click();
      await teacher.close();
      await author.close();
      await peer.close();
    },
  );
