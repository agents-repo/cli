import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
);
const pinnedNode = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
const pinnedNpm = String(packageJson.packageManager ?? '').replace(/^npm@/, '');

const currentNode = process.version.replace(/^v/, '');
const currentNpm = process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1];

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
