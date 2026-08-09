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

export interface ArtifactExtractPlan {
  readonly absolutePaths: readonly string[]
  readonly digestByRelativePath: ReadonlyMap<string, string>
}

const openScannedZip = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
): AdmZip => {
  const issues = scanTargetArtifactZipBuffer(zipBytes, targetId, version)
  const blocking = issues.find((issue) => issue.severity === 'error')
  if (blocking !== undefined) {
    throw new InstallZipSecurityError(blocking.code, blocking.message)
  }

  try {
    return new AdmZip(zipBytes)
  } catch (error) {
    throw new InstallZipSecurityError(
      'ERR_ZIP_MALFORMED_ENTRY',
      `Cannot open ZIP artifact: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const planArtifactExtractFromZip = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
): ArtifactExtractPlan => {
  const zip = openScannedZip(zipBytes, targetId, version)
  const resolvedRoot = path.resolve(extractRoot)
  const digestByRelativePath = new Map<string, string>()
  const absolutePaths: string[] = []

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    if (entryName.endsWith('/')) {
      continue
    }

    if (entryName.includes('..')) {
      throw new InstallRuntimeError(
        'path_traversal',
        `Refusing to read unsafe archive entry: ${entryName}`,
      )
    }

    assertZipEntryPathSafe(entryName)

    const mappedName = mapZipEntryToExtractPath(targetId, entryName)
    if (mappedName.includes('..')) {
      throw new InstallRuntimeError(
        'path_traversal',
        `Refusing to read unsafe mapped path: ${mappedName}`,
      )
    }

    const absolutePath = resolveContainedExtractPath(resolvedRoot, mappedName)
    absolutePaths.push(absolutePath)
    digestByRelativePath.set(
      mappedName,
      createHash('sha256').update(entry.getData()).digest('hex'),
    )
  }

  return {
    absolutePaths,
    digestByRelativePath,
  }
}

export const listMappedZipFileEntries = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
): readonly string[] => {
  const zip = openScannedZip(zipBytes, targetId, version)
  const mapped: string[] = []

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    if (entryName.endsWith('/')) {
      continue
    }

    assertZipEntryPathSafe(entryName)
    mapped.push(mapZipEntryToExtractPath(targetId, entryName))
  }

  return mapped
}

export const resolveArtifactExtractPaths = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
): readonly string[] => {
  return planArtifactExtractFromZip(zipBytes, targetId, version, extractRoot).absolutePaths
}

export const readZipEntryBytesForMappedPath = (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  mappedRelativePath: string,
): Buffer | null => {
  const zip = openScannedZip(zipBytes, targetId, version)

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    if (entryName.endsWith('/')) {
      continue
    }

    assertZipEntryPathSafe(entryName)
    const mappedName = mapZipEntryToExtractPath(targetId, entryName)
    if (mappedName === mappedRelativePath) {
      return entry.getData()
    }
  }

  return null
}
