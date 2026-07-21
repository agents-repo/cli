import { readFile, writeFile } from 'node:fs/promises'

import { AGENTS_LOCK_FILENAME } from '../domain/configConstants.js'
import { ConfigParseError } from '../domain/configErrors.js'
import type { AgentsLockDocument } from '../domain/agentsLock.js'
import { parseJsonDocument, stringifyJsonDocument } from './jsonDocument.js'

export class AgentsLockRepository {
  async readRaw(lockPath: string): Promise<Record<string, unknown> | null> {
    let content: string
    try {
      content = await readFile(lockPath, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        return null
      }
      throw error
    }

    try {
      return parseJsonDocument(content, AGENTS_LOCK_FILENAME)
    } catch (error) {
      if (error instanceof ConfigParseError) {
        throw error
      }
      throw new ConfigParseError(`${AGENTS_LOCK_FILENAME} contains invalid JSON`)
    }
  }

  async write(lockPath: string, document: AgentsLockDocument): Promise<void> {
    const serializable = sortLockPackages(document)
    await writeFile(lockPath, stringifyJsonDocument(serializable), 'utf8')
  }
}

const sortLockPackages = (document: AgentsLockDocument): Record<string, unknown> => {
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
    lockfileVersion: document.lockfileVersion,
    resolvedRef: document.resolvedRef,
    packages,
  }
}

const isEnoent = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
