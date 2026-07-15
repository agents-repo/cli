import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function resolveNpmCliInvocation() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return { command: process.execPath, args: [npmExecPath, '--version'] };
  }

  return {
    command: join(dirname(process.execPath), 'npm'),
    args: ['--version'],
  };
}

function detectNpmVersion() {
  const fromUserAgent = process.env.npm_config_user_agent?.match(
    /npm\/(\d+\.\d+\.\d+)/
  )?.[1];
  if (fromUserAgent) {
    return fromUserAgent;
  }

  const { command, args } = resolveNpmCliInvocation();
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
);
const pinnedNode = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
const pinnedNpm = String(packageJson.packageManager ?? '')
  .replace(/^npm@/, '')
  .split('+')[0]
  .trim();

const currentNode = process.version.replace(/^v/, '');
const currentNpm = detectNpmVersion();

const pinnedNodeMajor = pinnedNode.split('.')[0];
const currentNodeMajor = currentNode.split('.')[0];
const pinnedNpmMajor = pinnedNpm.split('.')[0];
const currentNpmMajor = currentNpm?.split('.')[0];

if (currentNodeMajor !== pinnedNodeMajor) {
  console.error(
    `Node major mismatch: expected ${pinnedNodeMajor}.x from .nvmrc, got ${currentNode}`
  );
  process.exit(1);
}

if (currentNpmMajor !== pinnedNpmMajor) {
  console.error(
    `npm major mismatch: expected ${pinnedNpmMajor}.x from packageManager, got ${currentNpm ?? 'unknown'}`
  );
  process.exit(1);
}

if (currentNode !== pinnedNode) {
  console.warn(`Node patch differs from pinned .nvmrc: expected ${pinnedNode}, got ${currentNode}`);
}

if (currentNpm && currentNpm !== pinnedNpm) {
  console.warn(`npm patch differs from packageManager: expected ${pinnedNpm}, got ${currentNpm}`);
}

console.log(`Node ${currentNode} and npm ${currentNpm ?? 'unknown'} satisfy repository requirements.`);
