#!/usr/bin/env node
/**
 * Run a published agents-repo CLI release from this repository root.
 *
 * npm 12 `npx agents-repo@latest` resolves to the local package.json (same
 * name/version) and fails before `dist/` is built. CI and npm scripts use this
 * helper to invoke the registry tarball instead.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PUBLISHED_CLI_DIST_TAG = 'latest';
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

const installRoot = mkdtempSync(join(tmpdir(), 'agents-repo-published-'));
const npmInstall = resolveNpmCliInvocation([
  'install',
  '--prefix',
  installRoot,
  `agents-repo@${PUBLISHED_CLI_DIST_TAG}`,
]);
execFileSync(npmInstall.command, npmInstall.args, { stdio: 'inherit' });

const cliEntry = join(
  installRoot,
  'node_modules',
  'agents-repo',
  'dist',
  'bin',
  'agents-repo.js',
);

execFileSync(process.execPath, [cliEntry, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
