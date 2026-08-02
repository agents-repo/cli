import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type ProjectMetadataSignalSource = 'dependency' | 'name' | 'readme'

export interface ProjectMetadataSignal {
  readonly value: string
  readonly source: ProjectMetadataSignalSource
}

export interface CollectProjectMetadataSignalsOptions {
  readonly cwd: string
  readonly installedPackageIds?: readonly string[]
}

export interface CollectProjectMetadataSignalsResult {
  readonly signals: readonly ProjectMetadataSignal[]
  readonly installedPackageIds: ReadonlySet<string>
  readonly warnings: readonly string[]
}

const README_CANDIDATES = ['README.md', 'readme.md', 'Readme.md'] as const

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

const normalizeToken = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0) {
    return null
  }

  return trimmed
}

const expandScopedName = (value: string): string[] => {
  const normalized = normalizeToken(value)
  if (normalized === null) {
    return []
  }

  if (normalized.startsWith('@') && normalized.includes('/')) {
    const withoutAt = normalized.slice(1)
    const slashIndex = withoutAt.indexOf('/')
    const scope = withoutAt.slice(0, slashIndex)
    const leaf = withoutAt.slice(slashIndex + 1)
    return [scope, leaf].filter((entry) => entry.length > 0)
  }

  return [normalized]
}

const dedupeSignals = (entries: ProjectMetadataSignal[]): ProjectMetadataSignal[] => {
  const seen = new Set<string>()
  const result: ProjectMetadataSignal[] = []

  for (const entry of entries) {
    const key = `${entry.source}:${entry.value}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(entry)
  }

  return result
}

const readPackageJsonSignals = (
  cwd: string,
  warnings: string[],
): ProjectMetadataSignal[] => {
  const packageJsonPath = join(cwd, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown
  } catch {
    warnings.push('Could not parse package.json; dependency signals were skipped')
    return []
  }

  if (typeof parsed !== 'object' || parsed === null) {
    warnings.push('package.json is not an object; dependency signals were skipped')
    return []
  }

  const record = parsed as Record<string, unknown>
  const signals: ProjectMetadataSignal[] = []

  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    for (const token of expandScopedName(record.name)) {
      signals.push({ value: token, source: 'name' })
    }
  }

  for (const field of DEPENDENCY_FIELDS) {
    const section = record[field]
    if (typeof section !== 'object' || section === null) {
      continue
    }

    for (const depName of Object.keys(section)) {
      for (const token of expandScopedName(depName)) {
        signals.push({ value: token, source: 'dependency' })
      }
    }
  }

  return signals
}

const tokenizeReadme = (content: string): string[] => {
  const matches = content.toLowerCase().match(/[a-z0-9]{3,}/g)
  if (matches === null) {
    return []
  }

  return [...new Set(matches)]
}

const readReadmeSignals = (cwd: string): ProjectMetadataSignal[] => {
  for (const filename of README_CANDIDATES) {
    const readmePath = join(cwd, filename)
    if (!existsSync(readmePath)) {
      continue
    }

    const content = readFileSync(readmePath, 'utf8')
    return tokenizeReadme(content).map((value) => ({ value, source: 'readme' as const }))
  }

  return []
}

export const collectProjectMetadataSignals = (
  options: CollectProjectMetadataSignalsOptions,
): CollectProjectMetadataSignalsResult => {
  const warnings: string[] = []
  const installed = new Set(
    (options.installedPackageIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0),
  )

  const signals = dedupeSignals([
    ...readPackageJsonSignals(options.cwd, warnings),
    ...readReadmeSignals(options.cwd),
  ])

  return {
    signals,
    installedPackageIds: installed,
    warnings,
  }
}
