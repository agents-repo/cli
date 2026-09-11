export const ID_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'

export const LEGACY_SKILL_ENTRY_PATTERN = new RegExp(
  String.raw`^(?:\.cursor/skills|\.agents/skills)/${ID_SEGMENT}/SKILL\.md$`,
)

export const QUALIFIED_SKILL_ENTRY_PATTERN = new RegExp(
  String.raw`^(?:\.cursor/skills|\.agents/skills)/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}/SKILL\.md$`,
)

export const QUALIFIED_CLAUDE_ENTRY_PATTERN = new RegExp(
  String.raw`^\.claude/agents/${ID_SEGMENT}/${ID_SEGMENT}/${ID_SEGMENT}\.md$`,
)

export const LEGACY_CLAUDE_ENTRY_PATTERN = new RegExp(
  String.raw`^\.claude/agents/${ID_SEGMENT}\.md$`,
)

export const DEPLOYMENT_ZIP_ENTRY_PATTERN = new RegExp(
  String.raw`^agents/${ID_SEGMENT}\.agent\.md$`,
)
