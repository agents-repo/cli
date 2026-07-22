import { RegistryFetchError } from '../../registry/domain/errors.js'

export const downloadArtifact = async (
  artifactUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<Buffer> => {
  let response: Response

  try {
    response = await fetch(artifactUrl, {
      signal: options.signal,
      cache: 'no-store',
    })
  } catch (error) {
    throw new RegistryFetchError(
      error instanceof Error ? error.message : 'Unknown artifact download error',
    )
  }

  if (!response.ok) {
    throw new RegistryFetchError(
      `Artifact download failed (${response.status} ${response.statusText})`,
      response.status,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
