import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const GENERATED_COMMENT =
  '<!-- Generated: .github/copilot-instructions.md. Run npm run sync:ide-instructions -->';

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-ide-sync-'));
  fs.mkdirSync(path.join(dir, '.github'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'scripts', 'sync-ide-instructions.mjs'),
    path.join(dir, 'scripts', 'sync-ide-instructions.mjs'),
  );
  return dir;
}

const tempRepos = [];

afterEach(() => {
  while (tempRepos.length > 0) {
    fs.rmSync(tempRepos.pop(), { recursive: true, force: true });
  }
});

describe('sync-ide-instructions', () => {
  it('writes cursor, claude, and codex mirrors', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    const source = '# CLI Project Guidelines\n\n## Pull Requests\n';
    fs.writeFileSync(path.join(repo, '.github', 'copilot-instructions.md'), source, 'utf-8');

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    const cursorOutput = fs.readFileSync(
      path.join(repo, '.cursor', 'rules', 'agents-cli.mdc'),
      'utf-8',
    );
    assert.match(cursorOutput, /alwaysApply: true/);
    assert.match(cursorOutput, /Generated: \.github\/copilot-instructions\.md/);
    assert.match(cursorOutput, /# CLI Project Guidelines/);

    const claudeOutput = fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf-8');
    assert.match(claudeOutput, /Generated: \.github\/copilot-instructions\.md/);
    assert.match(claudeOutput, /# CLI Project Guidelines/);
    assert.doesNotMatch(claudeOutput, /alwaysApply: true/);

    const codexOutput = fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf-8');
    assert.match(codexOutput, /Generated: \.github\/copilot-instructions\.md/);
    assert.match(codexOutput, /# CLI Project Guidelines/);
  });

  it('rewrites relative markdown links for the cursor mirror directory depth', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    const source = [
      '# CLI Project Guidelines',
      '',
      '1. Read [../README.md](../README.md).',
      '2. Read [CONTRIBUTING.md](CONTRIBUTING.md).',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(repo, '.github', 'copilot-instructions.md'), source, 'utf-8');

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    const output = fs.readFileSync(
      path.join(repo, '.cursor', 'rules', 'agents-cli.mdc'),
      'utf-8',
    );
    assert.match(output, /\[(\.\.\/){2}README\.md\]\((\.\.\/){2}README\.md\)/);
    assert.match(
      output,
      /\[(\.\.\/){2}\.github\/CONTRIBUTING\.md\]\((\.\.\/){2}\.github\/CONTRIBUTING\.md\)/,
    );

    const claudeOutput = fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf-8');
    assert.match(claudeOutput, /\[README\.md\]\(README\.md\)/);
    assert.match(claudeOutput, /\[\.github\/CONTRIBUTING\.md\]\(\.github\/CONTRIBUTING\.md\)/);
  });

  it('removes stale generated sibling rules on sync', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    const rulesDir = path.join(repo, '.cursor', 'rules');
    fs.writeFileSync(
      path.join(rulesDir, 'old-generated.mdc'),
      `${GENERATED_COMMENT}\nstale\n`,
      'utf-8',
    );

    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    assert.equal(fs.existsSync(path.join(rulesDir, 'old-generated.mdc')), false);
    assert.equal(fs.existsSync(path.join(rulesDir, 'agents-cli.mdc')), true);
  });

  it('reports stale generated sibling rules during --check', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    fs.writeFileSync(
      path.join(repo, '.cursor', 'rules', 'old-generated.mdc'),
      `${GENERATED_COMMENT}\nstale\n`,
      'utf-8',
    );

    await assert.rejects(
      () => execFileAsync('node', ['scripts/sync-ide-instructions.mjs', '--check'], { cwd: repo }),
      (error) => error.code === 1,
    );
  });

  it('exits non-zero on drift when --check', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );
    fs.mkdirSync(path.join(repo, '.cursor', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.cursor', 'rules', 'agents-cli.mdc'), 'stale\n', 'utf-8');

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await assert.rejects(
      () => execFileAsync('node', ['scripts/sync-ide-instructions.mjs', '--check'], { cwd: repo }),
      (error) => error.code === 1,
    );
  });

  it('treats CRLF mirror content as in sync when logically identical', async () => {
    const repo = makeTempRepo();
    tempRepos.push(repo);
    fs.writeFileSync(
      path.join(repo, '.github', 'copilot-instructions.md'),
      '# Source\n',
      'utf-8',
    );

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('node', ['scripts/sync-ide-instructions.mjs'], { cwd: repo });

    const mirrorPath = path.join(repo, 'CLAUDE.md');
    const content = fs.readFileSync(mirrorPath, 'utf-8');
    fs.writeFileSync(mirrorPath, content.replace(/\n/g, '\r\n'), 'utf-8');

    await assert.doesNotReject(
      execFileAsync('node', ['scripts/sync-ide-instructions.mjs', '--check'], { cwd: repo }),
    );
  });
});
