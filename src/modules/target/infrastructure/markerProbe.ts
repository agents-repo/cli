import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'

import type { TargetMarkerProbe } from '../domain/markerProbe.js'

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => {
  return typeof error === 'object' && error !== null && 'code' in error
}

const statExists = async (
  absolutePath: string,
  predicate: (stats: Stats) => boolean,
): Promise<boolean> => {
  try {
    const stats = await fs.stat(absolutePath)
    return predicate(stats)
  } catch (error) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false
    }

    if (isNodeError(error) && error.code === 'EACCES') {
      return false
    }

    throw error
  }
}

export const createMarkerProbe = (): TargetMarkerProbe => ({
  isDirectory: (absolutePath: string) =>
    statExists(absolutePath, (stats) => stats.isDirectory()),
  isFile: (absolutePath: string) => statExists(absolutePath, (stats) => stats.isFile()),
})

export const defaultMarkerProbe = createMarkerProbe()
