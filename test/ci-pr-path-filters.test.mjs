import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectChangedPaths,
  matchPathGroups,
} from '../scripts/ci-pr-path-filters.mjs';

test('package-lock.json turns slides and node22 on and agents off', () => {
  const matches = matchPathGroups(['package-lock.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
  assert.equal(matches.agents, false);
});

test('package.json turns slides and node22 on and agents off', () => {
  const matches = matchPathGroups(['package.json']);
  assert.equal(matches.slides, true);
  assert.equal(matches.node22, true);
  assert.equal(matches.agents, false);
});

test('agents.json turns checksum on without node22 or slides', () => {
  const matches = matchPathGroups(['agents.json']);
  assert.equal(matches.agents, true);
  assert.equal(matches.slides, false);
  assert.equal(matches.node22, false);
});

test('docs-only README turns no extras on', () => {
  const matches = matchPathGroups(['README.md']);
  assert.equal(matches.slides, false);
  assert.equal(matches.agents, false);
  assert.equal(matches.node22, false);
});

test('.nvmrc turns node22 on without Chrome or checksum extras', () => {
  const matches = matchPathGroups(['.nvmrc']);
  assert.equal(matches.node22, true);
  assert.equal(matches.slides, false);
  assert.equal(matches.agents, false);
});

test('setup-node action turns node22 on', () => {
  const matches = matchPathGroups([
    '.github/actions/setup-node-pinned-npm/action.yml',
  ]);
  assert.equal(matches.node22, true);
  assert.equal(matches.slides, false);
  assert.equal(matches.agents, false);
});

test('pr-baseline.yml turns every extra this job defines on', () => {
  const matches = matchPathGroups(['.github/workflows/pr-baseline.yml']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, true);
  assert.equal(matches.node22, true);
});

test('path-filter matcher turns every extra this job defines on', () => {
  const matches = matchPathGroups(['scripts/ci-pr-path-filters.mjs']);
  assert.equal(matches.slides, true);
  assert.equal(matches.agents, true);
  assert.equal(matches.node22, true);
});

test('rename previous_filename is collected for matching', () => {
  const paths = collectChangedPaths([
    { filename: 'src/bin/agents-repo.ts', previous_filename: 'agents.json' },
  ]);
  const matches = matchPathGroups(paths);
  assert.equal(matches.agents, true);
  assert.equal(matches.slides, false);
});
