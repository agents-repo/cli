import type { InstallTargetId } from '../../registry/domain/package.js'

export const formatMissingByTargetSlotMessage = (
  packageId: string,
  targetId: InstallTargetId,
): string => `${packageId}: missing byTarget slot for configured target ${targetId}`
