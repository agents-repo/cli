/* eslint-disable security/detect-non-literal-regexp -- ANSI escape bytes are intentional */
const ANSI_ESCAPE_SEQUENCE = new RegExp(
  String.raw`(?:${String.fromCodePoint(0x1b)}|${String.fromCodePoint(0x9b)})\[[0-9;]*[ -/]*[@-~]`,
  'g',
)

const isPrintableTerminalChar = (code: number): boolean => {
  if (code < 0x20 || code === 0x7f) {
    return false
  }

  if (code >= 0x80 && code <= 0x9f) {
    return false
  }

  return true
}

export const stripAnsiEscapeSequences = (value: string): string =>
  value.replace(ANSI_ESCAPE_SEQUENCE, '')

export const sanitizeTerminalText = (value: string): string => {
  const withoutAnsi = stripAnsiEscapeSequences(value)
  return [...withoutAnsi]
    .filter((char) => {
      const code = char.codePointAt(0)
      return code !== undefined && isPrintableTerminalChar(code)
    })
    .join('')
}
