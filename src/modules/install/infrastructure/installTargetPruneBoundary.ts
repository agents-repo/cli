import type { InstallTargetId } from '../../registry/domain/package.js'

const PRUNE_BOUNDARY_BY_TARGET: Readonly<Record<InstallTargetId, string>> = {
  'github-copilot': '.github/agents',
  'claude-code': '.claude/agents',
  cursor: '.cursor/skills',
  'openai-codex': '.agents/skills',
}

export const installTargetPruneBoundary = (targetId: InstallTargetId): string =>
  PRUNE_BOUNDARY_BY_TARGET[targetId]
