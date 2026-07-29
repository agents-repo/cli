import path from 'node:path'

import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'

import type { InstallTargetId } from '../../registry/domain/package.js'
import { InstallRuntimeError, InstallZipSecurityError } from '../domain/installErrors.js'
import {
  assertZipEntryPathSafe,
  mapZipEntryToExtractPath,
  resolveContainedExtractPath,
} from './targetExtractPaths.js'
import { scanTargetArtifactZipBuffer } from './zipSecurityScanner.js'

export const listMappedZipFileEntries = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
): readonly string[] => {
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

  const mapped: string[] = []

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    if (entryName.endsWith('/')) {
      continue
    }

    if (entryName.indexOf('..') !== -1) {
      throw new InstallRuntimeError(
        'path_traversal',
        `Refusing to read unsafe archive entry: ${entryName}`,
      )
    }

    assertZipEntryPathSafe(entryName)

    const mappedName = mapZipEntryToExtractPath(targetId, entryName)
    if (mappedName.indexOf('..') !== -1) {
      throw new InstallRuntimeError(
        'path_traversal',
        `Refusing to read unsafe mapped path: ${mappedName}`,
      )
    }

    mapped.push(mappedName)
  }

  return mapped
}

export const resolveArtifactExtractPaths = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
): readonly string[] => {
  const resolvedRoot = path.resolve(extractRoot)
  const relativePaths = listMappedZipFileEntries(zipBytes, targetId, version)

  return relativePaths.map((relativePath) =>
    resolveContainedExtractPath(resolvedRoot, relativePath),
  )
}

export const buildZipEntryDigestByMappedPath = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
): ReadonlyMap<string, string> => {
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

  const digests = new Map<string, string>()

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    if (entryName.endsWith('/')) {
      continue
    }

    assertZipEntryPathSafe(entryName)
    const mappedName = mapZipEntryToExtractPath(targetId, entryName)
    const hex = createHash('sha256').update(entry.getData()).digest('hex')
    digests.set(mappedName, hex)
  }

  return digests
}
