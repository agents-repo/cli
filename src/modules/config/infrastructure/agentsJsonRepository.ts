import { readFile, writeFile } from 'node:fs/promises'

import { AGENTS_JSON_FILENAME } from '../domain/configConstants.js'
import { ConfigParseError } from '../domain/configErrors.js'
import type { AgentsConfigDocument } from '../domain/agentsConfig.js'
import { parseJsonDocument, stringifyJsonDocument } from './jsonDocument.js'

export class AgentsJsonRepository {
  async read(configPath: string): Promise<AgentsConfigDocument | null> {
    let content: string
    try {
      content = await readFile(configPath, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        return null
      }
      throw error
    }

    try {
      return parseJsonDocument(content, AGENTS_JSON_FILENAME)
    } catch (error) {
      if (error instanceof ConfigParseError) {
        throw error
      }
      throw new ConfigParseError(`${AGENTS_JSON_FILENAME} contains invalid JSON`)
    }
  }

  async write(configPath: string, document: AgentsConfigDocument): Promise<void> {
    await writeFile(configPath, stringifyJsonDocument(document), 'utf8')
  }
}

const isEnoent = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
