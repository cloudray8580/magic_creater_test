import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function addedLines(diff) {
  const files = new Map();
  let file,
    line = 0;
  for (const entry of diff.split('\n')) {
    if (entry.startsWith('+++ b/')) {
      file = entry.slice(6);
      if (!files.has(file)) files.set(file, new Set());
    } else if (entry.startsWith('@@')) {
      const match = entry.match(/\+(\d+)(?:,\d+)? @@/);
      if (match) line = Number(match[1]);
    } else if (file && entry.startsWith('+')) files.get(file).add(line++);
    else if (entry.startsWith(' ')) line++;
  }
  return files;
}
export function countCoveredLines(report, additions) {
  const lines = new Map();
  for (const [id, statement] of Object.entries(report.statementMap)) {
    const line = statement.start.line;
    if (additions.has(line)) lines.set(line, Math.max(lines.get(line) ?? 0, report.s[id]));
  }
  return {
    total: lines.size,
    covered: [...lines.values()].filter((hits) => hits > 0).length,
    uncovered: [...lines]
      .filter(([, hits]) => hits === 0)
      .map(([line]) => line)
      .sort((a, b) => a - b),
  };
}
// Statements use newly added executable starts. Functions and branches count all
// paths in constructs whose source span intersects additions, including changed bodies.
export function countAffectedMetrics(report, additions) {
  const intersects = (loc) =>
    [...additions].some((line) => line >= loc.start.line && line <= loc.end.line);
  const result = Object.fromEntries(
    ['statements', 'functions', 'branches'].map((k) => [k, { total: 0, covered: 0 }]),
  );
  const add = (key, hits) => {
    result[key].total++;
    if (hits > 0) result[key].covered++;
  };
  for (const [id, loc] of Object.entries(report.statementMap))
    if (additions.has(loc.start.line)) add('statements', report.s[id]);
  for (const [id, fn] of Object.entries(report.fnMap))
    if (intersects(fn.loc)) add('functions', report.f[id]);
  for (const [id, branch] of Object.entries(report.branchMap))
    if (intersects(branch.loc)) for (const hits of report.b[id]) add('branches', hits);
  return result;
}
function main() {
  const base = process.argv[2] || process.env.COVERAGE_BASE || 'origin/main';
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  // Compare the entire worktree with the selected baseline, including staged changes.
  const diff = execFileSync(
    'git',
    ['diff', '--no-ext-diff', '--no-renames', '--unified=0', base, '--', 'src'],
    { encoding: 'utf8' },
  );
  const files = addedLines(diff);
  for (const file of execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z', '--', 'src'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)) {
    files.set(
      file,
      new Set(
        readFileSync(file, 'utf8')
          .split('\n')
          .map((_, i) => i + 1),
      ),
    );
  }
  const report = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'));
  const backend = Object.fromEntries(
    ['lines', 'statements', 'functions', 'branches'].map((k) => [k, { total: 0, covered: 0 }]),
  );
  let total = 0,
    covered = 0;
  for (const [file, lines] of files) {
    if (!/\.tsx?$/.test(file) || !lines.size) continue;
    const data = report[resolve(root, file)];
    if (!data) throw new Error('Missing unit coverage for changed business file: ' + file);
    const count = countCoveredLines(data, lines);
    if (file.startsWith('src/server/')) {
      const metrics = { lines: count, ...countAffectedMetrics(data, lines) };
      for (const key of Object.keys(backend)) {
        backend[key].total += metrics[key].total;
        backend[key].covered += metrics[key].covered;
      }
    }
    total += count.total;
    covered += count.covered;
    console.log(`${file}: ${count.covered}/${count.total} added executable lines`);
    if (count.uncovered.length) console.log(`  Uncovered: ${count.uncovered.join(', ')}`);
  }
  for (const [key, value] of Object.entries(backend)) {
    if (!value.total) {
      console.log(`Backend incremental ${key}: no affected constructs`);
      continue;
    }
    const percent = (100 * value.covered) / value.total;
    console.log(
      `Backend incremental ${key}: ${value.covered}/${value.total} = ${percent.toFixed(2)}%`,
    );
    if (percent < 70) process.exitCode = 1;
  }
  if (!total) {
    console.log('No added executable business lines relative to ' + base);
    return;
  }
  const percent = (covered / total) * 100;
  console.log(`Incremental UT lines (${base}): ${covered}/${total} = ${percent.toFixed(2)}%`);
  if (percent < 70) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
