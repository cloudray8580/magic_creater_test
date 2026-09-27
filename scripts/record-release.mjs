import { chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createApp } from '../dist/server/app.js';
import { bootstrap } from '../dist/server/admin.js';
// All credentials and data below are fabricated solely for the isolated recording.
const version = process.argv[2] ?? 'm8';
const output = resolve('artifacts/releases/' + version);
mkdirSync(output, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'magic-video-'));
const origin = 'http://127.0.0.1:4373';
const { app, db } = await createApp({
  databasePath: join(temp, 'demo.sqlite'),
  origins: [origin],
  staticDir: resolve('dist/web'),
});
await bootstrap(db, {
  username: 'demo',
  displayName: '小画家',
  password: 'demo-only-password',
  classroomName: '灵感工坊',
});
await app.listen({ host: '127.0.0.1', port: 4373 });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage(),
  captions = [];
let start = Date.now();
async function cue(text, seconds, work = async () => {}) {
  const at = Date.now();
  captions.push({ start: (at - start) / 1000, text });
  await page.evaluate((text) => {
    let el = document.getElementById('release-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'release-caption';
      Object.assign(el.style, {
        position: 'fixed',
        left: '8%',
        right: '8%',
        bottom: '16px',
        padding: '16px 24px',
        background: '#213c39ee',
        color: '#fff9e8',
        font: 'bold 24px sans-serif',
        borderRadius: '16px',
        textAlign: 'center',
        zIndex: '99999',
        pointerEvents: 'none',
      });
      document.body.append(el);
    }
    el.textContent = text;
  }, text);
  await work();
  await page.waitForTimeout(Math.max(0, seconds * 1000 - (Date.now() - at)));
}
try {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const pointer = document.createElement('div');
      Object.assign(pointer.style, {
        position: 'fixed',
        width: '14px',
        height: '14px',
        border: '3px solid #d3663d',
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: '100000',
        transform: 'translate(-50%,-50%)',
      });
      document.body.append(pointer);
      document.addEventListener('pointermove', (e) => {
        pointer.style.left = e.clientX + 'px';
        pointer.style.top = e.clientY + 'px';
      });
      document.addEventListener('pointerdown', () => {
        pointer.style.boxShadow = '0 0 0 14px #ffd078aa';
        setTimeout(() => (pointer.style.boxShadow = 'none'), 400);
      });
    });
  });
  await page.goto(origin);
  start = Date.now();
  await cue(
    '创作工坊 · ' + version.toUpperCase() + '｜把一个小想法，变成能玩的世界',
    5,
    async () => {
      await page.getByLabel('账号', { exact: true }).fill('demo');
      await page.getByLabel('密码', { exact: true }).fill('demo-only-password');
      await page.getByRole('button', { name: '进入工坊' }).click();
    },
  );
  if (version === 'm8') {
    await cue('两种玩法，六个灵感起点；我的小世界从空白开始', 7, async () => {
      await page.locator('#my-worlds').scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);
      await page.locator('.template-group').first().scrollIntoViewIfNeeded();
    });
    await cue('打开模板不会增加作品。先试着创作，再决定保存', 6, async () => {
      await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
      await page.getByRole('button', { name: '适合窗口', exact: true }).click();
    });
    await cue('改名字、画地形、布置惊喜；修改会自动留下本地草稿', 10, async () => {
      await page.getByLabel('作品名称').fill('寄给晚风的一封信');
      await page.getByRole('button', { name: '花', exact: true }).click();
      const canvas = page.getByRole('application', { name: '关卡画布' });
      await canvas.scrollIntoViewIfNeeded();
      const b = await canvas.boundingBox(),
        v = await canvas.evaluate((el) => ({
          w: el.viewBox.baseVal.width,
          h: el.viewBox.baseVal.height,
        }));
      for (const x of [4, 6, 8]) {
        await page.mouse.click(
          b.x + (((x + 0.5) * 40) / v.w) * b.width,
          b.y + ((13.5 * 40) / v.h) * b.height,
        );
        await page.waitForTimeout(450);
      }
      await page.getByRole('button', { name: '撤销', exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: '重做', exact: true }).click();
    });
    await cue('随时进入试玩：跑一跑、跳一跳，看看自己的设计', 12, async () => {
      await page.getByRole('button', { name: '试玩关卡', exact: true }).click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.locator('.game-stage').scrollIntoViewIfNeeded();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(2000);
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await page.keyboard.up('Space');
      await page.waitForTimeout(1800);
      await page.keyboard.up('ArrowRight');
      await page.getByRole('button', { name: '回检查点', exact: true }).click();
    });
    await cue('满意后点击保存；只有自己创作的作品会进入列表', 6, async () => {
      await page.getByRole('button', { name: '返回编辑', exact: true }).click();
      await page.getByRole('button', { name: '保存到服务器' }).click();
      await page.getByText('已保存到服务器', { exact: true }).waitFor();
      await page.getByRole('button', { name: '我的作品', exact: true }).click();
      await page.locator('#my-worlds').scrollIntoViewIfNeeded();
    });
    await cue('删除需要再次确认；作品、版本与反馈会永久移除', 8, async () => {
      await page.locator('.cards article').getByRole('button', { name: '删除作品' }).click();
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.waitForTimeout(1000);
      await page.locator('.cards article').getByRole('button', { name: '删除作品' }).click();
      await page.getByRole('button', { name: '永久删除', exact: true }).click();
    });
    await cue('也可以创作探索故事：一封信、一个选择，都能改变旅程', 8, async () => {
      await page.getByRole('button', { name: '先玩一玩森林里的来信', exact: true }).click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.locator('.game-stage').scrollIntoViewIfNeeded();
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(400);
      await page.keyboard.up('ArrowDown');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(550);
      await page.keyboard.up('ArrowRight');
    });
  } else if (version === 'm10') {
    await cue('六个创作起点：跳跃、乘桥、屋顶寻星，或写一段自己的故事', 6, async () => {
      await page.locator('.template-group').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);
      await page.locator('.template-group').last().scrollIntoViewIfNeeded();
    });
    await cue('地图最长2048格；16384块地形、600个物体，让想象铺得更远', 10, async () => {
      await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
      await page.getByLabel('作品名称').fill('写给未来的一段旅程');
      await page.getByLabel('地图宽度', { exact: true }).fill('2048');
      await page.getByLabel('地图宽度', { exact: true }).blur();
      await page.getByRole('button', { name: '适合窗口', exact: true }).click();
      await page.waitForTimeout(1600);
      await page.getByRole('button', { name: '定位起点', exact: true }).click();
      await page.getByRole('button', { name: '保存到服务器' }).click();
      await page.getByText('已保存到服务器', { exact: true }).waitFor();
    });
    await cue('小地图找到远方；一次扩展、一次绘制，都可以撤销重来', 8, async () => {
      const map = page.getByRole('img', { name: '小地图，点击定位，方向键平移' });
      await map.scrollIntoViewIfNeeded();
      const b = await map.boundingBox();
      await page.mouse.click(b.x + b.width * 0.8, b.y + b.height * 0.7);
      await page.waitForTimeout(1800);
      await page.getByRole('button', { name: '定位起点', exact: true }).click();
      await page.getByRole('button', { name: '我的作品', exact: true }).click();
    });
    await cue('会移动的桥：等一等、跳上桥，让机关带你越过溪谷', 14, async () => {
      await page.getByRole('button', { name: '先玩一玩会移动的桥', exact: true }).click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.locator('.game-stage').scrollIntoViewIfNeeded();
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(
        () => Number(document.querySelector('.game-coordinate')?.textContent?.split(',')[0]) >= 14,
      );
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(800);
      await page.keyboard.down('Space');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(1000);
      await page.keyboard.up('Space');
      await page.waitForTimeout(2500);
    });
    await cue('我的秘密小屋：不用带礼物也能聊天，不同选择留下不同结局', 13, async () => {
      await page.getByRole('button', { name: '我的作品', exact: true }).click();
      await page.getByRole('button', { name: '先玩一玩我的秘密小屋', exact: true }).click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.locator('.game-stage').scrollIntoViewIfNeeded();
      const walk = async (key, position) => {
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
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: '一起看星星', exact: true }).click();
    });
    await cue('从一个小想法开始。制作、试玩、分享，让同伴发现你的创意', 8, async () => {
      await page.getByRole('button', { name: '我的作品', exact: true }).click();
      await page.locator('#my-worlds').scrollIntoViewIfNeeded();
    });
  } else {
    await cue('从小小的灵感出发，地图可以随着想象向外生长', 6, async () => {
      await page.locator('.template-group').first().scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
    });
    await cue('点击扩展，一次增加64格；随时撤销或重做', 10, async () => {
      await page.getByLabel('作品名称').fill('把路修到云的另一边');
      await page.getByRole('button', { name: '向右扩展64格', exact: true }).click();
      await page.getByRole('button', { name: '适合窗口', exact: true }).click();
      await page.waitForTimeout(1600);
      await page.getByRole('button', { name: '撤销', exact: true }).click();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: '重做', exact: true }).click();
      await page.getByRole('button', { name: '适合窗口', exact: true }).click();
    });
    await cue('按住鼠标画出一条长路，一整笔只占一步撤销', 10, async () => {
      await page.getByRole('button', { name: '地面', exact: true }).click();
      const canvas = page.getByRole('application', { name: '关卡画布' });
      const b = await canvas.boundingBox(),
        v = await canvas.evaluate((el) => ({
          w: el.viewBox.baseVal.width,
          h: el.viewBox.baseVal.height,
        }));
      const pos = (x) => ({
        x: b.x + (((x + 0.5) * 40) / v.w) * b.width,
        y: b.y + ((14.5 * 40) / v.h) * b.height,
      });
      const begin = pos(42),
        end = pos(104);
      await page.mouse.move(begin.x, begin.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 40 });
      await page.mouse.up();
      await page.waitForTimeout(2000);
    });
    await cue('小地图快速找远处；起点和终点也能一键定位', 8, async () => {
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '放大地图' }).click();
      const map = page.getByRole('img', { name: '小地图，点击定位，方向键平移' });
      const b = await map.boundingBox();
      await page.mouse.click(b.x + b.width * 0.92, b.y + b.height * 0.8);
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: '定位起点', exact: true }).click();
    });
    await cue('创作之后立即试玩，感受跳跃、路面和机关', 12, async () => {
      await page.getByRole('button', { name: '试玩关卡', exact: true }).click();
      await page.getByRole('button', { name: '点击进入小世界' }).click();
      await page.locator('.game-stage').scrollIntoViewIfNeeded();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(1600);
      await page.keyboard.down('Space');
      await page.waitForTimeout(350);
      await page.keyboard.up('Space');
      await page.waitForTimeout(1500);
      await page.keyboard.up('ArrowRight');
      await page.getByRole('button', { name: '回检查点', exact: true }).click();
    });
    await cue('本地草稿自动保留；保存后再邀请同伴体验', 6, async () => {
      await page.getByRole('button', { name: '返回编辑', exact: true }).click();
      await page.getByRole('button', { name: '保存到服务器' }).click();
      await page.getByText('已保存到服务器', { exact: true }).waitFor();
      await page.getByRole('button', { name: '我的作品', exact: true }).click();
      await page.locator('#my-worlds').scrollIntoViewIfNeeded();
    });
    await cue(version.toUpperCase() + '｜更大的创作空间，小地图导航，流畅的编辑与试玩', 5);
  }
  const video = page.video();
  await context.close();
  const raw = await video.path();
  const ffmpeg =
    process.env.FFMPEG ??
    join(homedir(), '.cache/magic-video-tools/node_modules/ffmpeg-static/ffmpeg');
  const ffprobe =
    process.env.FFPROBE ??
    join(homedir(), '.cache/magic-video-tools/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
  const mp4 = join(output, version + '-demo.mp4');
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      raw,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      mp4,
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    ffmpeg,
    ['-y', '-ss', '22', '-i', mp4, '-frames:v', '1', join(output, version + '-cover.jpg')],
    { stdio: 'pipe' },
  );
  const probe = JSON.parse(
    execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', mp4], {
      encoding: 'utf8',
    }),
  );
  const duration = Number(probe.format.duration);
  if (duration < 55 || duration > 75)
    throw new Error('Video duration outside 55–75 seconds: ' + duration);
  const stamp = (n) => new Date(n * 1000).toISOString().slice(11, 23).replace('.', ',');
  writeFileSync(
    join(output, version + '-captions.srt'),
    captions
      .map(
        (c, i) =>
          `${i + 1}\n${stamp(c.start)} --> ${stamp(captions[i + 1]?.start ?? duration)}\n${c.text}\n`,
      )
      .join('\n'),
  );
  writeFileSync(
    join(output, 'manifest.json'),
    JSON.stringify(
      {
        version,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        duration,
        width: probe.streams[0].width,
        height: probe.streams[0].height,
        captions,
        isolatedData: true,
        recordedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(readFileSync(mp4)).digest('hex'),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      mp4,
      duration,
      width: probe.streams[0].width,
      height: probe.streams[0].height,
    }),
  );
} finally {
  await browser.close();
  await app.close();
  rmSync(temp, { recursive: true, force: true });
}
