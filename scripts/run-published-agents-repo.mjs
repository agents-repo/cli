#!/usr/bin/env node
/**
 * Run the agents-repo CLI from this repository root.
 *
 * npm 12 `npx agents-repo@latest` resolves to the local package.json (same
 * name/version) and fails before `dist/` is built. Prefer the local `dist/`
 * binary when it exists so this repo can dogfood unpublished schema support.
 * Otherwise install `agents-repo@<package.json version>` from npm.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(packageRoot, 'package.json');
const { version: publishedCliVersion } = JSON.parse(
  readFileSync(packageJsonPath, 'utf8'),
);
const args = process.argv.slice(2);

const resolveNpmCliInvocation = (npmArgs) => {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return { command: process.execPath, args: [npmExecPath, ...npmArgs] };
  }

  return {
    command: join(dirname(process.execPath), 'npm'),
    args: npmArgs,
  };
};

if (args.length === 0) {
  console.error('Usage: node scripts/run-published-agents-repo.mjs <agents-repo-args...>');
  process.exit(1);
}

const localCliEntry = join(packageRoot, 'dist', 'bin', 'agents-repo.js');
const resolveCliEntry = () => {
  if (existsSync(localCliEntry)) {
    return localCliEntry;
  }

  const installRoot = mkdtempSync(join(tmpdir(), 'agents-repo-published-'));
  const npmInstall = resolveNpmCliInvocation([
    'install',
    '--prefix',
    installRoot,
    `agents-repo@${publishedCliVersion}`,
  ]);
  execFileSync(npmInstall.command, npmInstall.args, { stdio: 'inherit' });
  return join(
    installRoot,
    'node_modules',
    'agents-repo',
    'dist',
    'bin',
    'agents-repo.js',
  );
};

execFileSync(process.execPath, [resolveCliEntry(), ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
