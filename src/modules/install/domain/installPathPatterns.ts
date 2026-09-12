export const ID_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'

/** Qualified install leaf: `{namespace}--{package-id}--{source-id}` per install-targets spec. */
export const INSTALL_LEAF_SEGMENT = `${ID_SEGMENT}(?:--${ID_SEGMENT}){2}`

export const LEGACY_SKILL_ENTRY_PATTERN = new RegExp(
  String.raw`^(?:\.cursor/skills|\.agents/skills)/${ID_SEGMENT}/SKILL\.md$`,
)

/** Legacy qualified skill path with single-hyphen install leaf (pre-`--` delimiter). */
export const LEGACY_QUALIFIED_SKILL_ENTRY_PATTERN = new RegExp(
  String.raw`^(?:\.cursor/skills|\.agents/skills)/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}/SKILL\.md$`,
)

export const QUALIFIED_SKILL_ENTRY_PATTERN = new RegExp(
  String.raw`^(?:\.cursor/skills|\.agents/skills)/${ID_SEGMENT}/${ID_SEGMENT}/${INSTALL_LEAF_SEGMENT}/SKILL\.md$`,
)

/** Legacy qualified Claude path with single-hyphen install leaf (pre-`--` delimiter). */
export const LEGACY_QUALIFIED_CLAUDE_ENTRY_PATTERN = new RegExp(
  String.raw`^\.claude/agents/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}\.md$`,
)

export const QUALIFIED_CLAUDE_ENTRY_PATTERN = new RegExp(
  String.raw`^\.claude/agents/${ID_SEGMENT}/${ID_SEGMENT}/${INSTALL_LEAF_SEGMENT}\.md$`,
)

export const LEGACY_CLAUDE_ENTRY_PATTERN = new RegExp(
  String.raw`^\.claude/agents/${ID_SEGMENT}\.md$`,
)

export const LEGACY_DEPLOYMENT_ZIP_ENTRY_PATTERN = new RegExp(
  String.raw`^agents/${ID_SEGMENT}\.agent\.md$`,
)

export const QUALIFIED_DEPLOYMENT_ZIP_ENTRY_PATTERN = new RegExp(
  String.raw`^agents/${INSTALL_LEAF_SEGMENT}\.agent\.md$`,
)

/** Legacy or qualified Copilot deployment ZIP entry under `agents/`. */
export const DEPLOYMENT_ZIP_ENTRY_PATTERN = new RegExp(
  String.raw`^agents/(?:${ID_SEGMENT}|${INSTALL_LEAF_SEGMENT})\.agent\.md$`,
)
