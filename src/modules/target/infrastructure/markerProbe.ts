import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'

import type { TargetMarkerProbe } from '../domain/markerProbe.js'
import { isNodeError } from '../domain/nodeErrors.js'

const statExists = async (
  absolutePath: string,
  predicate: (stats: Stats) => boolean,
): Promise<boolean> => {
  try {
    const stats = await stat(absolutePath)
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
