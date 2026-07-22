import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import AdmZip from 'adm-zip'

import type { InstallTargetId } from '../../registry/domain/package.js'
import { InstallRuntimeError, InstallZipSecurityError } from '../domain/installErrors.js'
import { hasTraversalPattern, mapZipEntryToExtractPath } from './targetExtractPaths.js'
import { scanTargetArtifactZipBuffer } from './zipSecurityScanner.js'

export const extractPackageArtifact = async (
  zipBytes: Buffer,
  targetId: InstallTargetId,
  version: string,
  extractRoot: string,
): Promise<void> => {
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

  for (const entry of zip.getEntries()) {
    const name = entry.entryName
    if (name.endsWith('/')) {
      continue
    }

    const mappedName = mapZipEntryToExtractPath(targetId, name)
    if (hasTraversalPattern(mappedName)) {
      throw new InstallRuntimeError('path_traversal', `Refusing to extract unsafe path: ${mappedName}`)
    }

    const destination = path.resolve(resolvedRoot, mappedName)
    if (!destination.startsWith(resolvedRoot + path.sep) && destination !== resolvedRoot) {
      throw new InstallRuntimeError('path_traversal', `Refusing to extract outside root: ${mappedName}`)
    }

    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, entry.getData())
  }
}
