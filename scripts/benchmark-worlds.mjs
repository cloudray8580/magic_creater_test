import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const server = await createServer({ server: { host: '127.0.0.1', port: 4384, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const results = [];
  for (const kind of ['empty', 'sparse', 'dense']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto('http://127.0.0.1:4384');
    await page.waitForSelector('input[name="username"]');
    const result = await page.evaluate(async (kind) => {
      const { benchmark } = await import('/scripts/world-benchmark-browser.ts');
      return benchmark(kind);
    }, kind);
    console.log(JSON.stringify(result));
    results.push(result);
    await page.close();
  }
  const report = {
    recordedAt: new Date().toISOString(),
    host: 'i7-11700',
    browser: browser.version(),
    viewport: '1440x1000',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    mode: 'Vite development; real Chromium DOM/Canvas; 100 edits with target tiles in the scrolled viewport + IndexedDB + animation frame; sampled JS heap (not process RSS)',
    results,
  };
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync('artifacts/benchmarks/worlds.json', JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser?.close();
  await server.close();
}
