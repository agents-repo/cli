import { ConfigParseError } from '../domain/configErrors.js'

export const parseJsonDocument = (content: string, label: string): Record<string, unknown> => {
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    throw new ConfigParseError(`${label} is empty or whitespace-only`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new ConfigParseError(`${label} contains invalid JSON`)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigParseError(`${label} must be a JSON object`)
  }

  return parsed as Record<string, unknown>
}

export const stringifyJsonDocument = (value: Record<string, unknown>): string => {
  return `${JSON.stringify(value, null, 2)}\n`
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const valuesAreEqual = (left: unknown, right: unknown): boolean => {
  return JSON.stringify(left) === JSON.stringify(right)
}
