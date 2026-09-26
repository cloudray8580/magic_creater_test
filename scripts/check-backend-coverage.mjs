import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const sums = Object.fromEntries(
  ['lines', 'statements', 'functions', 'branches'].map((k) => [k, { total: 0, covered: 0 }]),
);
let count = 0;
for (const [file, data] of Object.entries(report))
  if (file.includes('/src/server/')) {
    count++;
    for (const k of Object.keys(sums)) {
      sums[k].total += data[k].total;
      sums[k].covered += data[k].covered;
    }
  }
if (!count) throw new Error('No backend coverage files found');
for (const [key, value] of Object.entries(sums)) {
  const percent = value.total ? (100 * value.covered) / value.total : 100;
  console.log(`Backend ${key}: ${value.covered}/${value.total} = ${percent.toFixed(2)}%`);
  if (percent < 70) process.exitCode = 1;
}
