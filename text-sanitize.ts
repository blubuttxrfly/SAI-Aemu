export function sanitizeUnicodeScalars(value: string): string {
  if (!value) return ''

  let sanitized = ''

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1)
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        sanitized += value[index] + value[index + 1]
        index += 1
      } else {
        sanitized += '\uFFFD'
      }
      continue
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      sanitized += '\uFFFD'
      continue
    }

    sanitized += value[index]
  }

  return sanitized
}
