import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const failure of ['stop', 'backup'])
  it('restarts unchanged old units when pre-migration ' + failure + ' fails', () => {
    const temp = mkdtempSync(join(tmpdir(), 'magic-deploy-fault-'));
    try {
      const repo = join(temp, 'repo'),
        home = join(temp, 'user'),
        base = join(home, '.local/share/magic-creater'),
        config = join(home, '.config/magic-creater'),
        units = join(home, '.config/systemd/user'),
        old = join(base, 'releases/old'),
        bin = join(temp, 'bin'),
        log = join(temp, 'commands.log');
      for (const dir of [
        repo + '/scripts',
        repo + '/dist/server',
        repo + '/dist/web',
        repo + '/node_modules',
        base + '/data',
        config,
        units,
        old + '/dist/server',
        bin,
      ])
        mkdirSync(dir, { recursive: true });
      copyFileSync('scripts/deploy-user.sh', repo + '/scripts/deploy-user.sh');
      copyFileSync('scripts/backup-user.sh', repo + '/scripts/backup-user.sh');
      for (const file of [
        repo + '/dist/server/main.js',
        repo + '/dist/web/index.html',
        repo + '/package.json',
        base + '/data/app.sqlite',
        old + '/dist/server/main.js',
        old + '/dist/server/backup.js',
      ])
        writeFileSync(file, 'fixture');
      writeFileSync(
        config + '/app.env',
        'APP_DATABASE=' + base + '/data/app.sqlite\nAPP_STATIC_DIR=' + old + '/dist/web\n',
      );
      for (const name of [
        'magic-creater.service',
        'magic-creater-backup.service',
        'magic-creater-backup.timer',
      ])
        writeFileSync(units + '/' + name, 'original unit');
      const executable = (name: string, body: string) =>
        writeFileSync(bin + '/' + name, '#!/bin/sh\n' + body, { mode: 0o700 });
      executable('git', 'case "$1" in rev-parse) echo fixture-commit;; esac\nexit 0\n');
      executable(
        'node',
        'case "$*" in *backup.js*) exit 19;; esac\nexec "' + process.execPath + '" "$@"\n',
      );
      executable(
        'systemctl',
        'printf "%s\\n" "$*" >> "' +
          log +
          '"\ncase "$*" in *WorkingDirectory*) echo "' +
          old +
          '";; *stop*) ' +
          (failure === 'stop' ? 'exit 18' : 'exit 0') +
          ';; esac\nexit 0\n',
      );
      const result = spawnSync('bash', [repo + '/scripts/deploy-user.sh'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          XDG_DATA_HOME: home + '/.local/share',
          XDG_CONFIG_HOME: home + '/.config',
          PATH: bin + ':' + process.env.PATH,
        },
      });
      expect(result.status).toBe(failure === 'stop' ? 18 : 19);
      expect(readFileSync(log, 'utf8')).toContain(
        '--user start magic-creater.service magic-creater-backup.timer',
      );
      expect(readFileSync(units + '/magic-creater.service', 'utf8')).toBe('original unit');
      expect(readFileSync(config + '/app.env', 'utf8')).toContain(old + '/dist/web');
      expect(readFileSync(base + '/data/app.sqlite', 'utf8')).toBe('fixture');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
