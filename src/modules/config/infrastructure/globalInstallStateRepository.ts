import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GlobalInstallStateDocument } from '../domain/agentsGlobalState.js'
import { AGENTS_GLOBAL_STATE_FILENAME } from '../domain/configConstants.js'
import { ConfigParseError } from '../domain/configErrors.js'
import { parseJsonDocument, stringifyJsonDocument } from './jsonDocument.js'

export class GlobalInstallStateRepository {
  async readRaw(statePath: string): Promise<Record<string, unknown> | null> {
    let content: string
    try {
      content = await readFile(statePath, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        return null
      }
      throw error
    }

    try {
      return parseJsonDocument(content, AGENTS_GLOBAL_STATE_FILENAME)
    } catch (error) {
      if (error instanceof ConfigParseError) {
        throw error
      }
      throw new ConfigParseError(`${AGENTS_GLOBAL_STATE_FILENAME} contains invalid JSON`)
    }
  }

  async write(statePath: string, document: GlobalInstallStateDocument): Promise<void> {
    const serializable = sortStatePackages(document)
    await mkdir(path.dirname(statePath), { recursive: true })
    await writeFile(statePath, stringifyJsonDocument(serializable), 'utf8')
  }
}

const sortStatePackages = (document: GlobalInstallStateDocument): Record<string, unknown> => {
  const sortedPackageKeys = Object.keys(document.packages).sort((left, right) =>
    left.localeCompare(right),
  )
  const packages: Record<string, unknown> = {}
  for (const key of sortedPackageKeys) {
    const entry = document.packages[key]
    packages[key] = {
      version: entry.version,
      target: entry.target,
      integrity: entry.integrity,
      artifact: entry.artifact,
    }
  }

  return {
    stateVersion: document.stateVersion,
    resolvedRef: document.resolvedRef,
    packages,
  }
}

const isEnoent = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
