import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import AdmZip from 'adm-zip'

import type { InstallTargetId } from '../../registry/domain/package.js'
import { InstallRuntimeError, InstallZipSecurityError } from '../domain/installErrors.js'
import {
  assertZipEntryPathSafe,
  mapZipEntryToExtractPath,
  resolveContainedExtractPath,
} from './targetExtractPaths.js'
import { scanTargetArtifactZipBuffer } from './zipSecurityScanner.js'

export const rollbackExtractedPaths = async (paths: readonly string[]): Promise<void> => {
  for (const filePath of [...paths].reverse()) {
    try {
      await rm(filePath, { force: true })
    } catch {
      // Best-effort rollback when persistence fails after extract.
    }
  }
}

export const extractPackageArtifact = async (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
): Promise<readonly string[]> => {
  const issues = scanTargetArtifactZipBuffer(zipBytes, targetId, version)
  const blocking = issues.find((issue) => issue.severity === 'error')
  if (blocking !== undefined) {
    throw new InstallZipSecurityError(blocking.code, blocking.message)
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBytes)
  } catch (error) {
    throw new InstallZipSecurityError(
      'ERR_ZIP_MALFORMED_ENTRY',
      `Cannot open ZIP artifact: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const resolvedRoot = path.resolve(extractRoot)
  const writtenPaths: string[] = []

  try {
    for (const entry of zip.getEntries()) {
      const entryName = entry.entryName
      if (entryName.endsWith('/')) {
        continue
      }

      if (entryName.indexOf('..') !== -1) {
        throw new InstallRuntimeError(
          'path_traversal',
          `Refusing to extract unsafe archive entry: ${entryName}`,
        )
      }

      assertZipEntryPathSafe(entryName)

      const mappedName = mapZipEntryToExtractPath(targetId, entryName)
      if (mappedName.indexOf('..') !== -1) {
        throw new InstallRuntimeError(
          'path_traversal',
          `Refusing to extract unsafe mapped path: ${mappedName}`,
        )
      }

      const destination = resolveContainedExtractPath(resolvedRoot, mappedName)

      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, entry.getData())
      writtenPaths.push(destination)
    }
  } catch (error) {
    await rollbackExtractedPaths(writtenPaths)
    throw error
  }

  return writtenPaths
}
