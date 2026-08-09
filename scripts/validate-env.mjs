import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

function parseSemverTriple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemverTriples(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

function satisfiesComparator(versionTriple, comparator) {
  const trimmed = comparator.trim();
  let op = '=';
  let versionPart = trimmed;
  if (trimmed.startsWith('>=')) {
    op = '>=';
    versionPart = trimmed.slice(2).trim();
  } else if (trimmed.startsWith('<=')) {
    op = '<=';
    versionPart = trimmed.slice(2).trim();
  } else if (trimmed.startsWith('>')) {
    op = '>';
    versionPart = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('<')) {
    op = '<';
    versionPart = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('=')) {
    versionPart = trimmed.slice(1).trim();
  }
  const target = parseSemverTriple(versionPart);
  if (!target) {
    return false;
  }
  const comparison = compareSemverTriples(versionTriple, target);
  switch (op) {
    case '>=':
      return comparison >= 0;
    case '<=':
      return comparison <= 0;
    case '>':
      return comparison > 0;
    case '<':
      return comparison < 0;
    default:
      return comparison === 0;
  }
}

/** Comparator-set ranges (for example `>=22.12.0 <25.0.0`) without the semver package. */
function satisfiesEngineWithoutSemver(version, range) {
  const versionTriple = parseSemverTriple(version);
  if (!versionTriple) {
    return false;
  }
  const trimmed = range.trim();
  const comparators = trimmed.split(/\s+/).filter((part) => /^[><=]/.test(part));
  if (comparators.length === 0) {
    return satisfiesComparator(versionTriple, `=${trimmed}`);
  }
  return comparators.every((part) => satisfiesComparator(versionTriple, part));
}

function satisfiesEngine(version, range, packageJsonPath) {
  try {
    const semver = createRequire(packageJsonPath)('semver');
    return semver.satisfies(version, range, { includePrerelease: false });
  } catch {
    if (/[|^~*x]/.test(range)) {
      console.error(
        'Cannot validate engines.node without installed dependencies; run npm ci first.'
      );
      process.exit(1);
    }
    return satisfiesEngineWithoutSemver(version, range);
  }
}

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
const packageJsonPath = resolve(root, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const pinnedNode = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
const pinnedNpm = String(packageJson.packageManager ?? '')
  .replace(/^npm@/, '')
  .split('+')[0]
  .trim();
const engineRange = packageJson.engines?.node;

const currentNode = process.version.replace(/^v/, '');
const currentNpm = detectNpmVersion();

const pinnedNodeMajor = pinnedNode.split('.')[0];
const currentNodeMajor = currentNode.split('.')[0];
const pinnedNpmMajor = pinnedNpm.split('.')[0];
const currentNpmMajor = currentNpm?.split('.')[0];

if (!engineRange) {
  console.error('Missing package.json engines.node');
  process.exit(1);
}

if (!satisfiesEngine(currentNode, engineRange, packageJsonPath)) {
  console.error(
    `Node version mismatch: expected ${engineRange} (engines.node), got ${currentNode}`
  );
  process.exit(1);
}

if (currentNpmMajor !== pinnedNpmMajor) {
  console.error(
    `npm major mismatch: expected ${pinnedNpmMajor}.x from packageManager, got ${currentNpm ?? 'unknown'}`
  );
  process.exit(1);
}

if (currentNodeMajor !== pinnedNodeMajor) {
  console.warn(
    `Node major differs from recommended .nvmrc (${pinnedNode}); current ${currentNode}`
  );
} else if (currentNode !== pinnedNode) {
  console.warn(
    `Node patch differs from pinned .nvmrc: expected ${pinnedNode}, got ${currentNode}`
  );
}

if (currentNpm && currentNpm !== pinnedNpm) {
  console.warn(
    `npm patch differs from packageManager: expected ${pinnedNpm}, got ${currentNpm}`
  );
}

console.log(
  `Node ${currentNode} and npm ${currentNpm ?? 'unknown'} satisfy repository requirements.`
);
