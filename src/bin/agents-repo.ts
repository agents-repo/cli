#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

if (process.argv.includes('--version') || process.argv.includes('-V')) {
  console.log(version);
  process.exit(0);
}

console.log('agents-repo CLI — commands coming in M3 (see issues #7–#11)');
