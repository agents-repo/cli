import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectChangedPaths,
  matchPathGroups,
} from '../scripts/ci-pr-path-filters.mjs';

test('package-lock.json turns slides and node22 on', () => {
  const matches = matchPathGroups(['package-lock.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
});

test('package.json turns slides and node22 on', () => {
  const matches = matchPathGroups(['package.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
});

test('docs-only README turns no extras on', () => {
  const matches = matchPathGroups(['README.md']);
  assert.equal(matches.slides, false);
  assert.equal(matches.node22, false);
});

test('.nvmrc turns node22 on without Chrome extras', () => {
  const matches = matchPathGroups(['.nvmrc']);
  assert.equal(matches.node22, true);
  assert.equal(matches.slides, false);
});

test('setup-node action turns node22 on', () => {
  const matches = matchPathGroups([
    '.github/actions/setup-node-pinned-npm/action.yml',
  ]);
  assert.equal(matches.node22, true);
  assert.equal(matches.slides, false);
});

test('pr-baseline.yml turns every extra this job defines on', () => {
  const matches = matchPathGroups(['.github/workflows/pr-baseline.yml']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
});

test('path-filter matcher turns every extra this job defines on', () => {
  const matches = matchPathGroups(['scripts/ci-pr-path-filters.mjs']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
});

test('rename previous_filename is collected for matching', () => {
  const paths = collectChangedPaths([
    { filename: 'src/bin/agents-repo.ts', previous_filename: 'agents.json' },
  ]);
  const matches = matchPathGroups(paths);
  assert.equal(matches.slides, false);
  assert.equal(matches.node22, false);
});
