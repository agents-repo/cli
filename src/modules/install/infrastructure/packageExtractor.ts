import { lstat, mkdir, rm, writeFile } from 'node:fs/promises'
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

const isEnoentError = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const assertNoSymlinksAlongPath = async (
  resolvedRoot: string,
  destination: string,
): Promise<void> => {
  const relativeParts = path.relative(resolvedRoot, path.resolve(destination)).split(path.sep).filter(Boolean)
  let current = resolvedRoot

  for (const part of relativeParts) {
    current = path.join(current, part)
    try {
      const stats = await lstat(current)
      if (stats.isSymbolicLink()) {
        throw new InstallRuntimeError('path_traversal', `Refusing to extract through symlink: ${current}`)
      }
    } catch (error) {
      if (isEnoentError(error)) {
        return
      }

      throw error
    }
  }
}

const hasTraversalSegment = (name: string): boolean => {
  return name.indexOf('..') !== -1 && name.split('/').includes('..')
}

const resolveSafeArchiveDestination = (
  resolvedRoot: string,
  entryName: string,
  targetId: InstallTargetId,
): string => {
  if (hasTraversalSegment(entryName)) {
    throw new InstallRuntimeError('path_traversal', `Refusing to extract unsafe archive entry: ${entryName}`)
  }

  assertZipEntryPathSafe(entryName)

  const mappedName = mapZipEntryToExtractPath(targetId, entryName)
  if (hasTraversalSegment(mappedName)) {
    throw new InstallRuntimeError('path_traversal', `Refusing to extract unsafe mapped path: ${mappedName}`)
  }

  return resolveContainedExtractPath(resolvedRoot, mappedName)
}

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

      const destination = resolveSafeArchiveDestination(resolvedRoot, entryName, targetId)

      await assertNoSymlinksAlongPath(resolvedRoot, destination)
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
