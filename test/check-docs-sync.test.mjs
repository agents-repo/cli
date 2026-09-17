import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_DOCS_SYNC_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-docs-sync.mjs');

import {
  aliasesEqual,
  collectDocsSyncErrors,
  commandFromCell,
  countRegisterCalls,
  listWebappCliCommandsFiles,
  loadWebappCliCommands,
  localeKeyFromCliCommandsPath,
  parseAliasCell,
  parseCliArgs,
  parseCommanderSource,
  parseParityCommandAliases,
  parseWebappCliCommandsMarkdown,
  resolveWebappRoot,
} from '../scripts/lib/cli-docs-sync.mjs';

const PARITY_SAMPLE = `
## Command matrix

| agents-repo command | npm analogue | Implemented aliases | npm ref aliases | Notes |
| --- | --- | --- | --- | --- |
| \`init\` | \`npm init\` | — | — | setup |
| \`install\` | \`npm install\` | \`i\`, \`add\`, \`inst\` | \`add\` | variadic |
`;

const WEBAPP_SAMPLE = `
## Command matrix

| Command | npm analogue | Aliases | Notes |
| --- | --- | --- | --- |
| \`init\` | \`npm init\` | — | setup |
| \`install\` | \`npm install\` | \`i\`, \`add\`, \`inst\` | variadic |

## Per-command docs

| Command | Documentation |
| --- | --- |
| \`init\` | [init.md](https://example.test/init.md) |
| \`install\` | [install.md](https://example.test/install.md) |
`;

test('parseCliArgs reads help and webapp-root', () => {
  assert.equal(parseCliArgs(['--help']).help, true);
  assert.equal(parseCliArgs(['--webapp-root', '/custom/webapp']).webappRoot, '/custom/webapp');
  assert.equal(parseCliArgs(['--webapp-root=/opt/webapp']).webappRoot, '/opt/webapp');
});

test('check-docs-sync.mjs --help prints usage and exits 0', async () => {
  const { stdout } = await execFileAsync('node', [CHECK_DOCS_SYNC_SCRIPT, '--help'], {
    cwd: REPO_ROOT,
  });
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /--webapp-root/);
  assert.match(stdout, /check:docs-sync/);
});

test('check-docs-sync.mjs exits 1 when webapp docs are missing under --webapp-root', async () => {
  const emptyWebappRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-no-webapp-'));
  try {
    await assert.rejects(
      () =>
        execFileAsync('node', [CHECK_DOCS_SYNC_SCRIPT, '--webapp-root', emptyWebappRoot], {
          cwd: REPO_ROOT,
        }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(String(error.stderr), /webapp docs not found/);
        return true;
      },
    );
  } finally {
    fs.rmSync(emptyWebappRoot, { recursive: true, force: true });
  }
});

test('resolveWebappRoot prefers flag then env then sibling', () => {
  const cliRoot = '/repo/cli';
  assert.equal(
    resolveWebappRoot({ cliRoot, flagValue: '/custom', env: {} }),
    path.resolve('/custom'),
  );
  assert.equal(
    resolveWebappRoot({
      cliRoot,
      flagValue: undefined,
      env: { AGENTS_REPO_WEBAPP_ROOT: '/from-env' },
    }),
    path.resolve('/from-env'),
  );
  assert.equal(
    resolveWebappRoot({ cliRoot, flagValue: undefined, env: {} }),
    path.resolve('/repo/webapp'),
  );
});

test('commandFromCell and parseAliasCell handle backticks and dashes', () => {
  assert.equal(commandFromCell('`suggest-agents`'), 'suggest-agents');
  assert.equal(commandFromCell('Command'), null);
  assert.deepEqual(parseAliasCell('—'), []);
  assert.deepEqual(parseAliasCell('-'), []);
  assert.deepEqual(parseAliasCell('`i`, `add`, `inst`'), ['add', 'i', 'inst']);
});

test('parseParityCommandAliases reads implemented aliases column', () => {
  const map = parseParityCommandAliases(PARITY_SAMPLE);
  assert.deepEqual(map.get('init'), []);
  assert.deepEqual(map.get('install'), ['add', 'i', 'inst']);
});

test('parseWebappCliCommandsMarkdown splits matrix and per-command tables', () => {
  const parsed = parseWebappCliCommandsMarkdown(WEBAPP_SAMPLE);
  assert.deepEqual(parsed.matrix.get('init'), []);
  assert.deepEqual(parsed.matrix.get('install'), ['add', 'i', 'inst']);
  assert.deepEqual([...parsed.perCommandDocs].sort(), ['init', 'install']);
});

test('parseCommanderSource strips args and reads alias lists', () => {
  const install = parseCommanderSource(`
    program
      .command('install [package-id...]')
      .aliases(['i', 'add', 'inst'])
  `);
  assert.deepEqual(install, { name: 'install', aliases: ['add', 'i', 'inst'] });

  const list = parseCommanderSource(`
    program
      .command('list')
      .alias('ls')
  `);
  assert.deepEqual(list, { name: 'list', aliases: ['ls'] });

  const init = parseCommanderSource(`
    program
      .command('init')
      .description('Initialize')
  `);
  assert.deepEqual(init, { name: 'init', aliases: [] });
});

test('countRegisterCalls ignores imports', () => {
  const source = `
import { registerInitCommand } from './initCommand.js';
export const createCliProgram = () => {
  registerInitCommand(program);
  registerInstallCommand(program);
};
`;
  assert.equal(countRegisterCalls(source), 2);
});

test('localeKeyFromCliCommandsPath maps english and nested locales', () => {
  const docsRoot = '/webapp/src/content/docs';
  assert.equal(localeKeyFromCliCommandsPath(`${docsRoot}/cli-commands.md`, docsRoot), 'en');
  assert.equal(localeKeyFromCliCommandsPath(`${docsRoot}/es/cli-commands.md`, docsRoot), 'es');
});

test('listWebappCliCommandsFiles and loadWebappCliCommands discover nested locales', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-webapp-'));
  try {
    const docsRoot = path.join(root, 'src', 'content', 'docs');
    fs.mkdirSync(path.join(docsRoot, 'es'), { recursive: true });
    fs.writeFileSync(path.join(docsRoot, 'cli-commands.md'), WEBAPP_SAMPLE, 'utf8');
    fs.writeFileSync(path.join(docsRoot, 'es', 'cli-commands.md'), WEBAPP_SAMPLE, 'utf8');

    const files = listWebappCliCommandsFiles(docsRoot);
    assert.deepEqual(
      files.map((filePath) => path.relative(docsRoot, filePath).split(path.sep).join('/')).sort(),
      ['cli-commands.md', 'es/cli-commands.md'],
    );

    const byLocale = loadWebappCliCommands(docsRoot);
    assert.deepEqual([...byLocale.keys()].sort(), ['en', 'es']);
    assert.deepEqual(byLocale.get('en').matrix.get('install'), ['add', 'i', 'inst']);
    assert.deepEqual([...byLocale.get('es').perCommandDocs].sort(), ['init', 'install']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('collectDocsSyncErrors is empty when inventories match', () => {
  const docsStems = new Set(['init', 'install']);
  const parityAliases = new Map([
    ['init', []],
    ['install', ['add', 'i', 'inst']],
  ]);
  const commanderMap = new Map(parityAliases);
  const matrix = new Map(parityAliases);
  const webappByLocale = new Map([
    ['en', { matrix, perCommandDocs: new Set(['init', 'install']) }],
    ['es', { matrix, perCommandDocs: new Set(['init', 'install']) }],
  ]);
  const errors = collectDocsSyncErrors({
    docsStems,
    parityAliases,
    commanderMap,
    registerCount: 2,
    webappByLocale,
  });
  assert.deepEqual(errors, []);
});

test('collectDocsSyncErrors reports missing commands, aliases, and register count', () => {
  const docsStems = new Set(['init', 'install']);
  const parityAliases = new Map([
    ['init', []],
    ['install', ['add', 'i', 'inst']],
  ]);
  const commanderMap = new Map([['init', []]]);
  const webappByLocale = new Map([
    [
      'en',
      {
        matrix: new Map([
          ['init', []],
          ['install', ['i']],
        ]),
        perCommandDocs: new Set(['init']),
      },
    ],
  ]);
  const errors = collectDocsSyncErrors({
    docsStems,
    parityAliases,
    commanderMap,
    registerCount: 1,
    webappByLocale,
  });
  assert.ok(errors.some((line) => line.includes('register*Command count')));
  assert.ok(errors.some((line) => line.includes('Commander vs docs/commands: missing install')));
  assert.ok(errors.some((line) => line.includes('Alias mismatch (install)')));
  assert.ok(errors.some((line) => line.includes('per-command docs vs matrix')));
});

test('collectDocsSyncErrors reports locale drift', () => {
  const docsStems = new Set(['init']);
  const parityAliases = new Map([['init', []]]);
  const commanderMap = new Map([['init', []]]);
  const webappByLocale = new Map([
    ['en', { matrix: new Map([['init', []]]), perCommandDocs: new Set() }],
    ['es', { matrix: new Map([['init', ['i']]]), perCommandDocs: new Set() }],
  ]);
  const errors = collectDocsSyncErrors({
    docsStems,
    parityAliases,
    commanderMap,
    registerCount: 1,
    webappByLocale,
  });
  assert.ok(errors.some((line) => line.includes('locale drift')));
});

test('aliasesEqual compares sorted lists', () => {
  assert.equal(aliasesEqual(['a', 'b'], ['a', 'b']), true);
  assert.equal(aliasesEqual(['a'], ['b']), false);
});

test('fixture tree round-trip through temp directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-'));
  try {
    const commandsDir = path.join(root, 'docs', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'init.md'), '# init\n');
    const stems = fs.readdirSync(commandsDir).map((name) => path.basename(name, '.md'));
    assert.deepEqual(stems, ['init']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
