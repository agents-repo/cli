/* eslint-disable security/detect-non-literal-fs-filename -- paths are repo-relative or caller-supplied roots */
import fs from 'node:fs';
import path from 'node:path';

const EMPTY_ALIAS_MARKERS = new Set(['', '—', '–', '-', '---']);
const KEBAB_CHARS = /^[a-z0-9-]+$/;
const COMMAND_TS_SUFFIX = 'Command.ts';

export function compareStrings(left, right) {
  return left.localeCompare(right);
}

function sortStrings(values) {
  return [...values].sort(compareStrings);
}

export function parseCliArgs(argv) {
  const result = { help: false, webappRoot: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--webapp-root') {
      result.webappRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--webapp-root=')) {
      result.webappRoot = arg.slice('--webapp-root='.length);
    }
  }
  return result;
}

export function resolveWebappRoot({ cliRoot, flagValue, env = process.env }) {
  if (typeof flagValue === 'string' && flagValue.trim() !== '') {
    return path.resolve(flagValue);
  }
  const fromEnv = env.AGENTS_REPO_WEBAPP_ROOT;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return path.resolve(fromEnv);
  }
  return path.resolve(cliRoot, '../webapp');
}

export function webappDocsRoot(webappRoot) {
  return path.join(webappRoot, 'src', 'content', 'docs');
}

export function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return null;
  }
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map((cell) => cell.trim());
}

export function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function isKebabCommandId(name) {
  return (
    name.length > 0 &&
    !name.startsWith('-') &&
    !name.endsWith('-') &&
    !name.includes('--') &&
    KEBAB_CHARS.test(name)
  );
}

export function commandFromCell(cell) {
  const trimmed = cell.trim();
  if (!trimmed.startsWith('`') || !trimmed.endsWith('`') || trimmed.length < 3) {
    return null;
  }
  const name = trimmed.slice(1, -1);
  return isKebabCommandId(name) ? name : null;
}

export function parseAliasCell(cell) {
  const trimmed = cell.trim();
  if (EMPTY_ALIAS_MARKERS.has(trimmed)) {
    return [];
  }
  const parts = trimmed
    .split(',')
    .map((part) => part.trim().replace(/^`/, '').replace(/`$/, ''))
    .filter((part) => part !== '' && !EMPTY_ALIAS_MARKERS.has(part));
  return sortStrings(parts);
}

export function parseMarkdownTables(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const cells = splitTableRow(line);
    if (cells === null || isSeparatorRow(cells)) {
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

export function commandMapFromRows(rows, { aliasColumnIndex = 2, minColumns = 4 } = {}) {
  const map = new Map();
  for (const cells of rows) {
    if (cells.length < minColumns) {
      continue;
    }
    const name = commandFromCell(cells[0]);
    if (name === null) {
      continue;
    }
    map.set(name, parseAliasCell(cells[aliasColumnIndex] ?? ''));
  }
  return map;
}

export function commandSetFromRows(rows) {
  const names = new Set();
  for (const cells of rows) {
    const name = commandFromCell(cells[0]);
    if (name !== null) {
      names.add(name);
    }
  }
  return names;
}

export function parseParityCommandAliases(markdown) {
  return commandMapFromRows(parseMarkdownTables(markdown));
}

export function parseWebappCliCommandsMarkdown(markdown) {
  const rows = parseMarkdownTables(markdown);
  const matrix = commandMapFromRows(rows);
  const twoColumnNames = new Set();
  for (const cells of rows) {
    if (cells.length !== 2) {
      continue;
    }
    const name = commandFromCell(cells[0]);
    if (name !== null) {
      twoColumnNames.add(name);
    }
  }
  return { matrix, perCommandDocs: twoColumnNames };
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function readQuotedLiteral(source, index) {
  const quote = source[index];
  if (quote !== "'" && quote !== '"') {
    return null;
  }
  let cursor = index + 1;
  while (cursor < source.length) {
    const ch = source[cursor];
    if (ch === '\\') {
      cursor += 2;
      continue;
    }
    if (ch === quote) {
      return { value: source.slice(index + 1, cursor), endIndex: cursor + 1 };
    }
    cursor += 1;
  }
  return null;
}

function commandNameFromDefinition(definition) {
  const space = definition.indexOf(' ');
  const end = space === -1 ? definition.length : space;
  const name = definition.slice(0, end);
  return name === '' ? null : name;
}

export function parseCommanderCommandName(source) {
  const marker = source.indexOf('.command(');
  if (marker === -1) {
    return null;
  }
  const start = skipWhitespace(source, marker + '.command('.length);
  const literal = readQuotedLiteral(source, start);
  if (literal === null) {
    return null;
  }
  return commandNameFromDefinition(literal.value);
}

export function parseCommanderAliases(source) {
  const listMarker = source.indexOf('.aliases(');
  if (listMarker !== -1) {
    const open = source.indexOf('[', listMarker);
    const close = source.indexOf(']', open);
    if (open !== -1 && close !== -1) {
      const parts = source
        .slice(open + 1, close)
        .split(',')
        .map((part) => part.trim().replace(/^['"]/, '').replace(/['"]$/, ''))
        .filter((part) => part !== '');
      return sortStrings(parts);
    }
  }
  const aliases = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const aliasMarker = source.indexOf('.alias(', searchFrom);
    if (aliasMarker === -1) {
      break;
    }
    const start = skipWhitespace(source, aliasMarker + '.alias('.length);
    const literal = readQuotedLiteral(source, start);
    if (literal !== null && literal.value !== '') {
      aliases.push(literal.value);
    }
    searchFrom = aliasMarker + '.alias('.length;
  }
  return sortStrings(aliases);
}

export function parseCommanderSource(source) {
  const name = parseCommanderCommandName(source);
  if (name === null) {
    return null;
  }
  return { name, aliases: parseCommanderAliases(source) };
}

function isRegisterCommandCallLine(trimmed) {
  if (trimmed === 'registerCommand(program);') {
    return false;
  }
  let body = trimmed;
  const commentIndex = body.indexOf('//');
  if (commentIndex !== -1) {
    body = body.slice(0, commentIndex).trimEnd();
  }
  if (body.endsWith(';')) {
    body = body.slice(0, -1).trimEnd();
  }
  const programSuffix = '(program)';
  if (!body.startsWith('register') || !body.endsWith(programSuffix)) {
    return false;
  }
  const middle = body.slice('register'.length, body.length - programSuffix.length);
  if (!middle.endsWith('Command') || middle.length <= 'Command'.length) {
    return false;
  }
  const stem = middle.slice(0, -'Command'.length);
  return stem.length > 0 && /^[A-Za-z]+$/.test(stem);
}

export function countRegisterCalls(source) {
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    if (isRegisterCommandCallLine(line.trim())) {
      count += 1;
    }
  }
  return count;
}

export function listCommandDocStems(commandsDir) {
  const names = new Set();
  if (!fs.existsSync(commandsDir)) {
    return names;
  }
  for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }
    names.add(path.basename(entry.name, '.md'));
  }
  return names;
}

export function listCommanderCommandFiles(presentationDir) {
  if (!fs.existsSync(presentationDir)) {
    return [];
  }
  const files = fs
    .readdirSync(presentationDir)
    .filter((name) => name.endsWith(COMMAND_TS_SUFFIX))
    .map((name) => path.join(presentationDir, name));
  return sortStrings(files);
}

export function loadCommanderInventory(presentationDir) {
  const map = new Map();
  for (const filePath of listCommanderCommandFiles(presentationDir)) {
    const parsed = parseCommanderSource(fs.readFileSync(filePath, 'utf8'));
    if (parsed === null) {
      continue;
    }
    map.set(parsed.name, parsed.aliases);
  }
  return map;
}

export function localeKeyFromCliCommandsPath(filePath, docsRoot) {
  const relative = path.relative(docsRoot, filePath).split(path.sep).join('/');
  if (relative === 'cli-commands.md') {
    return 'en';
  }
  const parent = relative.split('/')[0];
  return parent || relative;
}

export function listWebappCliCommandsFiles(docsRoot) {
  const files = [];
  if (!fs.existsSync(docsRoot)) {
    return files;
  }
  const entries = fs.readdirSync(docsRoot, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const parentDir = entry.parentPath ?? entry.path ?? docsRoot;
    if (!entry.isFile() || entry.name !== 'cli-commands.md') {
      continue;
    }
    files.push(path.join(parentDir, entry.name));
  }
  return sortStrings(files);
}

export function loadWebappCliCommands(docsRoot) {
  const byLocale = new Map();
  for (const filePath of listWebappCliCommandsFiles(docsRoot)) {
    const locale = localeKeyFromCliCommandsPath(filePath, docsRoot);
    const parsed = parseWebappCliCommandsMarkdown(fs.readFileSync(filePath, 'utf8'));
    byLocale.set(locale, { ...parsed, filePath });
  }
  return byLocale;
}

export function sortedNames(names) {
  return sortStrings(names);
}

export function aliasesEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function formatNameDiff(label, expected, actual) {
  const missing = sortedNames(expected).filter((name) => !actual.has(name));
  const extra = sortedNames(actual).filter((name) => !expected.has(name));
  const lines = [];
  if (missing.length > 0) {
    lines.push(`${label}: missing ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    lines.push(`${label}: extra ${extra.join(', ')}`);
  }
  return lines;
}

function namesFromAliasMap(map) {
  return new Set(map.keys());
}

function collectCommandSetFindings(docsStems, commanderMap, webappByLocale) {
  const errors = [];
  const warnings = [];
  const commanderNames = namesFromAliasMap(commanderMap);
  errors.push(...formatNameDiff('Commander vs docs/commands', docsStems, commanderNames));
  for (const [locale, file] of webappByLocale) {
    const matrixNames = namesFromAliasMap(file.matrix);
    warnings.push(
      ...formatNameDiff(`webapp (${locale}) matrix vs docs/commands`, docsStems, matrixNames),
    );
  }
  return { errors, warnings };
}

function collectPerCommandDocsWarnings(webappByLocale) {
  const warnings = [];
  for (const [locale, file] of webappByLocale) {
    if (file.perCommandDocs.size === 0) {
      continue;
    }
    const matrixNames = namesFromAliasMap(file.matrix);
    warnings.push(
      ...formatNameDiff(`webapp (${locale}) per-command docs vs matrix`, matrixNames, file.perCommandDocs),
    );
  }
  return warnings;
}

function formatAliasMismatch(command, source, aliases) {
  const rendered = aliases.length === 0 ? '(none)' : aliases.join(', ');
  return `${source}: ${rendered}`;
}

function collectAliasFindingsForCommand(command, parityAliases, commanderMap, webappByLocale) {
  const expected = parityAliases.get(command) ?? [];
  const errors = [];
  const warnings = [];
  const commanderAliases = commanderMap.get(command) ?? [];
  const expectedLabel = expected.length === 0 ? '(none)' : expected.join(', ');

  if (!aliasesEqual(expected, commanderAliases)) {
    errors.push(
      `Alias mismatch (${command}): parity ${expectedLabel}; ${formatAliasMismatch(command, 'commander', commanderAliases)}`,
    );
  }

  for (const [locale, file] of webappByLocale) {
    const webappAliases = file.matrix.get(command) ?? [];
    if (!aliasesEqual(expected, webappAliases)) {
      const webappSource = `webapp (${locale})`;
      warnings.push(
        `Alias mismatch (${command}): parity ${expectedLabel}; ${formatAliasMismatch(command, webappSource, webappAliases)}`,
      );
    }
  }

  return { errors, warnings };
}

function collectAliasFindings(parityAliases, commanderMap, webappByLocale) {
  const commands = new Set([
    ...parityAliases.keys(),
    ...commanderMap.keys(),
    ...[...webappByLocale.values()].flatMap((file) => [...file.matrix.keys()]),
  ]);
  const errors = [];
  const warnings = [];
  for (const command of sortedNames(commands)) {
    const findings = collectAliasFindingsForCommand(
      command,
      parityAliases,
      commanderMap,
      webappByLocale,
    );
    errors.push(...findings.errors);
    warnings.push(...findings.warnings);
  }
  return { errors, warnings };
}

function serializeAliasMap(map) {
  return sortedNames(namesFromAliasMap(map))
    .map((name) => `${name}=${(map.get(name) ?? []).join(',')}`)
    .join('|');
}

function collectLocaleParityWarnings(webappByLocale) {
  if (webappByLocale.size < 2) {
    return [];
  }
  const [referenceLocale, referenceFile] = webappByLocale.entries().next().value;
  const reference = serializeAliasMap(referenceFile.matrix);
  const warnings = [];
  for (const [locale, file] of webappByLocale) {
    if (locale === referenceLocale) {
      continue;
    }
    if (serializeAliasMap(file.matrix) !== reference) {
      warnings.push(`webapp locale drift: ${locale} command/alias map differs from ${referenceLocale}`);
    }
  }
  return warnings;
}

export function collectDocsSyncFindings({
  docsStems,
  parityAliases,
  commanderMap,
  registerCount,
  webappByLocale,
}) {
  const errors = [];
  const warnings = [];
  if (registerCount !== docsStems.size) {
    errors.push(
      `createCliProgram register*Command count is ${registerCount}, docs/commands has ${docsStems.size} files`,
    );
  }
  if (webappByLocale.size === 0) {
    warnings.push('No webapp src/content/docs/**/cli-commands.md files found');
  }
  const commandSetFindings = collectCommandSetFindings(docsStems, commanderMap, webappByLocale);
  errors.push(...commandSetFindings.errors);
  warnings.push(...commandSetFindings.warnings);
  warnings.push(
    ...collectPerCommandDocsWarnings(webappByLocale),
    ...collectLocaleParityWarnings(webappByLocale),
  );
  const aliasFindings = collectAliasFindings(parityAliases, commanderMap, webappByLocale);
  errors.push(...aliasFindings.errors);
  warnings.push(...aliasFindings.warnings);
  return { errors, warnings };
}

/** @deprecated Use collectDocsSyncFindings; returns hard failures only (excludes webapp drift). */
export function collectDocsSyncErrors(inputs) {
  return collectDocsSyncFindings(inputs).errors;
}

export function loadCliDocsSyncInputs(cliRoot, webappRoot) {
  const docsStems = listCommandDocStems(path.join(cliRoot, 'docs', 'commands'));
  const parityPath = path.join(cliRoot, 'docs', 'npm-cli-parity.md');
  const parityAliases = parseParityCommandAliases(fs.readFileSync(parityPath, 'utf8'));
  const commanderMap = loadCommanderInventory(
    path.join(cliRoot, 'src', 'modules', 'cli', 'presentation'),
  );
  const registerCount = countRegisterCalls(
    fs.readFileSync(path.join(cliRoot, 'src', 'modules', 'cli', 'presentation', 'createCliProgram.ts'), 'utf8'),
  );
  const webappByLocale = loadWebappCliCommands(webappDocsRoot(webappRoot));
  return { docsStems, parityAliases, commanderMap, registerCount, webappByLocale };
}
