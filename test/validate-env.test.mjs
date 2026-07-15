import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const VALIDATE_ENV_SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-env.mjs');

const currentNode = process.version.replace(/^v/, '');
const currentNodeMajor = currentNode.split('.')[0];

function makeTempRepo({ nvmrc, packageManager }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-validate-env-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(VALIDATE_ENV_SCRIPT, path.join(dir, 'scripts', 'validate-env.mjs'));
  fs.writeFileSync(path.join(dir, '.nvmrc'), `${nvmrc}\n`, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'validate-env-test',
        packageManager,
      },
      null,
      2,
    ),
    'utf8',
  );
  return dir;
}

async function runValidateEnv(cwd, env = {}) {
  return execFileAsync('node', ['scripts/validate-env.mjs'], {
    cwd,
    env: { ...process.env, ...env },
  });
}

const tempRepos = [];

afterEach(() => {
  while (tempRepos.length > 0) {
    fs.rmSync(tempRepos.pop(), { recursive: true, force: true });
  }
});

describe('validate-env', () => {
  it('exits 1 on node major mismatch', async () => {
    const wrongMajor = currentNodeMajor === '24' ? '22.0.0' : '24.0.0';
    const repo = makeTempRepo({
      nvmrc: wrongMajor,
      packageManager: 'npm@12.0.1',
    });
    tempRepos.push(repo);

    await assert.rejects(
      () => runValidateEnv(repo, { npm_config_user_agent: 'npm/12.0.1' }),
      (error) => {
        assert.match(String(error.stderr), /Node major mismatch/);
        return true;
      },
    );
  });

  it('exits 1 on npm major mismatch', async () => {
    const repo = makeTempRepo({
      nvmrc: currentNode,
      packageManager: 'npm@11.0.0',
    });
    tempRepos.push(repo);

    await assert.rejects(
      () => runValidateEnv(repo, { npm_config_user_agent: 'npm/12.0.1' }),
      (error) => {
        assert.match(String(error.stderr), /npm major mismatch/);
        return true;
      },
    );
  });

  it('warns on patch mismatch but exits 0', async () => {
    const repo = makeTempRepo({
      nvmrc: `${currentNodeMajor}.99.99`,
      packageManager: 'npm@12.0.1',
    });
    tempRepos.push(repo);

    const { stdout, stderr } = await runValidateEnv(repo, {
      npm_config_user_agent: 'npm/12.0.2',
    });

    assert.match(String(stderr), /Node patch differs/);
    assert.match(String(stderr), /npm patch differs/);
    assert.match(stdout, /satisfy repository requirements/);
  });
});
