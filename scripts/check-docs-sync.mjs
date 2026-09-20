#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename -- webapp root is resolved from flag, env, or sibling path */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectDocsSyncFindings,
  loadCliDocsSyncInputs,
  parseCliArgs,
  resolveWebappRoot,
  webappDocsRoot,
} from './lib/cli-docs-sync.mjs';

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  console.log(`Usage:
  npm run check:docs-sync
  npm run check:docs-sync -- --webapp-root <path>
  npm run check:docs-sync -- --help

Compare CLI docs/commands stems, docs/npm-cli-parity.md aliases, Commander
*Command.ts registrations, and webapp src/content/docs/**/cli-commands.md.

CLI inventory mismatches fail the check. Webapp matrix/alias drift prints
warnings only (webapp main may lag the CLI repo).

Webapp root (first match): --webapp-root, AGENTS_REPO_WEBAPP_ROOT, ../webapp
`);
}

function failMissingWebapp(webappRoot) {
  const docsRoot = webappDocsRoot(webappRoot);
  process.stderr.write(
    `check:docs-sync: webapp docs not found at ${docsRoot}\n` +
      'Clone agents-repo/webapp as a sibling, or set AGENTS_REPO_WEBAPP_ROOT, ' +
      'or pass --webapp-root.\n',
  );
  process.exit(1);
}

function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  const webappRoot = resolveWebappRoot({
    cliRoot: CLI_ROOT,
    flagValue: args.webappRoot,
  });
  if (!fs.existsSync(webappDocsRoot(webappRoot))) {
    failMissingWebapp(webappRoot);
  }

  const inputs = loadCliDocsSyncInputs(CLI_ROOT, webappRoot);
  const { errors, warnings } = collectDocsSyncFindings(inputs);

  if (warnings.length > 0) {
    process.stderr.write(`check:docs-sync warning (${warnings.length}):\n`);
    for (const warning of warnings) {
      process.stderr.write(`- ${warning}\n`);
    }
  }

  if (errors.length === 0) {
    process.stdout.write(
      `check:docs-sync: ${inputs.docsStems.size} commands in sync ` +
        `(${inputs.webappByLocale.size} webapp locale files)\n`,
    );
    return 0;
  }

  process.stderr.write(`check:docs-sync failed (${errors.length} problem(s)):\n`);
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exit(main());
}

export { main };
