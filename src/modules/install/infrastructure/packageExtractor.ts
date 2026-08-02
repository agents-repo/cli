import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

export interface ExtractPackageArtifactOptions {
  /** When true, differing on-disk content is overwritten (version bump or `ci`). */
  readonly overwriteOnMismatch?: boolean
  /** When true with same-version mismatch, overwrite instead of failing (`install --force`). */
  readonly forceSameVersion?: boolean
}

const isEnoentError = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const sha256HexOfBytes = (bytes: Buffer): string => {
  return createHash('sha256').update(bytes).digest('hex')
}

const sha256HexOfFile = async (filePath: string): Promise<string> => {
  const bytes = await readFile(filePath)
  return sha256HexOfBytes(bytes)
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

const assertDestinationWithinRoot = (resolvedRoot: string, destination: string): void => {
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`
  if (destination !== resolvedRoot && !destination.startsWith(rootPrefix)) {
    throw new InstallRuntimeError('path_traversal', `Refusing to extract outside root: ${destination}`)
  }
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

const resolveOnDiskAction = async (options: {
  readonly destination: string
  readonly resolvedRoot: string
  readonly incomingHex: string
  readonly extractOptions: ExtractPackageArtifactOptions
}): Promise<'write' | 'skip'> => {
  const { destination, resolvedRoot, incomingHex, extractOptions } = options
  const overwriteOnMismatch = extractOptions.overwriteOnMismatch === true
  const forceSameVersion = extractOptions.forceSameVersion === true

  try {
    await assertNoSymlinksAlongPath(resolvedRoot, destination)
    const stats = await lstat(destination)
    if (!stats.isFile()) {
      throw new InstallRuntimeError(
        'extract_conflict',
        `Refusing to overwrite non-file path: ${destination}`,
      )
    }

    const onDiskHex = await sha256HexOfFile(destination)
    if (onDiskHex === incomingHex) {
      return 'skip'
    }

    if (overwriteOnMismatch || forceSameVersion) {
      return 'write'
    }

    const relative = path.relative(resolvedRoot, destination).split(path.sep).join('/')
    throw new InstallRuntimeError(
      'extract_modified',
      `Modified file (use --force to overwrite): ${relative}`,
    )
  } catch (error) {
    if (isEnoentError(error)) {
      return 'write'
    }

    throw error
  }
}

export const extractPackageArtifact = async (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
  extractOptions: ExtractPackageArtifactOptions = {},
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
      assertDestinationWithinRoot(resolvedRoot, destination)

      const entryBytes = entry.getData()
      const incomingHex = sha256HexOfBytes(entryBytes)
      const action = await resolveOnDiskAction({
        destination,
        resolvedRoot,
        incomingHex,
        extractOptions,
      })

      if (action === 'skip') {
        continue
      }

      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, entryBytes)
      writtenPaths.push(destination)
    }
  } catch (error) {
    await rollbackExtractedPaths(writtenPaths)
    throw error
  }

  return writtenPaths
}
