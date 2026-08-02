import type { Command } from 'commander'

import { getCliGlobals } from '../application/cliGlobals.js'
import {
  SuggestAgentsService,
  type SuggestAgentsResult,
} from '../../registry/application/suggestAgentsService.js'
import { formatCatalogUpdatedAt } from '../../registry/application/registrySelectors.js'
import { handleCliError } from './cliErrorHandling.js'

export interface SuggestAgentsCommandOptions {
  readonly limit?: string
}

const DESCRIPTION_MAX_LENGTH = 72

const truncateDescription = (value: string): string => {
  const codePoints = [...value]
  if (codePoints.length <= DESCRIPTION_MAX_LENGTH) {
    return value
  }

  return `${codePoints.slice(0, DESCRIPTION_MAX_LENGTH - 1).join('')}…`
}

const suggestionToJsonFields = (
  entry: SuggestAgentsResult['suggestions'][number],
): Record<string, unknown> => ({
  id: entry.pkg.id,
  name: entry.pkg.name,
  description: entry.pkg.description,
  latest: entry.pkg.latest,
  status: entry.pkg.status,
  owner: entry.pkg.owner,
  score: entry.score,
  matchedSignals: entry.matchedSignals,
})

const writeSuggestWarnings = (warnings: readonly string[], json: boolean): void => {
  if (json) {
    return
  }

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`)
  }
}

const writeSuggestVerboseMeta = (result: SuggestAgentsResult, verbose: boolean): void => {
  if (!verbose) {
    return
  }

  process.stderr.write(`index: ${result.indexUrl}\n`)
  process.stderr.write(`updated: ${formatCatalogUpdatedAt(result.updatedAt)}\n`)
  process.stderr.write(`signals: ${result.signals.length}\n`)
  process.stderr.write(`matches: ${result.suggestions.length}\n`)
}

const writeSuggestJsonResults = (result: SuggestAgentsResult): void => {
  process.stdout.write(
    `${JSON.stringify({
      indexUrl: result.indexUrl,
      updatedAt: result.updatedAt,
      warnings: result.warnings,
      suggestions: result.suggestions.map((entry) => suggestionToJsonFields(entry)),
    })}\n`,
  )
}

const writeSuggestTextResults = (result: SuggestAgentsResult): void => {
  if (result.suggestions.length === 0) {
    process.stdout.write('No package suggestions matched your project metadata.\n')
    return
  }

  for (const entry of result.suggestions) {
    const line = `${entry.score}\t${entry.pkg.id}@${entry.pkg.latest}\t${truncateDescription(entry.pkg.description)}\n`
    process.stdout.write(line)
  }
}

const parseLimitOption = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    const error = new Error('Invalid --limit value; expected a positive integer')
    error.name = 'InvalidUsageError'
    throw error
  }

  return parsed
}

const handleInvalidUsageError = (error: Error, json: boolean): never => {
  if (json) {
    process.stderr.write(
      `${JSON.stringify({
        error: { code: 'invalid_usage', message: error.message },
      })}\n`,
    )
  } else {
    process.stderr.write(`${error.message}\n`)
  }
  process.exit(2)
}

export const registerSuggestAgentsCommand = (program: Command): void => {
  program
    .command('suggest-agents')
    .alias('suggest')
    .description('Suggest registry packages from project metadata')
    .option('--limit <n>', 'Maximum number of suggestions', '10')
    .action(async function suggestAgentsAction(
      this: Command,
      options: SuggestAgentsCommandOptions,
    ) {
      const globals = getCliGlobals()
      const rootOpts = this.optsWithGlobals<{ yes?: boolean }>()

      try {
        const limit = parseLimitOption(options.limit)
        if (limit !== undefined && limit <= 0) {
          const error = new Error('Invalid --limit value; expected a positive integer')
          error.name = 'InvalidUsageError'
          throw error
        }

        const service = new SuggestAgentsService()
        const result = await service.run({
          yes: rootOpts.yes ?? globals.yes ?? false,
          limit,
        })

        writeSuggestWarnings(result.warnings, globals.json)
        writeSuggestVerboseMeta(result, globals.verbose)

        if (globals.json) {
          writeSuggestJsonResults(result)
          return
        }

        writeSuggestTextResults(result)
      } catch (error) {
        if (error instanceof Error && error.name === 'InvalidUsageError') {
          return handleInvalidUsageError(error, globals.json)
        }

        handleCliError(error)
      }
    })
}
