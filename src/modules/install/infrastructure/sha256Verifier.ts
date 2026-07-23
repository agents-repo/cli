import { createHash } from 'node:crypto'

import { InstallRuntimeError } from '../domain/installErrors.js'

export const verifySha256 = (bytes: Buffer, expectedHex: string): void => {
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== expectedHex) {
    throw new InstallRuntimeError(
      'integrity_mismatch',
      `SHA-256 mismatch: expected ${expectedHex}, got ${digest}`,
    )
  }
}
