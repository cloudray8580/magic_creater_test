import { describe, expect, it } from 'vitest';
// Tooling is plain Node ESM so the coverage gate also runs after build.
// @ts-expect-error JavaScript CLI helper has no separate declaration file.
import { addedLines, countCoveredLines } from '../../scripts/check-incremental-coverage.mjs';
describe('incremental coverage denominator', () => {
  it('counts added executable lines including new files and ignores deletion-only hunks', () => {
    const diff =
      '+++ b/src/a.ts\n@@ -3,2 +3,3 @@\n-old\n+new\n+new2\n context\n+++ b/src/b.ts\n@@ -0,0 +1,2 @@\n+first\n+second\n+++ b/src/gone.ts\n@@ -1,2 +0,0 @@\n-old\n-old2\n';
    const lines = addedLines(diff);
    expect([...lines.get('src/a.ts')]).toEqual([3, 4]);
    expect([...lines.get('src/b.ts')]).toEqual([1, 2]);
    const report = {
      statementMap: {
        0: { start: { line: 3 } },
        1: { start: { line: 4 } },
        2: { start: { line: 8 } },
      },
      s: { 0: 2, 1: 0, 2: 10 },
    };
    expect(countCoveredLines(report, lines.get('src/a.ts'))).toEqual({
      total: 2,
      covered: 1,
      uncovered: [4],
    });
  });
  it('combines statement hits on the same executable line without double counting', () => {
    const report = {
      statementMap: {
        0: { start: { line: 1 } },
        1: { start: { line: 1 } },
        2: { start: { line: 3 } },
      },
      s: { 0: 0, 1: 2, 2: 1 },
    };
    expect(countCoveredLines(report, new Set([1, 2]))).toEqual({
      total: 1,
      covered: 1,
      uncovered: [],
    });
  });
});
