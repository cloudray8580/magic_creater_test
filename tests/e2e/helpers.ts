import { expect, type Page, type BrowserContext } from '@playwright/test';
// Reuse the teacher's real UI-authenticated session across journeys in this worker.
// Each student still logs in through the UI. Production login throttling stays enabled.
let teacherCookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
export async function login(page: Page, username: string) {
  if (username === 'teacher' && teacherCookies) await page.context().addCookies(teacherCookies);
  await page.goto('/');
  await expect(
    page
      .getByRole('button', { name: '退出登录' })
      .or(page.getByRole('button', { name: '进入工坊' })),
  ).toBeVisible();
  if (!(await page.getByRole('button', { name: '退出登录' }).isVisible())) {
    await page.getByLabel('账号', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill('test-password-123');
    await page.getByRole('button', { name: '进入工坊' }).click();
  }
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  if (username === 'teacher') teacherCookies = await page.context().cookies();
}
