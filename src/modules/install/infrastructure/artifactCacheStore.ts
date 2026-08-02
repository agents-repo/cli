import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const readBlobIfExists = async (blobPath: string): Promise<Buffer | null> => {
  try {
    return await readFile(blobPath)
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null
    }

    throw error
  }
}

export const writeBlobAtomic = async (blobPath: string, bytes: Buffer): Promise<void> => {
  await mkdir(path.dirname(blobPath), { recursive: true })
  const tempPath = `${blobPath}.${process.pid}.${Date.now()}.tmp`

  try {
    await writeFile(tempPath, bytes)
    await rename(tempPath, blobPath)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

export const deleteBlob = async (blobPath: string): Promise<void> => {
  await rm(blobPath, { force: true })
}
