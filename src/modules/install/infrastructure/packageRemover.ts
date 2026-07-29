import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { InstallTargetId } from '../../registry/domain/package.js'
import { InstallRuntimeError } from '../domain/installErrors.js'
import { readZipEntryBytesForMappedPath } from './artifactExtractPaths.js'
import { installTargetPruneBoundary } from './installTargetPruneBoundary.js'

export interface RemoveFilesOptions {
  readonly force?: boolean
}

export interface RemoveFilesResult {
  readonly deletedPaths: readonly string[]
  readonly warnings: readonly string[]
}

const isEnoentError = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export const isBlockingRemoveWarning = (warning: string): boolean => {
  return (
    warning.startsWith('Skipped modified file') ||
    warning.startsWith('Skipped non-file path') ||
    warning.startsWith('Digest missing for path')
  )
}

const sha256HexOfFile = async (filePath: string): Promise<string> => {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

const assertNoSymlinksAlongPath = async (
  resolvedRoot: string,
  destination: string,
): Promise<void> => {
  const relativeParts = path
    .relative(resolvedRoot, path.resolve(destination))
    .split(path.sep)
    .filter(Boolean)
  let current = resolvedRoot

  for (const part of relativeParts) {
    current = path.join(current, part)
    try {
      const stats = await lstat(current)
      if (stats.isSymbolicLink()) {
        throw new InstallRuntimeError('path_traversal', `Refusing to remove through symlink: ${current}`)
      }
    } catch (error) {
      if (isEnoentError(error)) {
        return
      }

      throw error
    }
  }
}

const pruneEmptyParents = async (
  filePath: string,
  extractRoot: string,
  targetId: InstallTargetId,
): Promise<void> => {
  const boundary = path.resolve(extractRoot, installTargetPruneBoundary(targetId))
  let current = path.dirname(path.resolve(filePath))

  const resolvedRoot = path.resolve(extractRoot)
  while (current !== resolvedRoot && current.startsWith(resolvedRoot + path.sep)) {
    if (current === boundary) {
      break
    }

    try {
      await rmdir(current)
    } catch {
      break
    }

    current = path.dirname(current)
  }
}

export const removeInstalledFiles = async (
  filePaths: readonly string[],
  extractRoot: string,
  targetId: InstallTargetId,
  expectedHexByRelativePath: ReadonlyMap<string, string>,
  options: RemoveFilesOptions = {},
): Promise<RemoveFilesResult> => {
  const force = options.force === true
  const warnings: string[] = []
  const deletedPaths: string[] = []
  const resolvedRoot = path.resolve(extractRoot)

  for (const absolutePath of filePaths) {
    const relative = path.relative(resolvedRoot, absolutePath).split(path.sep).join('/')
    const expectedHex = expectedHexByRelativePath.get(relative)

    if (expectedHex === undefined) {
      warnings.push(`Digest missing for path: ${relative}`)
      continue
    }

    try {
      await assertNoSymlinksAlongPath(resolvedRoot, absolutePath)
      const stats = await lstat(absolutePath)
      if (!stats.isFile()) {
        warnings.push(`Skipped non-file path: ${relative}`)
        continue
      }

      if (!force) {
        const actualHex = await sha256HexOfFile(absolutePath)
        if (actualHex !== expectedHex) {
          warnings.push(`Skipped modified file (use --force to delete): ${relative}`)
          continue
        }
      }
    } catch (error) {
      if (isEnoentError(error)) {
        warnings.push(`File already absent: ${relative}`)
        continue
      }

      throw error
    }

    await rm(absolutePath, { force: true })
    deletedPaths.push(absolutePath)
    await pruneEmptyParents(absolutePath, resolvedRoot, targetId)
  }

  return { deletedPaths, warnings }
}

export interface RestoreRemovedSlotInput {
  readonly zipBytes: Buffer
  readonly targetId: InstallTargetId
  readonly version: string
  readonly extractRoot: string
  readonly deletedPaths: readonly string[]
}

export const restoreRemovedSlotFiles = async (input: RestoreRemovedSlotInput): Promise<void> => {
  const resolvedRoot = path.resolve(input.extractRoot)

  for (const absolutePath of input.deletedPaths) {
    const relative = path.relative(resolvedRoot, absolutePath).split(path.sep).join('/')
    const entryBytes = readZipEntryBytesForMappedPath(
      input.zipBytes,
      input.targetId,
      input.version,
      relative,
    )

    if (entryBytes === null) {
      throw new InstallRuntimeError(
        'restore_failed',
        `Cannot restore removed file; ZIP entry missing for ${relative}`,
      )
    }

    await assertNoSymlinksAlongPath(resolvedRoot, absolutePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, entryBytes, { flag: 'w' })
  }
}

export const rollbackRemovedSlots = async (
  slots: readonly RestoreRemovedSlotInput[],
): Promise<void> => {
  for (const slot of [...slots].reverse()) {
    try {
      await restoreRemovedSlotFiles(slot)
    } catch {
      // Best-effort rollback when a later slot or persistence fails.
    }
  }
}
